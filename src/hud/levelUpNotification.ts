import { HUD_WIDTH } from './hudLayout';
import { drawPixelText, measurePixelText } from './hudFont';

const DISPLAY_DURATION = 3.0;   // seconds the notification is fully visible
const FADE_START = 2.0;          // seconds remaining when fade begins

/**
 * Displays a "LEVEL UP! N" flash in the top-center HUD area.
 * Trigger on kill → level-up. Fades out during the last second.
 */
export class LevelUpNotification {
  private message: string = '';
  private timer: number = 0;

  /** Start displaying "LEVEL UP! N" for DISPLAY_DURATION seconds. */
  trigger(level: number): void {
    this.message = `LEVEL ${level}`;
    this.timer = DISPLAY_DURATION;
  }

  update(dt: number): void {
    if (this.timer > 0) {
      this.timer = Math.max(0, this.timer - dt);
    }
  }

  isActive(): boolean {
    return this.timer > 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.timer <= 0) return;

    // Alpha: fully opaque above FADE_START, then fade out to 0
    const alpha = this.timer <= FADE_START
      ? this.timer / FADE_START
      : 1.0;

    const scale = 3;
    const lineSpacing = 12;

    // "LEVEL UP!" label
    const label = 'LEVEL UP';
    const labelW = measurePixelText(label, scale);
    const labelX = Math.floor((HUD_WIDTH - labelW) / 2);
    const labelY = 52;

    // Level number below
    const levelW = measurePixelText(this.message, scale);
    const levelX = Math.floor((HUD_WIDTH - levelW) / 2);
    const levelY = labelY + 5 * scale + lineSpacing; // 5 pixel rows * scale + gap

    // Gold text with alpha
    const goldColor = `rgba(232, 200, 74, ${alpha})`;
    drawPixelText(ctx, label, labelX, labelY, goldColor, scale);
    drawPixelText(ctx, this.message, levelX, levelY, goldColor, scale);
  }
}
