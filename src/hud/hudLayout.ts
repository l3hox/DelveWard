// Layout constants for the 640x360 internal resolution HUD

export const HUD_WIDTH = 640;
export const HUD_HEIGHT = 360;
export const MARGIN = 8;

// Compass — top-left
export const COMPASS = {
  x: MARGIN,
  y: MARGIN,
  w: 48,
  h: 48,
} as const;

// Minimap — top-right
export const MINIMAP = {
  w: 128,
  h: 128,
  get x() { return HUD_WIDTH - MARGIN - this.w; },
  y: MARGIN,
  cellSize: 6,
} as const;

// Health bar — bottom-left
export const HEALTH_BAR = {
  x: MARGIN,
  w: 160,
  h: 24,
  get y() { return HUD_HEIGHT - MARGIN - this.h; },
} as const;

// Torch indicator — next to health bar
export const TORCH_BAR = {
  w: 120,
  h: 24,
  get x() { return HEALTH_BAR.x + HEALTH_BAR.w + MARGIN; },
  get y() { return HUD_HEIGHT - MARGIN - this.h; },
} as const;

// Inventory panel — bottom-right
export const INVENTORY = {
  w: 144,
  h: 176,
  get x() { return HUD_WIDTH - MARGIN - this.w; },
  get y() { return HUD_HEIGHT - MARGIN - this.h; },
} as const;
