
class DataParse extends DataView {
  public pos: number

  constructor(v: ArrayBuffer | DataView) {
    if(v instanceof ArrayBuffer) {
      super(v)
    } else {
      super(v.buffer, v.byteOffset, v.byteLength);
    }
    this.pos = 0
  }

  take(n: number) {
    const prev = this.pos
    this.pos += n
    return prev
  }

  takeUint8() {
    return this.getUint8(this.take(1))
  }

  takeUint32(littleEndian?: boolean) {
    return this.getUint32(this.take(4), littleEndian)
  }

  takeInt32(littleEndian?: boolean) {
    return this.getInt32(this.take(4), littleEndian)
  }

  takeTGSerializedString(): string {
    const tmp = this.takeUint8()
    let length = 0
    let paddingBytes = 0

    if(tmp == 254) {
      for(let i = 0; i < 3; i++) {
        length = (length << 8) | this.takeUint8()
        paddingBytes = roundUp(length, 4) - length
      }
    } else {
      length = tmp
      paddingBytes = roundUp(length + 1, 4) - (length + 1)
    }
    let str = ''
    for(let i = 0; i < length; i++)
      str += String.fromCharCode(this.getUint8(this.pos + i))

    this.take(length)
    this.take(paddingBytes)

    return str
  }

  subview(offsetFromPos: number, size: number): DataView {
    const globOffset = this.byteOffset + this.pos + offsetFromPos;
    return new DataView(this.buffer, globOffset, size)
  }
}

function roundUp(numToRound: number, multiple: number) {
  if(multiple == 0) {
    return numToRound
  }

  const remainder = numToRound % multiple
  if(remainder == 0) {
    return numToRound
  }

  return numToRound + multiple - remainder
}

type VideoPartEvent = {
  offsetValue: number,
  endpointId: string,
  rotation: number,
  extra: number
}

type VideoPartEventWithData = VideoPartEvent & {data: DataView};

export function takeVideoEvent(parse: DataParse): VideoPartEvent {
  return {
    offsetValue: parse.takeUint32(true),
    endpointId: parse.takeTGSerializedString(),
    rotation: parse.takeUint32(true),
    extra: parse.takeUint32(true)
  }
}

type Chunk = {
  container: 'mp4',
  activeMask: number,
  eventCount: number,
  events: VideoPartEventWithData[];
}

export function loadChunk(chunk: Uint8Array): Chunk {
  const parse = new DataParse(chunk.buffer)

  const signature = parse.takeUint32(true)
  if(signature !== 0xa12e810d) throw new Error('Invalid stream chunk signature')

  const container = parse.takeTGSerializedString()
  if(container != 'mp4') throw new Error(`Unknown stream container ${container}`)

  const activeMask = parse.takeUint32(true)
  const eventCount = parse.takeUint32(true)

  const events: VideoPartEvent[] = []
  for(let i = 0; i < eventCount; i++) {
    events.push(takeVideoEvent(parse));
  }

  const eventsData: VideoPartEventWithData[] = [];


  for(let i = 0; i < eventCount; i++) {
    const curStart = events[i].offsetValue;
    const nextStart = (i == eventCount - 1) ? (parse.byteLength - parse.pos) : (events[i + 1].offsetValue - 1);
    eventsData.push({
      ...events[i],
      data: parse.subview(curStart, nextStart - curStart)
    });
  }


  return {
    container,
    activeMask,
    eventCount,
    events: eventsData
  }
}
