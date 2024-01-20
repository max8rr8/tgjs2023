import {IS_MOBILE_SAFARI} from '../environment/userAgent';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, hasMouseMovedSinceDown} from '../helpers/dom/clickEvent';
import createVideo from '../helpers/dom/createVideo';
import findUpClassName from '../helpers/dom/findUpClassName';
import replaceContent from '../helpers/dom/replaceContent';
import EventListenerBase from '../helpers/eventListenerBase';
import ListenerSetter from '../helpers/listenerSetter';
import {MiddlewareHelper, getMiddleware} from '../helpers/middleware';
import overlayCounter from '../helpers/overlayCounter';
import pause from '../helpers/schedulers/pause';
import {Chat, GroupCall, InputGroupCall} from '../layer';
import {GroupCallId} from '../lib/appManagers/appGroupCallsManager';
import {AppManagers} from '../lib/appManagers/managers';
import VideoPlayer from '../lib/mediaPlayer';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../lib/rootScope';
import animationIntersector from './animationIntersector';
import appMediaPlaybackController from './appMediaPlaybackController';
import appNavigationController, {NavigationItem} from './appNavigationController';
import {avatarNew} from './avatarNew';
import ButtonIcon from './buttonIcon';
import ButtonMenuToggle from './buttonMenuToggle';
import GroupCallDescriptionElement from './groupCall/description';
import PopupElement from './popups';
import PopupForward from './popups/forward';
import PopupPeer from './popups/peer';
import PopupStreamControl from './popups/streamControl';
import wrapPeerTitle from './wrappers/peerTitle';

export const STREAM_VIEWER_CLASSNAME = 'media-viewer';

type buttonsType =  'close' | 'forward' | 'mobile-close';

export default class AppMediaViewerStream extends EventListenerBase<{
  setMoverBefore: () => void,
  setMoverAfter: () => void
}> {
  protected wholeDiv: HTMLElement;
  protected overlaysDiv: HTMLElement;
  protected middlewareHelper: MiddlewareHelper;
  protected setMoverAnimationPromise: Promise<void>;
  protected closing: boolean;
  protected ignoreNextClick: boolean;
  protected navigationItem: NavigationItem;
  protected listenerSetter: ListenerSetter;
  protected callUpdateInterval: NodeJS.Timeout;

  protected btnMore: HTMLElement;
  protected liveTag: HTMLDivElement;
  protected description: GroupCallDescriptionElement;
  protected isLive: boolean;

  protected pageEl = document.getElementById('page-chats') as HTMLDivElement;
  protected streamPlayer: VideoPlayer;
  protected managers: AppManagers;
  protected topbar: HTMLElement;
  protected buttons: {[k in buttonsType]: HTMLElement} = {} as any;
  protected content: {[k in 'main' | 'container' | 'media' | 'caption']: HTMLElement} = {} as any;
  private menuButtons: Parameters<typeof ButtonMenuToggle>[0]['buttons'];
  protected author: {
    avatarEl: ReturnType<typeof avatarNew>,
    avatarMiddlewareHelper?: MiddlewareHelper,
    container: HTMLElement,
    nameEl: HTMLElement,
    status: HTMLElement
  } = {} as any;

  constructor(protected peerId: PeerId, protected groupCall: InputGroupCall) {
    super(false);
    this.managers = rootScope.managers;
    this.middlewareHelper = getMiddleware();
    this.listenerSetter = new ListenerSetter();

    this.wholeDiv = document.createElement('div');
    this.wholeDiv.classList.add(STREAM_VIEWER_CLASSNAME + '-whole');
    this.overlaysDiv = document.createElement('div');
    this.overlaysDiv.classList.add('overlays');

    const mainDiv = document.createElement('div');
    mainDiv.classList.add(STREAM_VIEWER_CLASSNAME);

    const topbar = this.topbar = document.createElement('div');
    topbar.classList.add(STREAM_VIEWER_CLASSNAME + '-topbar', STREAM_VIEWER_CLASSNAME + '-appear');

    const topbarLeft = document.createElement('div');
    topbarLeft.classList.add(STREAM_VIEWER_CLASSNAME + '-topbar-left');
    this.buttons['mobile-close'] = ButtonIcon('close', {onlyMobile: true});

    // * author
    this.author.container = document.createElement('div');
    this.author.container.classList.add(STREAM_VIEWER_CLASSNAME + '-author', 'no-select', 'opaque');
    const authorRight = document.createElement('div');

    this.author.nameEl = document.createElement('div');
    this.author.nameEl.classList.add(STREAM_VIEWER_CLASSNAME + '-name');

    this.author.status = document.createElement('div');
    this.author.status.classList.add(STREAM_VIEWER_CLASSNAME + '-date', 'status');

    authorRight.append(this.author.nameEl, this.author.status);

    this.author.container.append(authorRight);

    // * buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add(STREAM_VIEWER_CLASSNAME + '-buttons');

    (['forward', 'close'] as buttonsType[]).forEach((name) => {
      const button = ButtonIcon(name as Icon, {noRipple: true});
      this.buttons[name] = button;
      this.buttons[name].classList.add('white', 'opaque');
      buttonsDiv.append(button);
    });

    // * content
    this.content.main = document.createElement('div');
    this.content.main.classList.add(STREAM_VIEWER_CLASSNAME + '-content');

    this.content.container = document.createElement('div');
    this.content.container.classList.add(STREAM_VIEWER_CLASSNAME + '-container', STREAM_VIEWER_CLASSNAME + '-auto');

    this.content.main.append(this.content.container);
    mainDiv.append(this.content.main);

    this.content.main.middlewareHelper = this.middlewareHelper.get().create();
    const video = createVideo({pip: true, middleware: this.content.main.middlewareHelper.get()});
    video.src = 'stream/%7B%22dcId%22%3A2%2C%22location%22%3A%7B%22_%22%3A%22inputDocumentFileLocation%22%2C%22id%22%3A%225199710476254067157%22%2C%22access_hash%22%3A%22-1202662833049742147%22%2C%22file_reference%22%3A%5B4%2C124%2C101%2C233%2C203%2C0%2C0%2C0%2C23%2C101%2C167%2C128%2C107%2C166%2C204%2C145%2C34%2C102%2C3%2C26%2C12%2C123%2C208%2C169%2C68%2C156%2C1%2C40%2C41%5D%7D%2C%22size%22%3A4541349%2C%22mimeType%22%3A%22video%2Fmp4%22%2C%22fileName%22%3A%22IMG_9853.MOV%22%7D';
    // video.src = 'stream/%7B%22dcId%22%3A2%2C%22location%22%3A%7B%22_%22%3A%22inputDocumentFileLocation%22%2C%22id%22%3A%225283272299108120583%22%2C%22access_hash%22%3A%22-6833039415976833006%22%2C%22file_reference%22%3A%5B1%2C0%2C9%2C75%2C76%2C101%2C170%2C43%2C109%2C218%2C9%2C168%2C125%2C111%2C201%2C22%2C67%2C235%2C76%2C2%2C25%2C252%2C215%2C80%2C92%5D%7D%2C%22size%22%3A337461%2C%22mimeType%22%3A%22video%2Fmp4%22%7D'

    this.content.container.append(video);
    this.overlaysDiv.append(mainDiv);
    // * overlays end

    const createPlayer = async() => {
      video.dataset.ckin = 'default';
      video.dataset.overlay = '1';

      const player = this.streamPlayer = new VideoPlayer({
        video,
        // streamable: supportsStreaming,
        onPip: (pip) => {
          const otherMediaViewer = (window as any).appMediaViewer;
          if(!pip && otherMediaViewer && otherMediaViewer !== this) {
            this.leaveStream();
            return;
          }

          this.toggleWholeActive(!pip);
          this.toggleOverlay(!pip);

          if(this.navigationItem) {
            if(pip) appNavigationController.removeItem(this.navigationItem);
            else appNavigationController.pushItem(this.navigationItem);
          }

          if(pip) {
            appMediaPlaybackController.setPictureInPicture(video);
          }
        },
        onPipClose: () => {
          this.leaveStream();
        },
        showOnLeaveToClassName: 'media-viewer'
      });

      this.menuButtons = [{
        icon: 'speaker',
        // @ts-ignore
        text: 'Output Device',
        onClick: this.onOutputDevice.bind(this)
      }, /* {
          icon: 'radioon',
          text: 'Start Recording',
          onClick: this.onStartRecodring
        }*/ {
        icon: 'crossround',
        // @ts-ignore
        text: 'End Live Stream',
        onClick: this.onEndLiveStream.bind(this),
        danger: true
      }]

      const chat = await this.managers.appChatsManager.getChat(this.peerId.toChatId());
      if(chat) {
        if((chat as Chat.chat)?.pFlags?.creator) {
          this.menuButtons.splice(1, 0, {
            icon: 'settings',
            // @ts-ignore
            text: 'Stream Settings',
            onClick: this.onStreamSettings.bind(this)
          })
        }
      }

      // TODO: fix all i18n lines
      this.btnMore = ButtonMenuToggle({
        // listenerSetter: this.listenerSetter,
        direction: 'top-left',
        buttons: this.menuButtons,
        onOpen: async(e, element) => {
        }
      });

      this.btnMore.classList.add('more');
      this.liveTag = document.createElement('div');
      this.liveTag.classList.add('live-badge');
      // TODO: this should be a call to i18n
      this.liveTag.innerText = 'Live';
      this.liveTag.classList.toggle('active', !!this.isLive);

      const wrapper = video.parentElement;
      const leftControls = wrapper.querySelector('.left-controls');

      wrapper.querySelector('.progress-line').remove();
      wrapper.querySelector('.default__button--big').remove()
      leftControls.querySelector('.toggle').replaceWith(this.liveTag);
      wrapper.querySelector('.time').remove();
      wrapper.querySelector('.btn-menu-toggle').replaceWith(this.btnMore);

      this.description = new GroupCallDescriptionElement(leftControls as HTMLElement);
      this.updateCall(this.groupCall.id);

      player.addEventListener('toggleControls', (show) => {
        this.wholeDiv.classList.toggle('has-video-controls', show);
      });
    };

    createPlayer().catch((e) => {
      console.error('XX stream create player error ', e)
    });

    topbarLeft.append(this.buttons['mobile-close'], this.author.container);
    topbar.append(topbarLeft, buttonsDiv);

    this.wholeDiv.append(this.overlaysDiv, this.topbar);
  }

  private async updateCall(groupCallId: GroupCallId) {
    if(this.groupCall?.id !== groupCallId) return;
    const fullGroupCall = await this.managers.appGroupCallsManager.getGroupCallFull(this.groupCall.id);

    if((fullGroupCall as GroupCall.groupCall).participants_count >= 0) {
      this.description.update(fullGroupCall as GroupCall.groupCall);
    }
  }

  private onEndLiveStream() {
    this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'manage_call').then((hasRights) => {
      if(hasRights) {
        PopupElement.createPopup(PopupPeer, 'popup-end-video-chat', {
          titleLangKey: 'VoiceChat.End.Third',
          buttons: [{
            isDanger: true,
            langKey: 'Call.End',
            callback: async(e) => {
              this.hangUpAndClose(true)
            }
          }]
        }).show();
      }
    })
  }

  private onStreamSettings() {
    this.managers.appGroupCallsManager.getURLAndKey(this.peerId, false).then(rtmpInfo => {
      PopupElement.createPopup(PopupStreamControl,  'stream-settings', {
        isStartStream: false,
        peerId: this.peerId,
        rtmpInfo,
        mainBtnCallback: async() => {
          this.validateClose()
        }
      }).show();
    }).catch(e => {
      console.error('Cant open start with window, connecting to stream')
    });
  }

  private onStartRecodring() {

  }

  private onOutputDevice() {

  }

  private onForwardClick = () => {
    // this.managers.apiManager.invokeApi('phone.exportGroupCallInvite', {
    //   can_self_unmute: false,
    //   call: this.groupCall
    // }).then((res) => {
    //   console.error('XX link acq', res)
    // })
    // maybe should create a message with this link as contents and then
    // pass it to PopupForward;
    PopupElement.createPopup(PopupForward, {
      // [this.peerId]: [target.mid]
    }, () => {
      // return this.close();
      // here I should open pip, the chat to which was sent a message and do close only
    });
  };


  protected async joinStream() {
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

    console.error(joinInfo)
  }

  public async startStreaming() {
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
      this.isLive = true;

      console.log('STREAM DOWNLOAD', download)
      const arbuf = await download.arrayBuffer();
      console.log('stream buf', arbuf)
      const baseenc = btoa(new Uint8Array(arbuf).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      console.log('stream chunk', baseenc);
    }
  }


  protected async leaveStream() {
    await this.validateClose();
  }


  protected setAuthorInfo(fromId: PeerId | string) {
    const isPeerId = fromId.isPeerId();
    let wrapTitlePromise: Promise<HTMLElement> | HTMLElement;
    if(isPeerId) {
      wrapTitlePromise = wrapPeerTitle({
        peerId: fromId as PeerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false
      })
    } else {
      const title = wrapTitlePromise = document.createElement('span');
      title.append(wrapEmojiText(fromId));
      title.classList.add('peer-title');
    }

    const oldAvatar = this.author.avatarEl;
    const oldAvatarMiddlewareHelper = this.author.avatarMiddlewareHelper;

    const newAvatar = this.author.avatarEl = avatarNew({
      middleware: (this.author.avatarMiddlewareHelper = this.middlewareHelper.get().create()).get(),
      size: 44,
      peerId: fromId as PeerId || NULL_PEER_ID,
      peerTitle: isPeerId ? undefined : '' + fromId
    });
    newAvatar.node.classList.add(STREAM_VIEWER_CLASSNAME + '-userpic');

    return Promise.all([
      newAvatar.readyThumbPromise,
      wrapTitlePromise
    ]).then(([_, title]) => {
      // TODO: i18n lacks 'streaming' word
      replaceContent(this.author.status, 'streaming');
      replaceContent(this.author.nameEl, title);

      if(oldAvatar?.node && oldAvatar.node.parentElement) {
        oldAvatar.node.replaceWith(this.author.avatarEl.node);
      } else {
        this.author.container.prepend(this.author.avatarEl.node);
      }

      if(oldAvatar) {
        oldAvatar.node.remove();
        oldAvatarMiddlewareHelper.destroy();
      }
    });
  }

  public async openStream() {
    await this.joinStream();

    this.setListeners();
    const setAuthorPromise = this.setAuthorInfo(this.peerId);
    await setAuthorPromise;

    this.navigationItem = {
      type: 'media',
      onPop: (canAnimate) => {
        if(this.setMoverAnimationPromise) {
          return false;
        }

        if(!canAnimate && IS_MOBILE_SAFARI) {
          this.wholeDiv.remove();
        }

        this.leaveStream();
      }
    };
    appNavigationController.pushItem(this.navigationItem);

    this.toggleOverlay(true);

    if(!this.wholeDiv.parentElement) {
      this.pageEl.insertBefore(this.wholeDiv, document.getElementById('main-columns'));
      void this.wholeDiv.offsetLeft; // reflow
    }

    this.toggleWholeActive(true);

    this.startStreaming();
  }

  protected toggleWholeActive(active: boolean) {
    if(active) {
      this.wholeDiv.classList.add('active');
    } else {
      this.wholeDiv.classList.add('backwards');
      setTimeout(() => {
        this.wholeDiv.classList.remove('active');
      }, 0);
    }
  }

  private hangUpAndClose = async(discard: boolean | number) => {
    await this.managers.appGroupCallsManager.hangUp(this.groupCall.id, discard)
    this.close();
  }

  private async validateClose() {
    if(await this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'manage_call')) {
      PopupElement.createPopup(PopupPeer, 'popup-end-video-chat', {
        titleLangKey: 'VoiceChat.End.Title',
        descriptionLangKey: 'VoiceChat.End.Text',
        checkboxes: [{
          text: 'VoiceChat.End.Third'
        }],
        buttons: [{
          isDanger: true,
          langKey: 'VoiceChat.End.OK',
          callback: async(e, checkboxes) => {
            if(!!checkboxes.size) {
              this.hangUpAndClose(true);
            } else {
              this.hangUpAndClose(0)
            }
          }
        }]
      }).show();
    } else {
      this.hangUpAndClose(0)
    }
  }

  public close(e?: MouseEvent) {
    if(e) {
      cancelEvent(e);
    }

    this.closing = true;

    if(this.navigationItem) {
      appNavigationController.removeItem(this.navigationItem);
    }

    this.author.avatarMiddlewareHelper?.destroy();

    if((window as any).appMediaViewer === this) {
      (window as any).appMediaViewer = undefined;
    }

    clearInterval(this.callUpdateInterval);

    this.streamPlayer.cleanup();

    this.wholeDiv.remove();
    this.toggleOverlay(false);
    this.middlewareHelper.destroy();
  }

  protected toggleOverlay(active: boolean) {
    overlayCounter.isDarkOverlayActive = active;
    animationIntersector.checkAnimations2(active);
  }

  protected setListeners() {
    [this.buttons.close, this.buttons['mobile-close']].forEach((el) => {
      attachClickEvent(el, this.leaveStream.bind(this));
    });

    attachClickEvent(this.buttons.forward, this.onForwardClick);
    this.listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      this.updateCall(groupCall.id);
    });
    this.wholeDiv.addEventListener('click', this.onClick);

    this.callUpdateInterval = setInterval(() => {
      this.updateCall(this.groupCall.id)
    }, 1e3)
  }

  // NOT SURE
  onClick = (e: MouseEvent) => {
    if(this.ignoreNextClick) {
      this.ignoreNextClick = undefined;
      return;
    }

    const target = e.target as HTMLElement;
    if(target.tagName === 'A') return;
    cancelEvent(e);

    if(hasMouseMovedSinceDown(e)) {
      return;
    }

    let mover: HTMLElement = null;
    const classNames = ['ckin__player', 'media-viewer-buttons', 'media-viewer-author', 'media-viewer-caption', 'zoom-container'];

    classNames.find((s) => {
      try {
        mover = findUpClassName(target, s);
        if(mover) return true;
      } catch(err) {return false;}
    });
  };
}
