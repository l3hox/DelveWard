import type { DialogNode, DialogChoice } from '../core/dialogManager';

export class DialogOverlay {
  private container: HTMLDivElement;
  private speakerEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private choicesEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private visible = false;
  private onChoiceSelected: ((index: number) => void) | null = null;
  private onAdvance: (() => void) | null = null;
  private hasChoices = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      display: none;
      align-items: flex-end;
      justify-content: center;
      z-index: 500;
      background: rgba(0, 0, 0, 0.5);
      padding-bottom: 80px;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: linear-gradient(180deg, #2a1a0a 0%, #1a0f05 100%);
      border: 3px solid #8b6914;
      border-radius: 4px;
      padding: 20px 28px;
      max-width: 500px;
      min-width: 320px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(139,105,20,0.3);
      font-family: 'Courier New', monospace;
      image-rendering: pixelated;
    `;

    this.speakerEl = document.createElement('div');
    this.speakerEl.style.cssText = `
      font-size: 13px;
      color: #d4a817;
      font-weight: bold;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    panel.appendChild(this.speakerEl);

    this.textEl = document.createElement('div');
    this.textEl.style.cssText = `
      font-size: 14px;
      color: #e0d0b0;
      line-height: 1.6;
      margin-bottom: 12px;
    `;
    panel.appendChild(this.textEl);

    this.choicesEl = document.createElement('div');
    this.choicesEl.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;
    panel.appendChild(this.choicesEl);

    this.hintEl = document.createElement('div');
    this.hintEl.style.cssText = `
      margin-top: 12px;
      font-size: 11px;
      color: #7a6a4a;
      font-style: italic;
      text-align: center;
    `;
    panel.appendChild(this.hintEl);

    this.container.appendChild(panel);
    this._keyHandler = this._keyHandler.bind(this);
  }

  private _keyHandler(e: KeyboardEvent): void {
    if (!this.visible) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.hasChoices) {
      // Number keys 1-9 select choices
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        this.onChoiceSelected?.(num - 1);
      }
    } else {
      // Any key advances non-choice dialog
      this.onAdvance?.();
    }
  }

  attach(): void {
    document.body.appendChild(this.container);
  }

  show(node: DialogNode, choices: DialogChoice[]): void {
    this.speakerEl.textContent = node.speaker ?? '';
    this.speakerEl.style.display = node.speaker ? 'block' : 'none';
    this.textEl.textContent = node.text;

    // Clear old choices
    this.choicesEl.innerHTML = '';
    this.hasChoices = choices.length > 0;

    if (this.hasChoices) {
      choices.forEach((choice, i) => {
        const btn = document.createElement('div');
        btn.style.cssText = `
          padding: 6px 12px;
          background: rgba(139, 105, 20, 0.15);
          border: 1px solid #5a4510;
          border-radius: 3px;
          color: #d4c5a0;
          font-size: 13px;
          font-family: 'Courier New', monospace;
          cursor: pointer;
          transition: background 0.15s;
        `;
        btn.textContent = `${i + 1}. ${choice.text}`;
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(139, 105, 20, 0.35)';
          btn.style.borderColor = '#8b6914';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(139, 105, 20, 0.15)';
          btn.style.borderColor = '#5a4510';
        });
        btn.addEventListener('click', () => {
          this.onChoiceSelected?.(i);
        });
        this.choicesEl.appendChild(btn);
      });
      this.hintEl.textContent = 'Press 1-9 or click to choose';
    } else {
      this.hintEl.textContent = 'Press any key to continue';
    }

    this.container.style.display = 'flex';
    this.visible = true;
    window.addEventListener('keydown', this._keyHandler, true);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.visible = false;
    window.removeEventListener('keydown', this._keyHandler, true);
  }

  isOpen(): boolean {
    return this.visible;
  }

  setOnChoiceSelected(cb: (index: number) => void): void {
    this.onChoiceSelected = cb;
  }

  setOnAdvance(cb: () => void): void {
    this.onAdvance = cb;
  }
}
