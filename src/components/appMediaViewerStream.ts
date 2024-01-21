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
import {Chat, GroupCall, PhoneGroupCallStreamRtmpUrl} from '../layer';
import {AppManagers} from '../lib/appManagers/managers';
import {LiveStream} from '../lib/calls/livestream/livestream';
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
import Icon from './icon';
import PopupElement from './popups';
import PopupPeer from './popups/peer';
import PopupPickUser from './popups/pickUser';
import PopupStreamControl, {KeyUrlElementsController} from './popups/streamControl';
import {putPreloader} from './putPreloader';
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
  protected toggleVisible: HTMLSpanElement;
  protected passwordVisible: boolean;
  protected list: ListenerSetter;

  protected keyUrlController: KeyUrlElementsController;

  protected serverUrlEl: HTMLElement;
  protected streamKeyEl: HTMLElement;

  protected rtmpInfo: PhoneGroupCallStreamRtmpUrl;

  protected btnMore: HTMLElement;
  protected liveTag: HTMLDivElement;
  protected description: GroupCallDescriptionElement;
  protected thumbnailWrap: HTMLDivElement;
  protected animBlink: HTMLDivElement;

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

  protected video: HTMLVideoElement

  constructor(protected stream: LiveStream) {
    super(false);
    this.managers = rootScope.managers;
    this.middlewareHelper = getMiddleware();
    this.listenerSetter = new ListenerSetter();

    this.listenerSetter.add(this.stream)('closed', ()=>{
      this.close()
    })

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
    this.video = createVideo({pip: true, middleware: this.content.main.middlewareHelper.get()});

    this.content.container.append(this.video);
    this.overlaysDiv.append(mainDiv);
    // * overlays end

    const createPlayer = async() => {
      this.video.dataset.ckin = 'default';
      this.video.dataset.overlay = '1';

      const player = this.streamPlayer = new VideoPlayer({
        video: this.video,
        // streamable: supportsStreaming,
        play: true,
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
            appMediaPlaybackController.setPictureInPicture(this.video);
          }
        },
        showOnLeaveToClassName: '',
        allowTogglePlay: false
      });

      let chat;
      if(await this.managers.appChatsManager.hasRights(this.stream.peerId.toChatId(), 'manage_call')) {
        this.menuButtons = [{
          icon: 'speaker',
          // @ts-ignore
          text: 'Output Device',
          onClick: this.onOutputDevice.bind(this)
        }, {
          icon: 'radioon',
          // @ts-ignore
          text: 'Start Recording',
          onClick: this.onStartRecodring.bind(this)
        }, {
          icon: 'crossround',
          // @ts-ignore
          text: 'End Live Stream',
          onClick: this.onEndLiveStream.bind(this),
          danger: true
        }]

        chat = await this.managers.appChatsManager.getChat(this.stream.peerId.toChatId());
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

        this.video.muted = appMediaPlaybackController.muted
        this.video.volume = appMediaPlaybackController.volume
        this.listenerSetter.add(appMediaPlaybackController)('playbackParams', params=>{
          this.video.muted = params.muted
          this.video.volume = params.volume
        })
      }
      this.liveTag = document.createElement('div');
      this.liveTag.classList.add('live-badge');
      // TODO: this should be a call to i18n
      this.liveTag.innerText = 'Live';
      this.liveTag.classList.toggle('active', false);

      const wrapper = this.video.parentElement;
      const leftControls = wrapper.querySelector('.left-controls');

      wrapper.querySelector('.progress-line').remove();
      wrapper.querySelector('.default__button--big').remove()
      leftControls.querySelector('.toggle').replaceWith(this.liveTag);
      wrapper.querySelector('.time').remove();
      wrapper.querySelector('.btn-menu-toggle').replaceWith(this.btnMore);

      const wrap = findUpClassName(wrapper, 'media-viewer');

      const img = document.createElement('img');

      const src = this.author.avatarEl.node.querySelector('img')?.src;

      if(!src) {
        img.style.backgroundColor = this.author.avatarEl.node.dataset.color;
      } else {
        img.src = src
      }
      img.classList.toggle('thumbnail-fallback', !!!src)

      img.width = wrap.offsetWidth*0.85;
      img.height = wrap.offsetHeight*0.75;
      img.classList.add('thumbnail')

      this.thumbnailWrap = document.createElement('div');
      this.thumbnailWrap.classList.add('thumbnail-wrap')
      this.thumbnailWrap.append(img);

      if(chat) {
        if((chat as Chat.chat)?.pFlags?.creator) {
          const oopsDiv = document.createElement('div');
          oopsDiv.classList.add('oops');


          //* oops header
          const preloaderWrap = document.createElement('div');
          preloaderWrap.classList.add('preloader-circular-div');
          putPreloader(preloaderWrap);
          const oopsHeader = document.createElement('div');
          oopsHeader.classList.add('oops-header');
          // this should be a call to i18n;
          oopsHeader.append(preloaderWrap, 'Oops!')

          //* oops text
          // this should be a call to i18n;
          const text = document.createElement('div');
          text.classList.add('text');
          text.innerText = 'Telegram doesn\'t see any stream coming from your streaming app. Please make sure you entered the right Server URL and Stream Key in your app.';

          oopsDiv.append(oopsHeader, text)

          const rtmpInfo = await stream.getURLAndKey()

          this.keyUrlController = new KeyUrlElementsController(rtmpInfo);
          oopsDiv.append(this.keyUrlController.getFragment());

          this.thumbnailWrap.append(oopsDiv)
        }
      }


      this.animBlink = document.createElement('div');
      this.animBlink.classList.add('blink-animation')
      wrapper.append(this.thumbnailWrap, this.animBlink)
      this.video.classList.add('hide');

      this.listenerSetter.add(this.stream)('live', isLive => {
        this.liveTag.classList.toggle('active', isLive);
        this.video.classList.toggle('hide', !isLive);
        this.thumbnailWrap.classList.toggle('hide', isLive);
        this.animBlink.classList.toggle('blink-animation', !isLive);
      })

      this.description = new GroupCallDescriptionElement(leftControls as HTMLElement);
      this.listenerSetter.add(this.stream)('fullUpdate', fullGroupCall=>{
        if(fullGroupCall._ == 'groupCall')
          this.description.update(fullGroupCall)
      })

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

  public onVisibilityClick = (e: Event) => {
    cancelEvent(e);
    this.passwordVisible = !this.passwordVisible;

    this.toggleVisible.replaceChildren(Icon(this.passwordVisible ? 'eye2' : 'eye1'));
    this.streamKeyEl.replaceChildren();
    this.streamKeyEl.append(this.passwordVisible ? this.rtmpInfo.key : '·'.repeat(this.rtmpInfo.key.length) )
  };

  private onEndLiveStream() {
    this.managers.appChatsManager.hasRights(this.stream.peerId.toChatId(), 'manage_call').then((hasRights) => {
      if(hasRights) {
        PopupElement.createPopup(PopupPeer, 'popup-end-video-chat', {
          titleLangKey: 'VoiceChat.End.Third',
          buttons: [{
            isDanger: true,
            langKey: 'Call.End',
            callback: async(e) => {
              this.stream.leave(true)
            }
          }]
        }).show();
      }
    })
  }

  private async onStreamSettings() {
    const rtmpInfo = await this.stream.getURLAndKey()
    PopupElement.createPopup(PopupStreamControl,  'stream-settings', {
      isStartStream: false,
      peerId: this.stream.peerId,
      rtmpInfo,
      mainBtnCallback: async() => {
        this.validateClose()
      },
      keyUrlController: this.keyUrlController
    }).show();
  }

  private onStartRecodring() {

  }

  private onOutputDevice() {

  }

  private async onForwardClick() {
    const text = await this.stream.getInvite()

    PopupElement.createPopup(PopupPickUser, {
      onMultiSelect: (peerIds) => {
        for(const peerId of peerIds) {
          this.managers.appMessagesManager.sendText({
            peerId,
            text: text.link
          });
        }
      }
    })
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
    this.setListeners();
    const setAuthorPromise = this.setAuthorInfo(this.stream.peerId);
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
      },
      onEscape: () => {
        this.leaveStream();
        return false;
      }
    };

    appNavigationController.pushItem(this.navigationItem);

    this.toggleOverlay(true);

    if(!this.wholeDiv.parentElement) {
      this.pageEl.insertBefore(this.wholeDiv, document.getElementById('main-columns'));
      void this.wholeDiv.offsetLeft; // reflow
    }

    this.toggleWholeActive(true);

    this.stream.streamIntoVideo(this.video);
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

  private async validateClose() {
    if(await this.managers.appChatsManager.hasRights(this.stream.peerId.toChatId(), 'manage_call')) {
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
              this.stream.leave(true);
            } else {
              this.stream.leave()
            }
          }
        }]
      }).show();
    } else {
      this.stream.leave()
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

    this.listenerSetter.removeManual(rootScope, 'group_call_update', this.validateLeaveStream);

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

  protected validateLeaveStream(groupCall: GroupCall & {chatId?: string | number}) {
    if(groupCall._ === 'groupCallDiscarded') {
      this.leaveStream();
    }
  }

  protected setListeners() {
    [this.buttons.close, this.buttons['mobile-close']].forEach((el) => {
      attachClickEvent(el, this.leaveStream.bind(this));
    });

    this.listenerSetter.add(rootScope)('group_call_update', this.validateLeaveStream);

    attachClickEvent(this.buttons.forward, ()=>this.onForwardClick());
    this.wholeDiv.addEventListener('click', this.onClick);
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

    // if(IS_TOUCH_SUPPORTED) {
    //   if(this.highlightSwitchersTimeout) {
    //     clearTimeout(this.highlightSwitchersTimeout);
    //   } else {
    //     this.wholeDiv.classList.add('highlight-switchers');
    //   }

    //   this.highlightSwitchersTimeout = window.setTimeout(() => {
    //     this.wholeDiv.classList.remove('highlight-switchers');
    //     this.highlightSwitchersTimeout = 0;
    //   }, 3e3);

    //   return;
    // }

    if(hasMouseMovedSinceDown(e)) {
      return;
    }

    let mover: HTMLElement = null;
    const classNames = ['ckin__player', 'media-viewer-buttons', 'media-viewer-author'];

    classNames.find((s) => {
      try {
        mover = findUpClassName(target, s);
        if(mover) return true;
      } catch(err) { return false;}
    });

    if(!mover) {
      this.leaveStream();
    }
  };
}
