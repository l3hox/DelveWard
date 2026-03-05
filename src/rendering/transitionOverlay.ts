/**
 * Full-screen fade-to-black overlay for level transitions.
 * Blocks input while active. No Three.js dependency — pure DOM.
 */
export class TransitionOverlay {
  private el: HTMLDivElement;
  private opacity: number;
  private phase: 'idle' | 'fade_out' | 'fade_in';
  private speed: number;         // opacity change per second
  private onMidpoint?: () => void;
  private onComplete?: () => void;

  constructor(speed: number = 2.0) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed;
      inset: 0;
      background: black;
      opacity: 0;
      pointer-events: none;
      z-index: 20;
      transition: none;
    `;
    this.opacity = 0;
    this.phase = 'idle';
    this.speed = speed;
  }

  /** Append overlay to a parent element */
  attach(parent: HTMLElement = document.body): void {
    parent.appendChild(this.el);
  }

  /** Start a transition: fade to black → call onMidpoint → fade back in → call onComplete */
  startTransition(onMidpoint?: () => void, onComplete?: () => void): void {
    if (this.phase !== 'idle') return;  // ignore if already transitioning
    this.onMidpoint = onMidpoint;
    this.onComplete = onComplete;
    this.phase = 'fade_out';
    this.el.style.pointerEvents = 'all';  // block clicks during transition
  }

  /** Drive the tween — call from game loop with delta in seconds */
  update(delta: number): void {
    if (this.phase === 'idle') return;

    if (this.phase === 'fade_out') {
      this.opacity = Math.min(1, this.opacity + this.speed * delta);
      this.el.style.opacity = String(this.opacity);
      if (this.opacity >= 1) {
        // Hit midpoint — call the callback (level swap happens here)
        this.onMidpoint?.();
        this.onMidpoint = undefined;
        this.phase = 'fade_in';
      }
    } else if (this.phase === 'fade_in') {
      this.opacity = Math.max(0, this.opacity - this.speed * delta);
      this.el.style.opacity = String(this.opacity);
      if (this.opacity <= 0) {
        this.phase = 'idle';
        this.el.style.pointerEvents = 'none';
        this.onComplete?.();
        this.onComplete = undefined;
      }
    }
  }

  /** True while a transition is in progress — use to block keyboard input */
  get isActive(): boolean {
    return this.phase !== 'idle';
  }
}
