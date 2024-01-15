import PopupElement, {PopupButton, PopupOptions} from '.';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {LangPackKey, i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import ButtonMenuToggle from '../buttonMenuToggle';

export type PopupStreamOptions = PopupOptions & Partial<{
  peerId: PeerId,
  titleLangKey: LangPackKey,
  titleLangArgs: any[],
  description: Parameters<typeof setInnerHTML>[1] | true,
  descriptionRaw: string,
  descriptionLangKey: LangPackKey,
  descriptionLangArgs: any[],
  bodyButtons: Array<PopupButton>,
  mainButton: PopupButton
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

    //* description
    const fragment = document.createDocumentFragment();
    if(options.descriptionLangKey || options.description || options.descriptionRaw) {
      const p = this.description = document.createElement('p');
      p.classList.add('popup-description');
      if(options.descriptionLangKey) p.append(i18n(options.descriptionLangKey, options.descriptionLangArgs));
      else if(options.description && options.description !== true) setInnerHTML(p, options.description);
      else if(options.descriptionRaw) p.append(wrapEmojiText(options.descriptionRaw));

      fragment.append(p);
    }
    this.header.after(fragment);

    //* main button
    this.btnMain =  this.buttonsEl.getElementsByClassName('btn')[0] as HTMLButtonElement;
    if(!options.mainButton?.isDanger) {
      this.btnMain.classList.remove('primary');
      this.btnMain.classList.add('start');
    } else {
      this.btnMain.classList.remove('danger');
      this.btnMain.classList.add('end');
    }

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

    // console.error('AAAA butts',);
  }
}
