import EventListenerBase from '../../../helpers/eventListenerBase';
import pause from '../../../helpers/schedulers/pause';
import {GroupCall, InputGroupCall} from '../../../layer';
import {AppManagers} from '../../appManagers/managers';
import rootScope from '../../rootScope';

export class LiveStream extends EventListenerBase<{
  closed: ()=>void
  fullUpdate: (call: GroupCall) => void
}> {
  protected managers: AppManagers
  public groupCall: InputGroupCall
  public groupCallFull: GroupCall
  private fullUpdaterInterval: number

  constructor(public peerId: PeerId, call?: InputGroupCall) {
    super()
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
    const channels = await this.managers.appGroupCallsManager.getStreamChannels(this.groupCall);
    console.log('AAAAAA', channels)


    const fullCall = await this.managers.appGroupCallsManager.getGroupCallFull(this.groupCall.id);
    const dcId = (fullCall._ == 'groupCall') ? fullCall.stream_dc_id : 0;

    const channel = 1
    const quality = 2
    const last_time = Number(channels[channel].last_timestamp_ms);

    // CHANGE THERE TO DOWNLOAD CHUNKS
    for(let i = 0; i < 0; i++) {
      await pause(1000);
      const download = await this.managers.apiFileManager.download({
        location: {
          _: 'inputGroupCallStream',
          call: this.groupCall,
          scale: 0, // 1000ms
          time_ms: last_time + i * 1000,
          video_quality: quality,
          video_channel: channel
          // flags:
        },
        dcId
      })

      // Lemme imagine this is real
      // this.isLive = true;

      console.log('STREAM DOWNLOAD', download)
      const arbuf = await download.arrayBuffer();
      console.log('stream buf', arbuf)
      const baseenc = btoa(new Uint8Array(arbuf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      console.log('stream chunk', baseenc);
    }
  }
}
