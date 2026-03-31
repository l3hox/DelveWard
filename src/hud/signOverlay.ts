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
      background: rgba(0, 0, 0, 0.6);
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: #1a1208;
      border: 2px solid #8a6a2a;
      padding: 20px 28px;
      max-width: 420px;
      min-width: 180px;
      box-shadow: 0 0 24px rgba(0,0,0,0.8), inset 0 0 12px rgba(138,106,42,0.1);
      font-family: monospace;
      font-size: 13px;
      color: #ddc8a0;
      line-height: 1.7;
      text-align: center;
      image-rendering: pixelated;
      letter-spacing: 0.5px;
    `;

    this.textEl = document.createElement('div');
    this.textEl.style.cssText = `
      white-space: pre-wrap;
      text-shadow: 1px 1px 0 rgba(0,0,0,0.6);
    `;
    panel.appendChild(this.textEl);

    const hint = document.createElement('div');
    hint.style.cssText = `
      margin-top: 14px;
      font-size: 10px;
      color: #665830;
      font-style: italic;
    `;
    hint.textContent = 'Press any key to close';
    panel.appendChild(hint);

    this.container.appendChild(panel);

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
