import IS_GROUP_CALL_SUPPORTED from '../../environment/groupCallSupport';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import replaceContent from '../../helpers/dom/replaceContent';
import {GroupCall} from '../../layer';
import {AppManagers} from '../../lib/appManagers/managers';
import I18n, {i18n} from '../../lib/langPack';
import rootScope from '../../lib/rootScope';
import DivAndCaption from '../divAndCaption';
import Chat, {ChatType} from './chat';
import PinnedContainer from './pinnedContainer';
import ChatTopbar from './topbar';

export default class ChatJoinStream extends PinnedContainer {
  public container: HTMLDivElement;
  public btnJoin: HTMLButtonElement;
  private gradient: HTMLDivElement;
  private contentSubtitle: I18n.IntlElement;
  private chatId: ChatId | undefined;
  private hasBtnCb: boolean;

  public groupCallId: string | number | undefined
  public isRTMPStream: boolean;

  private shouldShow(): boolean {
    if(!IS_GROUP_CALL_SUPPORTED || this.chat.peerId.isUser() || this.chat.type !== ChatType.Chat || this.chat.threadId) return false;
    if(this.chat.isAnyGroup || !this.chat.isBroadcast) return false;

    return true;
  }

  public setCurrChatId(chatId: ChatId) {
    this.chatId = chatId;
    this.groupCallId = undefined;
    this.isRTMPStream = false
    this.toggle(true)

    if(!this.shouldShow()) return;


    if(this.chatId) {
      this.managers.appProfileManager.getChatFull(chatId).then((chat) => {
        if(chat.id != this.chatId) return;
        if(chat.call) {
          this.groupCallId = chat.call?.id;
          this.toggle(false)
          this.refreshCall()
        }
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


    this.contentSubtitle = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    // TODO:
    this.listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      if(groupCall.chat_id == this.chatId) {
        if(groupCall._ == 'groupCallDiscarded') {
          this.groupCallId = undefined;
          this.toggle(true)
        } else {
          if(this.shouldShow()) {
            this.groupCallId = groupCall.id;
            this.toggle(false);
          }
        }
      }
      this.updateCall(groupCall);
    });

    setInterval(() => {
      this.refreshCall()
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

  public async refreshCall() {
    if(this.groupCallId) {
      const call = await this.managers.appGroupCallsManager.getGroupCallFull(this.groupCallId)
      this.updateCall(call);
    }
  }

  public updateCall(groupCall: GroupCall) {
    if(groupCall.id != this.groupCallId) return;

    this.isRTMPStream = groupCall._ == 'groupCall' ? groupCall.pFlags.rtmp_stream : false;

    const participantCount = groupCall._ == 'groupCall' ? groupCall.participants_count : 0;

    this.contentSubtitle.compareAndUpdate({
      key: 'VoiceChat.Status.Members',
      args: [participantCount < 0 ? 0 : participantCount]
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
}
