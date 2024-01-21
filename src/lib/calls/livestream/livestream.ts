import EventListenerBase from '../../../helpers/eventListenerBase';
import pause from '../../../helpers/schedulers/pause';
import {GroupCall, GroupCallStreamChannel, InputGroupCall} from '../../../layer';
import {AppManagers} from '../../appManagers/managers';
import rootScope from '../../rootScope';


class LiveStreamSource {
  public current_chunk: number;

  constructor(private managers: AppManagers, public stream: LiveStream, private channels: GroupCallStreamChannel[]) {
    console.log('STREAM Started source', channels)
    this.current_chunk = 0;
    this.managers = rootScope.managers
  }

  async run() {
    const dcId = (this.stream.groupCallFull._ == 'groupCall') ? this.stream.groupCallFull.stream_dc_id : 0;

    const channel = 1
    const quality = 2
    const last_time = Number(this.channels[channel].last_timestamp_ms);

    while(!this.stream.closed) {
      await pause(1000);
      // const download = await this.managers.apiFileManager.download({
      //   location: {
      //     _: 'inputGroupCallStream',
      //     call: this.stream.groupCall,
      //     scale: 0, // 1000ms
      //     time_ms: last_time + this.current_chunk * 1000,
      //     video_quality: quality,
      //     video_channel: channel
      //     // flags:
      //   },
      //   dcId
      // })

      // // Lemme imagine this is real
      // // this.isLive = true;

      // console.log('STREAM DOWNLOAD', download)
      // const arbuf = await download.arrayBuffer();
      // console.log( 'stream buf', arbuf)
    }
  }
}

export class LiveStream extends EventListenerBase<{
  closed: ()=>void
  fullUpdate: (call: GroupCall) => void
}> {
  protected managers: AppManagers
  public groupCall: InputGroupCall
  public groupCallFull: GroupCall
  public closed: boolean;
  private fullUpdaterInterval: number

  constructor(public peerId: PeerId, call?: InputGroupCall) {
    super()
    this.closed = false;
    this.managers = rootScope.managers
    if(call) {
      this.groupCall = call
    } else {
      this.groupCall = {
        _: 'inputGroupCall',
        id: '',
        access_hash: ''
      }
    }
    this.addEventListener('closed', () => this.closed = true, {once: true})
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

  async streamIntoVideo() {
    let fail = false
    while(!this.closed) {
      if(fail) await pause(500);
      const channels: GroupCallStreamChannel[] = await this.managers.appGroupCallsManager.getStreamChannels(this.groupCall);
      if(channels.length == 0) {
        fail = true;
        continue
      }

      fail = false;

      const source = new LiveStreamSource(this.managers, this, channels)
      try {
        await source.run()
      } catch(e) {
        console.error('LiveStream source failed', e)
        fail = true
      }
    }
  }
}
