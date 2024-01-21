import {AudioSample} from './encodeOpusWebm'
import type {MP4BOXFILE, MP4BOXINFO} from '../../../vendor/mp4box.all'

let createFile: ()=>MP4BOXFILE = undefined;

export async function loadMP4Chunk(videoDat: ArrayBuffer, time: number): Promise<{
  videoInit: ArrayBuffer,
  videoBufs: ArrayBuffer[],
  audioSamples: AudioSample[]
}> {
  if(!createFile) createFile = (await import('../../../vendor/mp4box.all')).createFile;

  const mp4boxfile = createFile()
  const info: MP4BOXINFO = await new Promise((resolve) => {
    mp4boxfile.onReady = (info) => resolve(info)

    mp4boxfile.appendBuffer(
      Object.assign(videoDat, {
        fileStart: 0
      })
    )
    mp4boxfile.flush()
  })

  const videoTrack = info.videoTracks[0]
  const videoBufsPromise = new Promise<ArrayBuffer[]>((resolve) => {
    const segments: ArrayBuffer[] = []
    mp4boxfile.onSegment = function(id, user, buffer, sampleNumber, last) {
      segments.push(buffer)
      if(last) resolve(segments)
    }
  })
  mp4boxfile.getTrackById(videoTrack.id).first_dts = -time * videoTrack.timescale / 1000
  mp4boxfile.setSegmentOptions(videoTrack.id, 123123, {})
  const initSegments = mp4boxfile.initializeSegmentation()

  const audioTrack = info.audioTracks[0]
  const audioSamplesPromise = new Promise<AudioSample[]>((resolve)=>{
    mp4boxfile.onSamples = function(id, user, buffer) {
      resolve(buffer.map(e=>({
        data: [...e.data],
        cts: e.cts,
        timescale: e.timescale
      })))
    }
  })
  mp4boxfile.setExtractionOptions(audioTrack.id, 1123, {
    nbSamples: Infinity
  })

  mp4boxfile.start()

  const [videoBufs, audioSamples] = await Promise.all([videoBufsPromise, audioSamplesPromise]);

  return {
    videoInit: initSegments[0].buffer,
    videoBufs, audioSamples
  }
}
