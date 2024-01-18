// Handle chromium bug related to bad aac extra data
// https://bugs.chromium.org/p/chromium/issues/detail?id=1250841

import {IS_CHROMIUM} from '../../environment/userAgent';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';

function dataViewReadString(
  dview: DataView,
  offset: number,
  size: number
): string {
  let res = ''
  for(let i = 0; i < size; i++)
    res += String.fromCharCode(dview.getUint8(offset + i))
  return res
}

function dataViewGetSubView(dview: DataView, offset: number, size: number) {
  return new DataView(dview.buffer, dview.byteOffset + offset, size)
}

type Box = {
  type: string
  dview: DataView
}

function readBoxes(dview: DataView, offset = 0): Box[] {
  const boxes: Box[] = []
  while(offset < dview.byteLength) {
    const size = dview.getUint32(offset, false)
    const type = dataViewReadString(dview, offset + 4, 4)

    boxes.push({
      type,
      dview: dataViewGetSubView(dview, offset, size)
    })

    offset += size
  }
  return boxes
}

function increseBoxesSize(dviews: DataView[], size: number) {
  for(const dview of dviews) {
    const old = dview.getUint32(0, false)
    dview.setUint32(0, old + size, false)
  }
}

type ReplaceInfo = {
  from: number
  size: number
  newdata: Uint8Array
  increase: number
}

const SAMPLING_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350
]

function fixupDecoderSpecificInfo(decinfoArr: number[]) {
  let decinfo = ''
  for(const e of decinfoArr) decinfo += e.toString(2).padStart(8, '0')

  let offset = 0
  const readBits = (n: number) => {
    offset += n
    return decinfo.slice(offset - n, offset)
  }

  let objectType = readBits(5)
  if(objectType == '11111') objectType = '11111' + readBits(6)

  let sampleRateBS = readBits(4)
  let sampleRate = parseInt(sampleRateBS, 2)
  if(sampleRateBS == '1111') {
    const customRate = readBits(24)
    sampleRateBS += customRate
    sampleRate = parseInt(customRate, 2)
  } else {
    sampleRate = SAMPLING_RATES[sampleRate]
  }

  const chanConfig = readBits(4)

  const restOfInfo = decinfo.slice(offset)

  // New sampleRate two times higher than previous one
  const newSampleRate = sampleRate * 2
  const newSampleRateBS = SAMPLING_RATES.indexOf(newSampleRate)
  .toString(2)
  .padStart(4, '0')
  if(sampleRateBS == '00-1') {
    sampleRateBS = '1111' + newSampleRate.toString(2).padStart(2)
  }

  let newDecinfo = '11101' + sampleRateBS + chanConfig
  newDecinfo += newSampleRateBS + objectType + restOfInfo

  const newArr: number[] = []
  while(newDecinfo.length % 8 != 0) newDecinfo += '0'

  for(let i = 0; i < newDecinfo.length; i += 8) {
    newArr.push(Number.parseInt(newDecinfo.slice(i, i + 8), 2))
  }
  return newArr
}

function fixupEsds(esds: number[]): number[] {
  let newEsds: number[] = []

  const type = esds.shift() ?? 0
  let byteRead = 0x80
  let size = 0
  while(byteRead & 0x80) {
    byteRead = esds.shift() ?? 0
    size = (size << 7) | (byteRead & 0x7f)
  }
  const ourBlock = esds.splice(0, size)

  if(type == 3) {
    // copy ES_ID
    newEsds = newEsds.concat(ourBlock.splice(0, 3));
    const flags = newEsds[newEsds.length-1]

    // Copy URL
    if(flags & 0x40) {
      const len = ourBlock.unshift() ?? 0
      newEsds = newEsds.concat(len, ourBlock.splice(0, len))
    }

    // Copy OCR_ES_ID
    if(flags & 0x20) {
      newEsds = newEsds.concat(ourBlock.splice(0, 2));
    }
  } else if(type == 4) {
    newEsds = newEsds.concat(ourBlock.splice(0, 13))
  } else if(type == 5) {
    const decoderSpecificInfo: number[] = ourBlock.splice(0, size)
    newEsds = newEsds.concat(fixupDecoderSpecificInfo(decoderSpecificInfo))
  } else {
    newEsds = newEsds.concat(ourBlock.splice(0, size))
  }

  while(ourBlock.length > 0) {
    newEsds = newEsds.concat(fixupEsds(ourBlock))
  }

  size = newEsds.length
  for(let i = 0; i < 4; i++) {
    let sizePart = size & 0x7f
    size >>= 7
    if(i != 0) sizePart |= 0x80
    newEsds.unshift(sizePart)
  }
  newEsds.unshift(type)
  return newEsds
}

function fixupTrak(trak: Box): ReplaceInfo | null {
  // STAGE 1: Find esds block
  const trakBoxes = readBoxes(trak.dview, 8)
  const mdia = trakBoxes.find((e) => e.type == 'mdia')
  if(!mdia) {
    console.warn('[MP4FIXER] No MDIA box found')
    return null
  }

  const mdiaBoxes = readBoxes(mdia.dview, 8)
  const hdlr = mdiaBoxes.find((e) => e.type == 'hdlr')
  if(!hdlr) {
    console.warn('[MP4FIXER] No HDLR box found')
    return null
  }
  const hdlrType = dataViewReadString(hdlr.dview, 16, 4)
  if(hdlrType != 'soun') {
    return null
  }

  const minf = mdiaBoxes.find((e) => e.type == 'minf')
  if(!minf) {
    console.warn('[MP4FIXER] No MINF box found')
    return null
  }

  const stbl = readBoxes(minf.dview, 8).find((e) => e.type == 'stbl')
  if(!stbl) {
    console.warn('[MP4FIXER] No stbl box found')
    return null
  }

  const stsd = readBoxes(stbl.dview, 8).find((e) => e.type == 'stsd')
  if(!stsd) {
    console.warn('[MP4FIXER] No stsd box found')
    return null
  }

  const mp4a = readBoxes(stsd.dview, 16).find((e) => e.type == 'mp4a')
  if(!mp4a) {
    console.warn('[MP4FIXER] No mp4a box found')
    return null
  }

  const esds = readBoxes(mp4a.dview, 36).find((e) => e.type == 'esds')
  if(!esds) {
    console.warn('[MP4FIXER] No esds box found')
    return null
  }

  // Stage 2: Parse esds and find DecoderSpecificInfo(5)
  let increase = 0

  const esdsBytes: number[] = []
  for(let i = 12; i < esds.dview.byteLength; i++)
    esdsBytes.push(esds.dview.getUint8(i))

  increase -= esdsBytes.length
  const newEsds = fixupEsds(esdsBytes)
  increase += newEsds.length

  // Stage 4: Update trak boxes sizes
  increseBoxesSize(
    [
      esds.dview,
      mp4a.dview,
      stsd.dview,
      stbl.dview,
      minf.dview,
      mdia.dview,
      trak.dview
    ],
    increase
  )

  // Stage 5: Return replace info so data will be shifted
  return {
    from: esds.dview.byteOffset + 12,
    size: esds.dview.byteLength - 12,
    newdata: new Uint8Array(
      newEsds
    ),
    increase
  }
}

export function fixupChromiumMP4(buf: Uint8Array) {
  const dview = new DataView(buf.buffer)
  const rootBoxes = readBoxes(dview)
  const replaces: ReplaceInfo[] = []
  let newsize = buf.byteLength

  for(const box of rootBoxes) {
    if(box.type == 'moov') {
      const moovBoxes = readBoxes(box.dview, 8)
      for(const mbox of moovBoxes) {
        if(mbox.type == 'trak') {
          const replace = fixupTrak(mbox)
          if(replace) {
            console.error('MP4FIXER patched trak')
            increseBoxesSize([box.dview], replace.increase)
            newsize += replace.increase
            replaces.push(replace)
          }
        }
      }
    }
  }

  const newbuf = new Uint8Array(newsize)
  newbuf.set(buf, 0)

  let curshift = 0
  for(const replace of replaces) {
    newbuf.set(replace.newdata, replace.from + curshift)

    curshift += replace.increase
    newbuf.set(
      buf.slice(replace.from + replace.size),
      replace.from + replace.size + curshift
    )
  }

  return newbuf
}


async function getPatchedVideo(doc: MyDocument): Promise<Uint8Array> {
  const res = await appDownloadManager.downloadMedia({
    media: doc
  }, 'blob')
  const data = await res.arrayBuffer()
  console.error('MAXRR', data)
  return fixupChromiumMP4(new Uint8Array(data));
}

export default function handleChromiumBug1250841(video: HTMLVideoElement, doc: MyDocument) {
  if(IS_CHROMIUM) {
    video.addEventListener('error', (e) => {
      const errmsg = video.error?.message
      if(!errmsg) return;

      if(!errmsg.includes('DECODER_ERROR_NOT_SUPPORTED')) return;
      if(!errmsg.includes('but FFmpeg thinks the file contains')) return;

      e.stopImmediatePropagation()
      getPatchedVideo(doc).then((fixed) => {
        const was_paused = video.paused

        console.error('Handling chromium bug 1250841')

        const blob = new Blob([fixed])
        video.src = URL.createObjectURL(blob)
        video.load()

        if(!was_paused) video.play()
      })
    })
  }
}
