import {attachClickEvent} from '../../helpers/dom/clickEvent';
import replaceContent from '../../helpers/dom/replaceContent';
import {AppManagers} from '../../lib/appManagers/managers';
import I18n, {i18n} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';
import AppMediaViewerStream from '../appMediaViewerStream';
import DivAndCaption from '../divAndCaption';
import Chat from './chat';
import PinnedContainer from './pinnedContainer';
import ChatTopbar from './topbar';

export default class ChatJoinStream extends PinnedContainer {
  public container: HTMLDivElement;
  public btnJoin: HTMLButtonElement;
  private gradient: HTMLDivElement;
  private contentSubtitle: I18n.IntlElement;
  private appMediaViewerStream: AppMediaViewerStream;
  private currChatId: ChatId;
  private hasBtnCb: boolean;

  public setCurrChatId(chatId: ChatId) {
    this.currChatId = chatId;
    this.updateParticipantsCount(chatId);
  }

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'stream',
      divAndCaption: new DivAndCaption(
        'pinned-stream',
        (options) => {
          replaceContent(this.divAndCaption.title, options.title);
          replaceContent(this.divAndCaption.subtitle, options.subtitle);
        }
      ),
      floating: true
    })

    this.appMediaViewerStream = new AppMediaViewerStream();
    this.contentSubtitle = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    // TODO:
    this.listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      if(this.currChatId) {
        this.updateParticipantsCount(this.currChatId);
      }
    });


    this.btnClose.remove();


    this.btnJoin = document.createElement('button');
    this.btnJoin.classList.add('pinned-stream-join-btn');
    this.btnJoin.append(i18n('ChannelJoin'));
    this.wrapper.append(this.btnJoin);

    this.gradient = document.createElement('div');
    this.gradient.classList.add('pinned-stream-gradient', 'quote-like-border')
    this.wrapper.prepend(this.gradient);
  }

  public async updateParticipantsCount(chatId?: ChatId) {
    // TODO: 'connecting' status?
    this.contentSubtitle.compareAndUpdate({
      key: 'VoiceChat.Status.Members',
      args: [await this.managers.appGroupCallsManager.getParticipantsCount(chatId)]
    });
    this.divAndCaption.fill({title: i18n('PeerInfo.Action.LiveStream'), subtitle: this.contentSubtitle.element});
  }

  // TODO: maybe there's better
  public setBtnJoinCallback(cb: () => void) {
    if(this.hasBtnCb) {
      return;
    }
    attachClickEvent(this.btnJoin, cb);
    this.hasBtnCb = true;
  }

  public openStreamWindow(peerId: PeerId) {
    try {
      this.appMediaViewerStream.openMedia({fromId: peerId});
    } catch(e) {
      console.error(e)
    }
  }
}
