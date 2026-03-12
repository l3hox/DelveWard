// Minimal pixel font for HUD — 3x5 pixel glyphs scaled up
// Supports: 0-9, N, E, S, W, H, P, T, x, /, K

type Glyph = number[]; // 5 rows of 3-bit packed pixels (bit 2=left, bit 1=mid, bit 0=right)

const GLYPHS: Record<string, Glyph> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b111, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b001, 0b001, 0b001],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  '/': [0b001, 0b001, 0b010, 0b100, 0b100],
  'N': [0b101, 0b111, 0b111, 0b101, 0b101],
  'E': [0b111, 0b100, 0b111, 0b100, 0b111],
  'S': [0b111, 0b100, 0b111, 0b001, 0b111],
  'W': [0b101, 0b101, 0b111, 0b111, 0b101],
  'H': [0b101, 0b101, 0b111, 0b101, 0b101],
  'P': [0b111, 0b101, 0b111, 0b100, 0b100],
  'T': [0b111, 0b010, 0b010, 0b010, 0b010],
  'x': [0b000, 0b101, 0b010, 0b101, 0b000],
  'K': [0b101, 0b110, 0b100, 0b110, 0b101],
  'A': [0b010, 0b101, 0b111, 0b101, 0b101],
  'R': [0b111, 0b101, 0b111, 0b110, 0b101],
  'D': [0b110, 0b101, 0b101, 0b101, 0b110],
  'L': [0b100, 0b100, 0b100, 0b100, 0b111],
  'V': [0b101, 0b101, 0b101, 0b010, 0b010],
  'C': [0b111, 0b100, 0b100, 0b100, 0b111],
  'F': [0b111, 0b100, 0b111, 0b100, 0b100],
  'G': [0b111, 0b100, 0b101, 0b101, 0b111],
  'I': [0b111, 0b010, 0b010, 0b010, 0b111],
  'O': [0b111, 0b101, 0b101, 0b101, 0b111],
  'U': [0b101, 0b101, 0b101, 0b101, 0b111],
  'B': [0b110, 0b101, 0b110, 0b101, 0b110],
  'M': [0b101, 0b111, 0b111, 0b101, 0b101],
  'X': [0b101, 0b101, 0b010, 0b101, 0b101],
  'Y': [0b101, 0b101, 0b010, 0b010, 0b010],
  'Z': [0b111, 0b001, 0b010, 0b100, 0b111],
  'J': [0b001, 0b001, 0b001, 0b101, 0b111],
  'Q': [0b111, 0b101, 0b101, 0b110, 0b011],
};

/**
 * Draw a text string using the pixel font.
 * @param scale - pixel size multiplier (1 = 3x5 actual pixels)
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale: number = 2,
): void {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) {
      cx += 4 * scale; // space
      continue;
    }
    for (let row = 0; row < 5; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 3; col++) {
        if (bits & (4 >> col)) {
          ctx.fillRect(cx + col * scale, y + row * scale, scale, scale);
        }
      }
    }
    cx += 4 * scale; // 3px glyph + 1px spacing
  }
}

/** Get the pixel width of a text string at a given scale */
export function measurePixelText(text: string, scale: number = 2): number {
  return text.length * 4 * scale - scale; // subtract trailing space
}
