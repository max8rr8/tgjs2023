import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import {IS_MOBILE_SAFARI, IS_SAFARI} from '../environment/userAgent';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, hasMouseMovedSinceDown} from '../helpers/dom/clickEvent';
import createVideo from '../helpers/dom/createVideo';
import findUpClassName from '../helpers/dom/findUpClassName';
import {isFullScreen} from '../helpers/dom/fullScreen';
import replaceContent from '../helpers/dom/replaceContent';
import EventListenerBase from '../helpers/eventListenerBase';
import {MiddlewareHelper, getMiddleware} from '../helpers/middleware';
import overlayCounter from '../helpers/overlayCounter';
import debounce from '../helpers/schedulers/debounce';
import windowSize from '../helpers/windowSize';
import {AppManagers} from '../lib/appManagers/managers';
import {i18n} from '../lib/langPack';
import VideoPlayer from '../lib/mediaPlayer';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../lib/rootScope';
import animationIntersector from './animationIntersector';
import appMediaPlaybackController, {AppMediaPlaybackController} from './appMediaPlaybackController';
import AppMediaViewerBase from './appMediaViewerBase';
import {avatarNew} from './avatarNew';
import ButtonIcon from './buttonIcon';
import ProgressivePreloader from './preloader';
import SwipeHandler from './swipeHandler';
import wrapPeerTitle from './wrappers/peerTitle';

export const STREAM_VIEWER_CLASSNAME = 'media-viewer';

type buttonsType =  'close' | 'forward' | 'mobile-close';

export default class AppMediaViewerStream extends EventListenerBase<{
  setMoverBefore: () => void,
  setMoverAfter: () => void
}> {
  protected wholeDiv: HTMLElement;
  protected overlaysDiv: HTMLElement;
  protected moversContainer: HTMLElement;
  protected middlewareHelper: MiddlewareHelper;
  protected setMoverAnimationPromise: Promise<void>;
  protected closing: boolean;
  protected swipeHandler: SwipeHandler;
  protected tempId = 0;
  protected ctrlKeyDown: boolean;
  protected preloaderStreamable: ProgressivePreloader = null;
  protected ignoreNextClick: boolean;
  protected highlightSwitchersTimeout: number;
  protected lastGestureTime: number;
  protected isFirstOpen = true;
  protected releaseSingleMedia: ReturnType<AppMediaPlaybackController['setSingleMedia']>;

  protected pageEl = document.getElementById('page-chats') as HTMLDivElement;
  protected videoPlayer: VideoPlayer;
  protected managers: AppManagers;
  protected topbar: HTMLElement;
  protected buttons: {[k in buttonsType]: HTMLElement} = {} as any;
  protected content: {[k in 'main' | 'container' | 'media' | 'mover']: HTMLElement} = {} as any;
  protected author: {
    avatarEl: ReturnType<typeof avatarNew>,
    avatarMiddlewareHelper?: MiddlewareHelper,
    container: HTMLElement,
    nameEl: HTMLElement,
    date: HTMLElement
  } = {} as any;

  constructor() {
    super(false);
    this.managers = rootScope.managers;
    this.middlewareHelper = getMiddleware();

    this.preloaderStreamable = new ProgressivePreloader({
      cancelable: false,
      streamable: true
    });
    this.preloaderStreamable.construct();

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
    this.content.container.classList.add(STREAM_VIEWER_CLASSNAME + '-container');

    this.content.media = document.createElement('div');
    this.content.media.classList.add(STREAM_VIEWER_CLASSNAME + '-media');

    this.content.container.append(this.content.media);

    this.content.main.append(this.content.container);
    mainDiv.append(this.content.main);
    this.overlaysDiv.append(mainDiv);
    // * overlays end

    topbarLeft.append(this.buttons['mobile-close'], this.author.container);
    topbar.append(topbarLeft, buttonsDiv);

    this.moversContainer = document.createElement('div');
    this.moversContainer.classList.add(STREAM_VIEWER_CLASSNAME + '-movers');

    this.wholeDiv.append(this.overlaysDiv, this.topbar, this.moversContainer);
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
      replaceContent(this.author.date, 'streamn');
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

  public async openMedia({
    fromId
  } : {
    fromId: PeerId
  }) {
    try {
      this.setListeners();
      const setAuthorPromise = this.setAuthorInfo(fromId);
      await setAuthorPromise;

      const container = this.content.media;
      if(container.firstElementChild) {
        container.replaceChildren();
      }

      console.error('AAAAAAA fsefsefsefsefs');

      this.setNewMover();

      this.toggleOverlay(true);
      this.setGlobalListeners();

      if(!this.wholeDiv.parentElement) {
        this.pageEl.insertBefore(this.wholeDiv, document.getElementById('main-columns'));
        void this.wholeDiv.offsetLeft; // reflow
      }

      this.toggleWholeActive(true);

      // if(isVideo)
      const mover = this.content.mover;
      const middleware = mover.middlewareHelper.get();
      const video = createVideo({pip: true, middleware});
      // const
      // TODO wtf
      mover.style.display = '';
    } catch(e) {
      console.error('AAAA ERORORORO', e)
    }
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


  protected setNewMover() {
    const newMover = document.createElement('div');
    newMover.classList.add('media-viewer-mover');
    newMover.style.display = 'none';
    newMover.middlewareHelper = this.middlewareHelper.get().create();

    if(this.content.mover) {
      const oldMover = this.content.mover;
      oldMover.parentElement.append(newMover);
    } else {
      this.moversContainer.append(newMover);
    }

    return this.content.mover = newMover;
  }

  public close(e?: MouseEvent) {
    if(e) {
      cancelEvent(e);
    }

    if(this.setMoverAnimationPromise) return Promise.reject();

    this.closing = true;
    this.swipeHandler?.removeListeners();

    this.author.avatarMiddlewareHelper?.destroy();

    this.tempId = -1;
    if((window as any).appMediaViewer === this) {
      (window as any).appMediaViewer = undefined;
    }

    this.removeGlobalListeners();

    this.wholeDiv.remove();
    this.toggleOverlay(false);
    this.middlewareHelper.destroy();
  }

  protected toggleOverlay(active: boolean) {
    overlayCounter.isDarkOverlayActive = active;
    animationIntersector.checkAnimations2(active);
  }

  protected setListeners() {
    [this.buttons.close, this.buttons['mobile-close'], this.preloaderStreamable.preloader].forEach((el) => {
      attachClickEvent(el, this.close.bind(this));
    });

    this.wholeDiv.addEventListener('click', this.onClick);

    this.swipeHandler = new SwipeHandler({
      element: this.wholeDiv,
      onSwipe: (xDiff, yDiff, e, cancelDrag) => {
        if(isFullScreen()) {
          return;
        }

        if(!IS_TOUCH_SUPPORTED) {
          return;
        }

        const percentsY = Math.abs(yDiff) / windowSize.height;
        if(percentsY > .2 || Math.abs(yDiff) > 125) {
          this.close();
          return true;
        }

        return false;
      },
      verifyTouchTarget: (e) => {
        if(isFullScreen() ||
          findUpClassName(e.target, 'ckin__controls') ||
          findUpClassName(e.target, 'media-viewer-caption') ||
          (findUpClassName(e.target, 'media-viewer-topbar') && e.type !== 'wheel')) {
          return false;
        }

        return true;
      },
      cursor: ''
    });
  }

  protected toggleGlobalListeners(active: boolean) {
    if(active) this.setGlobalListeners();
    else this.removeGlobalListeners();
  }

  protected removeGlobalListeners() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  protected setGlobalListeners() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // this.log('onKeyDown', e);
    if(overlayCounter.overlaysActive > 1) {
      return;
    }

    const key = e.key;

    let good = true;
    if(key === 'ArrowRight') {
    } else if(key === 'ArrowLeft') {
    } else if(key === '-' || key === '=') {
      if(this.ctrlKeyDown) {
      }
    } else {
      good = false;
    }

    if(e.ctrlKey || e.metaKey) {
      this.ctrlKeyDown = true;
    }

    if(good) {
      cancelEvent(e);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if(overlayCounter.overlaysActive > 1) {
      return;
    }

    if(!(e.ctrlKey || e.metaKey)) {
      this.ctrlKeyDown = false;
    }
  };


  // NOT SURE
  onClick = (e: MouseEvent) => {
    if(this.ignoreNextClick) {
      this.ignoreNextClick = undefined;
      return;
    }

    if(this.setMoverAnimationPromise) return;

    const target = e.target as HTMLElement;
    if(target.tagName === 'A') return;
    cancelEvent(e);

    if(IS_TOUCH_SUPPORTED) {
      if(this.highlightSwitchersTimeout) {
        clearTimeout(this.highlightSwitchersTimeout);
      } else {
        this.wholeDiv.classList.add('highlight-switchers');
      }

      this.highlightSwitchersTimeout = window.setTimeout(() => {
        this.wholeDiv.classList.remove('highlight-switchers');
        this.highlightSwitchersTimeout = 0;
      }, 3e3);

      return;
    }

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
