import type { NpcDef } from '../npcs/npcDatabase';
import type { GameState } from '../core/gameState';
import type { ItemDef } from '../core/itemDatabase';
import { itemDatabase } from '../core/itemDatabase';
import { getItemImage } from '../rendering/itemSprites';
import type { HudOverlay } from './hudCanvas';

// Dungeon-themed trading overlay — matches questLogOverlay palette.
const C = {
  backdrop: 'rgba(0, 0, 0, 0.7)',
  panelBg: '#2a1a0a',
  panelBorder: '#8b6914',
  titleText: '#e8c84a',
  text: '#c0c0c0',
  textDim: '#777766',
  textGold: '#e8c84a',
  rowBorder: '#3a2a10',
  rowHoverBg: 'rgba(232, 200, 74, 0.08)',
  buttonBg: '#3a2a10',
  buttonBorder: '#8b6914',
  buttonHoverBg: '#4a3a1a',
  buttonDisabledBg: '#1a1008',
  buttonDisabledBorder: '#3a2a10',
  buttonDisabledText: '#555544',
  noValue: '#555544',
  columnHeaderBg: '#1e0f05',
} as const;

/** Compute buy price: ceil(value * markup). */
export function buyPrice(item: ItemDef, markup: number): number {
  return Math.ceil(item.value * markup);
}

/** Compute sell price: floor(value * 0.5). */
export function sellPrice(item: ItemDef): number {
  return Math.floor(item.value * 0.5);
}

function makeButton(label: string, disabled = false): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.disabled = disabled;
  _applyButtonStyle(btn, disabled);
  if (!disabled) {
    btn.addEventListener('mouseenter', () => {
      btn.style.background = C.buttonHoverBg;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = C.buttonBg;
    });
  }
  return btn;
}

function _applyButtonStyle(btn: HTMLButtonElement, disabled: boolean): void {
  if (disabled) {
    btn.style.cssText = `
      background: ${C.buttonDisabledBg};
      border: 1px solid ${C.buttonDisabledBorder};
      color: ${C.buttonDisabledText};
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 3px 8px;
      cursor: default;
      white-space: nowrap;
    `;
  } else {
    btn.style.cssText = `
      background: ${C.buttonBg};
      border: 1px solid ${C.buttonBorder};
      color: ${C.text};
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.1s;
    `;
  }
}

export class TradingOverlay {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private shopColumn: HTMLDivElement;
  private playerColumn: HTMLDivElement;
  private goldDisplay: HTMLSpanElement;
  private statusDisplay: HTMLSpanElement;
  private visible = false;

  private npcId: string | null = null;
  private npcDef: NpcDef | null = null;
  private gameState: GameState | null = null;
  private hud: HudOverlay | null = null;
  private onClose: (() => void) | null = null;

  constructor() {
    // Fullscreen backdrop
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 500;
      background: ${C.backdrop};
    `;

    // Panel
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      background: ${C.panelBg};
      border: 2px solid ${C.panelBorder};
      font-family: 'Courier New', monospace;
      width: 100%;
      max-width: 700px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
    `;

    // Title bar (updated dynamically)
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      padding: 12px 20px;
      font-size: 14px;
      font-weight: bold;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: ${C.titleText};
      text-align: center;
      border-bottom: 2px solid ${C.panelBorder};
    `;
    titleBar.textContent = 'TRADE';
    this.panel.appendChild(titleBar);

    // Two-column body
    const body = document.createElement('div');
    body.style.cssText = `
      display: flex;
      flex-direction: row;
      min-height: 200px;
      max-height: 60vh;
    `;

    // Shop column
    this.shopColumn = document.createElement('div');
    this.shopColumn.style.cssText = `
      flex: 1;
      border-right: 1px solid ${C.panelBorder};
      display: flex;
      flex-direction: column;
    `;
    body.appendChild(this.shopColumn);

    // Player column
    this.playerColumn = document.createElement('div');
    this.playerColumn.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
    `;
    body.appendChild(this.playerColumn);

    this.panel.appendChild(body);

    // Bottom bar: gold + close
    const bottomBar = document.createElement('div');
    bottomBar.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-top: 2px solid ${C.panelBorder};
    `;

    this.goldDisplay = document.createElement('span');
    this.goldDisplay.style.cssText = `
      color: ${C.textGold};
      font-size: 13px;
      font-weight: bold;
    `;
    bottomBar.appendChild(this.goldDisplay);

    this.statusDisplay = document.createElement('span');
    this.statusDisplay.style.cssText = `
      color: ${C.textDim};
      font-size: 11px;
      flex: 1;
      text-align: center;
    `;
    bottomBar.appendChild(this.statusDisplay);

    const closeBtn = makeButton('Close');
    closeBtn.addEventListener('click', () => this.hide());
    bottomBar.appendChild(closeBtn);

    this.panel.appendChild(bottomBar);
    this.container.appendChild(this.panel);

    this._keyHandler = this._keyHandler.bind(this);
  }

  private _keyHandler(e: KeyboardEvent): void {
    if (!this.visible) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      this.hide();
    }
  }

  attach(): void {
    document.body.appendChild(this.container);
  }

  show(npcId: string, npcDef: NpcDef, gameState: GameState, hud: HudOverlay): void {
    this.npcId = npcId;
    this.npcDef = npcDef;
    this.gameState = gameState;
    this.hud = hud;

    // Update title
    const titleBar = this.panel.firstElementChild as HTMLDivElement;
    titleBar.textContent = npcDef.name;

    this._rebuildContent();
    this.container.style.display = 'flex';
    this.visible = true;
    window.addEventListener('keydown', this._keyHandler, true);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.visible = false;
    window.removeEventListener('keydown', this._keyHandler, true);
    if (this.onClose) this.onClose();
  }

  isOpen(): boolean {
    return this.visible;
  }

  setOnClose(cb: () => void): void {
    this.onClose = cb;
  }

  private _rebuildContent(): void {
    if (!this.npcDef || !this.gameState) return;

    const markup = this.npcDef.markup ?? 1.5;
    const gs = this.gameState;
    const registry = gs.entityRegistry;

    // Update gold display
    this.goldDisplay.textContent = `Gold: ${gs.gold}`;

    // Update status message
    const backpackFull = registry.nextBackpackSlot() === null;
    this.statusDisplay.textContent = backpackFull ? 'Backpack is full' : '';

    // --- Shop column ---
    this.shopColumn.innerHTML = '';

    const shopHeader = document.createElement('div');
    shopHeader.textContent = 'Shop Stock';
    shopHeader.style.cssText = `
      padding: 10px 14px;
      font-size: 12px;
      font-weight: bold;
      color: ${C.titleText};
      background: ${C.columnHeaderBg};
      border-bottom: 1px solid ${C.rowBorder};
      flex-shrink: 0;
    `;
    this.shopColumn.appendChild(shopHeader);

    const shopList = document.createElement('div');
    shopList.style.cssText = `
      overflow-y: auto;
      flex: 1;
    `;

    const stock = this.npcDef.stock ?? [];

    for (const itemId of stock) {
      const def = itemDatabase.getItem(itemId);
      if (!def) continue;
      const price = buyPrice(def, markup);
      const canBuy = gs.gold >= price && !backpackFull;

      const row = this._buildItemRow(
        def,
        `${price}g`,
        'Buy',
        canBuy,
        () => this._handleBuy(itemId, def, price),
      );
      shopList.appendChild(row);
    }

    if (stock.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No items for sale';
      empty.style.cssText = `color: ${C.textDim}; font-size: 11px; padding: 12px 14px;`;
      shopList.appendChild(empty);
    }

    this.shopColumn.appendChild(shopList);

    // --- Player column ---
    this.playerColumn.innerHTML = '';

    const playerHeader = document.createElement('div');
    playerHeader.textContent = 'Backpack';
    playerHeader.style.cssText = `
      padding: 10px 14px;
      font-size: 12px;
      font-weight: bold;
      color: ${C.titleText};
      background: ${C.columnHeaderBg};
      border-bottom: 1px solid ${C.rowBorder};
      flex-shrink: 0;
    `;
    this.playerColumn.appendChild(playerHeader);

    const playerList = document.createElement('div');
    playerList.style.cssText = `
      overflow-y: auto;
      flex: 1;
    `;

    const backpackItems = registry.getBackpackItems();
    for (const entity of backpackItems) {
      const def = itemDatabase.getItem(entity.itemId);
      if (!def) continue;
      const price = sellPrice(def);
      const canSell = price > 0;

      const row = this._buildItemRow(
        def,
        price > 0 ? `${price}g` : 'No value',
        'Sell',
        canSell,
        () => this._handleSell(entity.instanceId, def, price),
      );
      playerList.appendChild(row);
    }

    if (backpackItems.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'Backpack is empty';
      empty.style.cssText = `color: ${C.textDim}; font-size: 11px; padding: 12px 14px;`;
      playerList.appendChild(empty);
    }

    this.playerColumn.appendChild(playerList);
  }

  private _buildItemRow(
    def: ItemDef,
    priceText: string,
    actionLabel: string,
    actionEnabled: boolean,
    onClick: () => void,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-bottom: 1px solid ${C.rowBorder};
      min-height: 32px;
    `;
    row.addEventListener('mouseenter', () => { row.style.background = C.rowHoverBg; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

    // Item icon — 20×20 canvas
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    canvas.style.cssText = 'flex-shrink: 0; image-rendering: pixelated;';
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const img = getItemImage(def.icon);
      if (img) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, 20, 20);
      }
    }
    row.appendChild(canvas);

    // Item name
    const nameEl = document.createElement('span');
    nameEl.textContent = def.name;
    nameEl.style.cssText = `
      color: ${C.text};
      font-size: 11px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    row.appendChild(nameEl);

    // Price
    const priceEl = document.createElement('span');
    priceEl.textContent = priceText;
    const isNoValue = priceText === 'No value';
    priceEl.style.cssText = `
      color: ${isNoValue ? C.noValue : C.textGold};
      font-size: 11px;
      flex-shrink: 0;
      min-width: 50px;
      text-align: right;
    `;
    row.appendChild(priceEl);

    // Action button
    if (actionEnabled) {
      const btn = makeButton(actionLabel);
      btn.addEventListener('click', onClick);
      row.appendChild(btn);
    } else if (!isNoValue) {
      // Show disabled button for buy/sell when can't afford or backpack full
      const btn = makeButton(actionLabel, true);
      row.appendChild(btn);
    }

    return row;
  }

  private _handleBuy(itemId: string, def: ItemDef, price: number): void {
    if (!this.gameState) return;
    const gs = this.gameState;
    const registry = gs.entityRegistry;

    const slot = registry.nextBackpackSlot();
    if (slot === null) {
      this.hud?.showMessage('Backpack is full!');
      return;
    }
    if (gs.gold < price) {
      this.hud?.showMessage('Not enough gold!');
      return;
    }

    gs.gold -= price;
    registry.createItem(itemId, def.quality, { kind: 'backpack', slot }, [...def.modifiers.map(m => m.id)]);
    this.hud?.showMessage(`Bought ${def.name} for ${price}g`);
    this._rebuildContent();
  }

  private _handleSell(instanceId: string, def: ItemDef, price: number): void {
    if (!this.gameState) return;
    const gs = this.gameState;

    gs.gold += price;
    gs.entityRegistry.removeItem(instanceId);
    this.hud?.showMessage(`Sold ${def.name} for ${price}g`);
    this._rebuildContent();
  }
}
