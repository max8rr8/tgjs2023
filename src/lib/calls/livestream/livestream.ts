import {IS_SAFARI} from '../../../environment/userAgent';
import EventListenerBase from '../../../helpers/eventListenerBase';
import pause from '../../../helpers/schedulers/pause';
import {GroupCall, GroupCallStreamChannel, InputFileLocation, InputGroupCall} from '../../../layer';
import {AppManagers} from '../../appManagers/managers';
import {LogTypes, logger} from '../../logger';
import {DownloadOptions} from '../../mtproto/apiFileManager';
import rootScope from '../../rootScope';
import {createOpusWebmCluster, createOpusWebmInit} from './encodeOpusWebm';
import {loadMP4Chunk} from './mp4';
import {loadChunk} from './tgchunks';

const OPUS_FORCE_MONO = IS_SAFARI

function submitSourceBuffer(s: SourceBuffer, b: ArrayBuffer) {
  const pr = new Promise<void>(resolve=>s.addEventListener('updateend', ()=>resolve()))
  s.appendBuffer(b)
  return pr
}

class LiveStreamSource {
  private chunkStep: number
  private nextchunkTime: number
  private chunkLocation: InputFileLocation.inputGroupCallStream
  private dcId: number
  private channel: GroupCallStreamChannel
  public quality: number
  public log: ReturnType<typeof logger>;

  public video: HTMLVideoElement
  public mediaSource: MediaSource
  private videoSource: SourceBuffer
  private audioSource: SourceBuffer | undefined
  private msInit: boolean;

  public localVideoTime: number;
  public currenQuality: number;

  constructor(
    private managers: AppManagers,
    public stream: LiveStream,
    private channels: GroupCallStreamChannel[]
  ) {
    this.log = stream.log
    this.nextchunkTime = performance.now() - 1200 // BUFFER 2 chunks

    this.channel = this.channels.filter((e) => e.scale >= 0).find(e=>e.channel == 1)
    this.chunkStep = 1000 >> channels[0].scale
    this.managers = rootScope.managers

    this.localVideoTime = 0

    this.chunkLocation = {
      _: 'inputGroupCallStream',
      call: this.stream.groupCall,
      scale: this.channel.scale,
      time_ms: Number(this.channel.last_timestamp_ms) - 2000,
      video_quality: 2,
      video_channel: this.channel.channel
    }
    this.dcId = this.stream.groupCallFull._ == 'groupCall' ? this.stream.groupCallFull.stream_dc_id : 0;
    this.log('Started source')
  }

  updateQuality(fetchTime: number) {
    // For some reasons there are only two states

    // if(fetchTime > 850 && this.chunkLocation.video_quality > 1)
    //   this.chunkLocation.video_quality--

    // if(fetchTime < 350 && this.chunkLocation.video_quality < 2)
    //   this.chunkLocation.video_quality++
  }

  async createMediaSource(video: HTMLVideoElement) {
    this.video = video
    this.mediaSource = new MediaSource()
    this.msInit = false
    video.src = window.URL.createObjectURL(this.mediaSource)
    await new Promise<void>((resolve) =>
      this.mediaSource.addEventListener('sourceopen', () => resolve())
    )
    this.videoSource = this.mediaSource.addSourceBuffer('video/mp4; codecs="avc1.64001f";')

    this.audioSource = this.mediaSource.addSourceBuffer('audio/webm; codecs="opus";')
    this.audioSource.mode = 'sequence'
  }

  async addMp4Frag(frag: Uint8Array, time: number) {
    const {videoBufs, videoInit, audioSamples} = await loadMP4Chunk(frag.buffer, time)

    if(!this.msInit) {
      this.msInit = true
      await submitSourceBuffer(this.videoSource, videoInit)
      if(this.audioSource)
        await submitSourceBuffer(this.audioSource, new Uint8Array(createOpusWebmInit(OPUS_FORCE_MONO)).buffer)
      this.video.play()
    }

    for(const vbuf of videoBufs) {
      await submitSourceBuffer(this.videoSource, vbuf);
    }

    if(this.audioSource)
      await submitSourceBuffer(this.audioSource, new Uint8Array(createOpusWebmCluster(audioSamples, time, OPUS_FORCE_MONO)))
  }

  async run() {
    this.log('Started to run')
    while(!this.stream.closed) {
      const current_time = performance.now()
      if(current_time < this.nextchunkTime) {
        await pause(this.nextchunkTime - current_time)
      }
      if(this.stream.closed) return;

      const chunkStartTime = performance.now()
      const download = await this.managers.apiFileManager.download({
        location: this.chunkLocation,
        dcId: this.dcId,
        noCache: true
      })

      if(!this.stream.isLive) this.stream.updateLive(true)
      const chunkFetchTime=  performance.now() - chunkStartTime;
      this.updateQuality(chunkFetchTime)

      const rawChunk = new Uint8Array(await download.arrayBuffer());
      const chunk = loadChunk(rawChunk)
      for(const event of chunk.events) {
        await this.addMp4Frag(rawChunk.slice(
          event.data.byteOffset,
          event.data.byteOffset + event.data.byteLength
        ), this.localVideoTime)
      }

      this.log(
        'Fetched livestream chunk momemnt:', this.chunkLocation.time_ms,
        'fetchTime:', chunkFetchTime,
        'fullTime:', performance.now() - chunkStartTime,
        'quality: ', this.chunkLocation.video_quality,
        'size:', download.size
      )

      this.localVideoTime += this.chunkStep
      this.nextchunkTime += this.chunkStep
      this.chunkLocation.time_ms = Number(this.chunkLocation.time_ms) + this.chunkStep
    }
  }
}

export class LiveStream extends EventListenerBase<{
  closed: ()=>void
  fullUpdate: (call: GroupCall) => void
  live: (isLive: boolean)=>void
}> {
  protected managers: AppManagers
  public groupCall: InputGroupCall
  public groupCallFull: GroupCall
  public closed: boolean;
  public isLive: boolean
  private fullUpdaterInterval: number
  public log: ReturnType<typeof logger>;

  constructor(public peerId: PeerId, call?: InputGroupCall | GroupCall) {
    super()

    this.log = logger('STREAM', LogTypes.Log | LogTypes.Warn | LogTypes.Debug | LogTypes.Error);

    this.closed = false;
    this.managers = rootScope.managers
    if(call) {
      this.groupCall = {
        _: 'inputGroupCall',
        id: call.id,
        access_hash: call.access_hash
      }
    } else {
      this.groupCall = {
        _: 'inputGroupCall',
        id: '',
        access_hash: ''
      }
    }
    this.addEventListener('closed', () => this.closed = true, {once: true})
  }

  updateLive(isLive: boolean) {
    this.isLive = isLive
    this.dispatchEvent('live', isLive)
  }

  async join() {
    if(this.groupCall.id == '') {
      const groupCall = await this.managers.appGroupCallsManager.createGroupCall(this.peerId.toChatId(), {
        rtmpStream: true
      })
      this.groupCall = {
        _: 'inputGroupCall',
        access_hash: groupCall.access_hash,
        id: groupCall.id
      }
    }

    const rtc_data = `{
      "fingerprints":[],
      "pwd":"",
      "ssrc":${Math.floor(Math.random() * 0xffffffff)},
      "ssrc-groups":[],
      "ufrag":""
    }`

    const joinInfo = await this.managers.appGroupCallsManager.joinGroupCall(this.groupCall.id, {
      _: 'dataJSON',
      data: rtc_data
    }, {
      type: 'main'
    })

    await this.updateFullGroupCall()
    this.fullUpdaterInterval = window.setInterval(()=>this.updateFullGroupCall(), 1e3);

    console.error('LIVESTREAM', joinInfo)
  }

  async leave(finish = false) {
    this.closed = true
    clearInterval(this.fullUpdaterInterval)
    await this.managers.appGroupCallsManager.hangUp(this.groupCall.id, finish ? true : 0)
    this.dispatchEvent('closed')
  }

  async updateFullGroupCall() {
    this.groupCallFull = await this.managers.appGroupCallsManager.getGroupCallFull(this.groupCall.id);
    if(this.groupCallFull._ == 'groupCall' && this.groupCallFull.participants_count < 1) {
      this.groupCallFull.participants_count = 1
    }
    this.dispatchEvent('fullUpdate', this.groupCallFull)
  }

  async getInvite() {
    return this.managers.apiManager.invokeApi('phone.exportGroupCallInvite', {
      can_self_unmute: false,
      call: this.groupCall
    })
  }

  async getURLAndKey() {
    return this.managers.appGroupCallsManager.getURLAndKey(this.peerId, false)
  }

  async streamIntoVideo(video: HTMLVideoElement) {
    let fail = false
    while(!this.closed) {
      this.updateLive(false)
      if(fail) await pause(500);
      if(this.closed) return

      const channels: GroupCallStreamChannel[] = await this.managers.appGroupCallsManager.getStreamChannels(this.groupCall);
      if(channels.length == 0 || Number(channels[0].last_timestamp_ms) < 5000) {
        fail = true;
        continue
      }

      fail = false;

      const source = new LiveStreamSource(this.managers, this, channels)
      source.createMediaSource(video)
      try {
        await source.run()
      } catch(e) {
        console.error('LiveStream source failed', e)
        fail = true
      }
      this.updateLive(false)
    }
  }
}
