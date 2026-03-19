export class SignOverlay {
  private container: HTMLDivElement;
  private textEl: HTMLDivElement;
  private visible = false;
  private onDismiss: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 500;
      background: rgba(0, 0, 0, 0.5);
    `;

    const parchment = document.createElement('div');
    parchment.style.cssText = `
      background: #d4c5a0;
      border: 4px solid #5a3e1b;
      border-radius: 4px;
      padding: 24px 32px;
      max-width: 400px;
      min-width: 200px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5), inset 0 0 20px rgba(90,62,27,0.15);
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #3a2a0a;
      line-height: 1.6;
      text-align: center;
      image-rendering: pixelated;
    `;

    this.textEl = document.createElement('div');
    parchment.appendChild(this.textEl);

    const hint = document.createElement('div');
    hint.style.cssText = `
      margin-top: 16px;
      font-size: 11px;
      color: #7a6a4a;
      font-style: italic;
    `;
    hint.textContent = 'Press any key to close';
    parchment.appendChild(hint);

    this.container.appendChild(parchment);

    // Click to dismiss
    this.container.addEventListener('click', () => this.hide());
    // Key to dismiss
    this._keyHandler = this._keyHandler.bind(this);
  }

  private _keyHandler(e: KeyboardEvent): void {
    if (this.visible) {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    }
  }

  attach(): void {
    document.body.appendChild(this.container);
  }

  show(text: string): void {
    this.textEl.textContent = text;
    this.container.style.display = 'flex';
    this.visible = true;
    // Add key listener with capture to intercept before game input
    window.addEventListener('keydown', this._keyHandler, true);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.visible = false;
    window.removeEventListener('keydown', this._keyHandler, true);
    this.onDismiss?.();
  }

  isOpen(): boolean {
    return this.visible;
  }

  setOnDismiss(cb: () => void): void {
    this.onDismiss = cb;
  }
}
