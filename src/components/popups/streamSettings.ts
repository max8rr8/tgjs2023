import PopupElement, {PopupButton, PopupOptions} from '.';
import {LangPackKey, i18n} from '../../lib/langPack';
import ButtonMenuToggle from '../buttonMenuToggle';

export type PopupStreamOptions = PopupOptions & Partial<{
  peerId: PeerId,
  titleLangKey: LangPackKey,
  titleLangArgs: any[],
  bodyButtons: Array<PopupButton>,
  mainButton: PopupButton,
  isStartStream: boolean
}>;

export default class PopupStreamSettings extends PopupElement {
  protected description: HTMLParagraphElement;
  protected btnMain: HTMLButtonElement;
  protected btnMore: HTMLElement;
  private menuButtons: Parameters<typeof ButtonMenuToggle>[0]['buttons'];

  constructor(private className: string, options: PopupStreamOptions) {
    super('popup-stream' + (className ? ' ' + className : ''), {
      overlayClosable: true,
      ...options,
      buttons: [options.mainButton],
      body: true
    });

    //* body
    const fragment = document.createDocumentFragment();

    this.setText(fragment, 'To stream video with another app, enter these Server URL and Stream Key in your streaming app. Software encoding recommended (×264 in OBS).')
    this.setText(fragment, 'Once you start broadcasting in your streaming app, click Start Streaming below.')

    this.body.after(fragment);

    //* main button
    this.btnMain =  this.buttonsEl.getElementsByClassName('btn')[0] as HTMLButtonElement;
    if(!options?.isStartStream) {
      this.btnMain.classList.remove('primary');
      this.btnMain.classList.add('start');
    } else {
      this.btnMain.classList.remove('danger');
      this.btnMain.classList.add('end');
    }

    //* more button
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

    this.header.append(this.btnMore);
  }

  private setText(appendTo: DocumentFragment, text:/* LangPackKey */ string) {
    const description = document.createElement('p');
    description.classList.add('text');

    // TODO: should be a call to i18n
    description.innerText = text;
    appendTo.append(description);
  }
}
