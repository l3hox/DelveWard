// Shared pixel-art color palette for HUD components

export const HUD_COLORS = {
  // Backgrounds
  panelBg: 'rgba(10, 8, 12, 0.75)',
  panelBorder: '#2a2230',

  // Health
  hpFill: '#cc3333',
  hpLow: '#ff4444',
  hpBg: '#1a0a0a',

  // Torch
  torchFill: '#cc8833',
  torchLow: '#ff6600',
  torchBg: '#1a1200',

  // Compass
  compassActive: '#e8c84a',
  compassInactive: '#444444',

  // Minimap
  minimapWall: '#5a5060',
  minimapFloor: '#2a2530',
  minimapDoor: '#886644',
  minimapPlayer: '#e8c84a',
  minimapBg: 'rgba(10, 8, 12, 0.8)',

  // Inventory
  slotBg: '#1a1620',
  slotBorder: '#3a3040',
  keyIcon: '#e8c84a',
  slotLabel: '#555555',

  // Text
  textPrimary: '#cccccc',
  textDim: '#666666',
} as const;
