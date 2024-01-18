import PopupElement, {PopupButton, PopupOptions} from '.';
import {copyTextToClipboard} from '../../helpers/clipboard';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import Icons from '../../icons';
import {PhoneGroupCallStreamRtmpUrl} from '../../layer';
import I18n, {LangPackKey, i18n} from '../../lib/langPack';
import ButtonIcon from '../buttonIcon';
import ButtonMenuToggle from '../buttonMenuToggle';
import Icon from '../icon';
import {toast} from '../toast';

export type PopupStreamOptions = {
  peerId: PeerId,
  isStartStream: boolean,
  rtsmpInfo: PhoneGroupCallStreamRtmpUrl.phoneGroupCallStreamRtmpUrl,
  mainBtnCallback: () => void
};

export default class PopupStreamControl extends PopupElement {
  private btnMain: HTMLButtonElement;
  private btnMore: HTMLElement;
  private toggleVisible: HTMLElement;
  private passwordVisible = false;
  private passwordEl: HTMLDivElement;

  private menuButtons: Parameters<typeof ButtonMenuToggle>[0]['buttons'];
  private serverURL: string;
  private streamKey: string;

  // TODO: desctuctor !!!!!!!!!!!!
  constructor(private className: string, options: PopupStreamOptions) {
    const buttonText = document.createElement('p')
    buttonText.innerText = 'Start Streaming';

    const titleText = document.createElement('span');
    titleText.innerText = 'Stream With...'

    super('popup-stream' + (className ? ' ' + className : ''), {
      title: titleText,
      overlayClosable: true,
      closable: true,
      buttons: [{
        text: buttonText,
        callback: () => {
          options.mainBtnCallback()
          this.destroy()
        }
      }],
      body: true
    });

    this.serverURL = options.rtsmpInfo.url;
    this.streamKey = options.rtsmpInfo.key;

    //* TODO: more button
    this.btnMore = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: this.menuButtons,
      onOpen: async(e, element) => {
        const deleteButton = this.menuButtons[this.menuButtons.length - 1];
        // if(deleteButton?.element) {
        //   const deleteButtonText = await this.managers.appPeersManager.getDeleteButtonText(this.peerId);
        //   deleteButton.element.lastChild.replaceWith(i18n(deleteButtonText));
        // }
      }
    });
    this.btnMore.classList.add('more');

    this.header.append(this.btnMore);

    //* body
    const fragment = document.createDocumentFragment();

    this.addText(fragment, 'To stream video with another app, enter these Server URL and Stream Key in your streaming app. Software encoding recommended (×264 in OBS).')
    this.createControlElement(fragment, {
      rowSubtitle: 'Server URL',
      rowTitle: this.serverURL,
      icon: 'link'
    });
    this.createControlElement(fragment, {
      rowSubtitle: 'Stream Key',
      rowTitle: this.streamKey,
      icon: 'lock',
      isKey: true
    })
    if(options?.isStartStream) {
      this.addText(fragment, 'Once you start broadcasting in your streaming app, click Start Streaming below.')
    } else {
      const btnRevoke = document.createElement('div');
      btnRevoke.classList.add('row', 'row-with-icon', 'row-with-padding', 'red');

      // TODO: here should be a call to i18n returning span;
      const revokeText = document.createElement('span');
      revokeText.append('Revoke Stream Key');
      revokeText.classList.add('row-title');
      revokeText.setAttribute('dir', 'auto');

      btnRevoke.append(Icon('rotate_left', 'row-icon'), revokeText);
      fragment.append(btnRevoke);

      attachClickEvent(btnRevoke, () => {
        console.error('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
      })
    }

    this.body.append(fragment);

    //* main button
    this.btnMain =  this.buttonsEl.getElementsByClassName('btn')[0] as HTMLButtonElement;
    this.btnMain.classList.remove('primary');
    if(options?.isStartStream) {
      this.btnMain.classList.add('start');
    } else {
      this.btnMain.classList.add('end');
    }
  }

  private addText(appendTo: DocumentFragment, text:/* LangPackKey */ string) {
    const description = document.createElement('div');
    description.classList.add('text');

    // TODO: should be a call to i18n
    description.append(text);
    appendTo.append(description);
  }

  private createControlElement(appendTo: DocumentFragment, options: {
    rowSubtitle: /* LangPackKey */ string,
    rowTitle: string,
    icon: Icon,
    isKey?: true
  }) {
    const rowSubtitle = document.createElement('div');
    rowSubtitle.classList.add('row-subtitle');
    rowSubtitle.setAttribute('dir', 'auto');
    // TODO: this should be a call to i18n
    rowSubtitle.append(options.rowSubtitle);

    if(options?.isKey) {
      const toggleVisible = this.toggleVisible = document.createElement('span');
      toggleVisible.classList.add('toggle-visible');
      toggleVisible.append(Icon('eye1'));
      rowSubtitle.append(toggleVisible);
      toggleVisible.addEventListener('click', this.onVisibilityClick);
      toggleVisible.addEventListener('touchend', this.onVisibilityClick);
    }

    const rowTitle = this.passwordEl = document.createElement('div');
    rowTitle.classList.add('row-title');
    rowTitle.setAttribute('dir', 'auto');
    rowTitle.append(this.passwordVisible || !options.isKey ? options.rowTitle : '·'.repeat(options.rowTitle.length));

    const row = document.createElement('div');
    row.classList.add('row', 'row-with-icon', 'row-with-padding');
    row.append(Icon(options.icon, 'row-icon'), rowTitle, rowSubtitle);

    const el = document.createElement('div');
    el.classList.add('control-element');
    const btnCopy = ButtonIcon('copy row-icon copy-icon', {noRipple: true});

    attachClickEvent(btnCopy, () => {
      copyTextToClipboard(options?.isKey ? this.streamKey : this.serverURL);
      // TODO: this should be a call with proper key
      toast(I18n.format('PhoneCopied', true));
    })

    el.append(row, btnCopy);

    appendTo.append(el);
  }

  private onVisibilityClick = (e: Event) => {
    cancelEvent(e);
    this.passwordVisible = !this.passwordVisible;

    this.toggleVisible.replaceChildren(Icon(this.passwordVisible ? 'eye2' : 'eye1'));
    this.passwordEl.replaceChildren();
    this.passwordEl.append(this.passwordVisible ? this.streamKey : '·'.repeat(this.streamKey.length) )
  };
}
