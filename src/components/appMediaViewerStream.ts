import {IS_MOBILE_SAFARI} from '../environment/userAgent';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, hasMouseMovedSinceDown} from '../helpers/dom/clickEvent';
import createVideo from '../helpers/dom/createVideo';
import findUpClassName from '../helpers/dom/findUpClassName';
import replaceContent from '../helpers/dom/replaceContent';
import EventListenerBase from '../helpers/eventListenerBase';
import {MiddlewareHelper, getMiddleware} from '../helpers/middleware';
import overlayCounter from '../helpers/overlayCounter';
import {InputGroupCall} from '../layer';
import {AppManagers} from '../lib/appManagers/managers';
import VideoPlayer from '../lib/mediaPlayer';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../lib/rootScope';
import animationIntersector from './animationIntersector';
import appNavigationController, {NavigationItem} from './appNavigationController';
import {avatarNew} from './avatarNew';
import ButtonIcon from './buttonIcon';
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
  protected tempId = 0;
  protected ignoreNextClick: boolean;
  protected navigationItem: NavigationItem;

  protected pageEl = document.getElementById('page-chats') as HTMLDivElement;
  protected videoPlayer: VideoPlayer;
  protected managers: AppManagers;
  protected topbar: HTMLElement;
  protected buttons: {[k in buttonsType]: HTMLElement} = {} as any;
  protected content: {[k in 'main' | 'container' | 'media']: HTMLElement} = {} as any;
  protected author: {
    avatarEl: ReturnType<typeof avatarNew>,
    avatarMiddlewareHelper?: MiddlewareHelper,
    container: HTMLElement,
    nameEl: HTMLElement,
    date: HTMLElement
  } = {} as any;

  constructor(protected peerId: PeerId, protected groupCall: InputGroupCall) {
    super(false);
    this.managers = rootScope.managers;
    this.middlewareHelper = getMiddleware();

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
    this.author.container.classList.add(STREAM_VIEWER_CLASSNAME + '-author', 'no-select');
    const authorRight = document.createElement('div');

    this.author.nameEl = document.createElement('div');
    this.author.nameEl.classList.add(STREAM_VIEWER_CLASSNAME + '-name');

    this.author.date = document.createElement('div');
    this.author.date.classList.add(STREAM_VIEWER_CLASSNAME + '-date');

    authorRight.append(this.author.nameEl, this.author.date);

    this.author.container.append(authorRight);

    // * buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add(STREAM_VIEWER_CLASSNAME + '-buttons');

    (['forward', 'close'] as buttonsType[]).forEach((name) => {
      const button = ButtonIcon(name as Icon, {noRipple: true});
      this.buttons[name] = button;
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

    this.content.container.append(video);
    this.overlaysDiv.append(mainDiv);
    // * overlays end

    topbarLeft.append(this.buttons['mobile-close'], this.author.container);
    topbar.append(topbarLeft, buttonsDiv);

    this.wholeDiv.append(this.overlaysDiv, this.topbar);
  }

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


  protected async leaveStream() {
    await this.managers.appGroupCallsManager.hangUp(this.groupCall.id, 0)
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
      replaceContent(this.author.date, 'Streaming');
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

        this.close();
      }
    };
    appNavigationController.pushItem(this.navigationItem);

    this.toggleOverlay(true);

    if(!this.wholeDiv.parentElement) {
      this.pageEl.insertBefore(this.wholeDiv, document.getElementById('main-columns'));
      void this.wholeDiv.offsetLeft; // reflow
    }

    this.toggleWholeActive(true);
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

  public close(e?: MouseEvent) {
    if(e) {
      cancelEvent(e);
    }

    this.leaveStream()
    this.closing = true;

    if(this.navigationItem) {
      appNavigationController.removeItem(this.navigationItem);
    }

    this.author.avatarMiddlewareHelper?.destroy();

    this.tempId = -1;
    if((window as any).appMediaViewer === this) {
      (window as any).appMediaViewer = undefined;
    }

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
      attachClickEvent(el, this.close.bind(this));
    });

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
