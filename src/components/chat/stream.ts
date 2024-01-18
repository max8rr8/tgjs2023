import {attachClickEvent} from '../../helpers/dom/clickEvent';
import replaceContent from '../../helpers/dom/replaceContent';
import {GroupCall} from '../../layer';
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
  private chatId: ChatId | undefined;
  private groupCallId: string | number | undefined
  private hasBtnCb: boolean;

  public setCurrChatId(chatId: ChatId) {
    this.chatId = chatId;
    this.groupCallId = undefined;
    if(this.chatId) {
      this.managers.appProfileManager.getChatFull(chatId).then((chat) => {
        if(chat.id != this.chatId) return;

        this.groupCallId = chat.call?.id;
        this.refreshParticipantsCount()
      })
    }
  }

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    console.log('MAXRR chat join create', chat.peerId)
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
      this.updateParticipantsCount(groupCall);
    });

    setInterval(() => {
      this.refreshParticipantsCount()
    }, 1e3)


    this.btnClose.remove();


    this.btnJoin = document.createElement('button');
    this.btnJoin.classList.add('pinned-stream-join-btn');
    this.btnJoin.append(i18n('ChannelJoin'));
    this.wrapper.append(this.btnJoin);

    this.gradient = document.createElement('div');
    this.gradient.classList.add('pinned-stream-gradient', 'quote-like-border')
    this.wrapper.prepend(this.gradient);
  }

  public async refreshParticipantsCount() {
    if(this.groupCallId) {
      const call = await this.managers.appGroupCallsManager.getGroupCallFull(this.groupCallId)
      this.updateParticipantsCount(call);
    }
  }

  public updateParticipantsCount(groupCall: GroupCall) {
    // TODO: 'connecting' status?
    const participantCount = groupCall._ == 'groupCall' ? groupCall.participants_count : 0;

    this.contentSubtitle.compareAndUpdate({
      key: 'VoiceChat.Status.Members',
      args: [participantCount]
    });
    this.divAndCaption.fill({title: i18n('PeerInfo.Action.LiveStream'), subtitle: this.contentSubtitle.element});
  }

  // TODO: maybe there's better
  public attachJoinCallback(cb: () => void) {
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
