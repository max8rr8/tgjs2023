// PARTIAL DEFINITIONS FOR mp4box js

export type MP4BOXTRAK = {
  id: number;
  first_dts: number;
  timescale: number;
}

export type MP4BOXINFO = {
  tracks: MP4BOXTRAK[],
  videoTracks: MP4BOXTRAK[],
  audioTracks: MP4BOXTRAK[],
}


type MP4BOXFILE = {
  onReady: (info: MP4BOXINFO) => void
  onSegment: (id: number, user: number, buffer: ArrayBuffer, sampleNumber: number, last: boolean) => void
  onSamples: (id: number, user: number, buffer: {
    data: Uint8Array,
    cts: number,
    timescale: number,
  }[]) => void

  getTrackById: (id: number) => MP4BOXTRAK;
  
  setExtractionOptions(id: number, user:number, options: {
    nbSamples?: number
  })

  setSegmentOptions(id: number, user:number, options: {
    nbSamples?: number
  })

  initializeSegmentation(): {
    id: number,
    buffer: ArrayBuffer,
    user: number
  }[];

  start(): void;

  appendBuffer(a: ArrayBuffer & { fileStart: number }): void
  flush(): void;
}

export type MP4BOX = {
  createFile: ()=>MP4BOXFILE;
}

export const createFile: ()=>MP4BOXFILE;