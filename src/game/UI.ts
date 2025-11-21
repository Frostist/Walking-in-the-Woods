import { eventBus } from '../app/EventBus';
import { Economy } from './Economy';
import { Player } from './Player';
import { WaveManager } from './WaveManager';
import { ShrineManager, Boon } from './ShrineManager';

export class UI {
  private container: HTMLElement;
  private player: Player;
  private shrineManager: ShrineManager;
  
  private hud!: HTMLElement;
  private boonPicker: HTMLElement | null = null;

  constructor(
    container: HTMLElement,
    _economy: Economy,
    player: Player,
    _waveManager: WaveManager,
    shrineManager: ShrineManager
  ) {
    this.container = container;
    this.player = player;
    this.shrineManager = shrineManager;

    this.createHUD();
    this.setupEventListeners();
  }

  private createHUD(): void {
    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    this.hud.innerHTML = `
      <div id="health-bar">
        <div class="label">HP</div>
        <div class="bar-container">
          <div class="bar hp-bar"></div>
        </div>
        <div class="value">100/100</div>
      </div>
      <div id="shield-bar">
        <div class="label">Shield</div>
        <div class="bar-container">
          <div class="bar shield-bar"></div>
        </div>
        <div class="value">50/50</div>
      </div>
      <div id="ammo">
        <div class="ammo-current">20</div>
        <div class="ammo-separator">/</div>
        <div class="ammo-max">20</div>
      </div>
      <div id="currency">
        <div class="essence">Essence: <span id="essence-value">0</span></div>
        <div class="fairy">Fairy Dust: <span id="fairy-value">0</span></div>
      </div>
      <div id="wave-info">
        <div class="wave-number">Wave: <span id="wave-number">0</span></div>
        <div class="wave-timer" id="wave-timer"></div>
      </div>
      <div id="downtime-info" style="display: none;">
        <div class="downtime-title">Downtime</div>
        <div class="downtime-timer" id="downtime-timer">25s</div>
        <div class="downtime-hint">Visit a shrine (F to interact)</div>
      </div>
    `;
    this.container.appendChild(this.hud);

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      #hud {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        font-family: 'Arial', sans-serif;
        color: white;
        z-index: 1000;
      }
      #health-bar, #shield-bar {
        position: absolute;
        left: 20px;
        width: 300px;
        height: 30px;
        background: rgba(0, 0, 0, 0.7);
        border: 2px solid #fff;
        border-radius: 4px;
        padding: 4px;
      }
      #health-bar { top: 20px; }
      #shield-bar { top: 60px; }
      .bar-container {
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        overflow: hidden;
      }
      .bar {
        height: 100%;
        transition: width 0.2s;
        border-radius: 2px;
      }
      .hp-bar { background: #ff4444; }
      .shield-bar { background: #44aaff; }
      .label {
        position: absolute;
        top: -20px;
        left: 0;
        font-size: 12px;
        font-weight: bold;
      }
      .value {
        position: absolute;
        top: 50%;
        right: 10px;
        transform: translateY(-50%);
        font-size: 14px;
        font-weight: bold;
      }
      #ammo {
        position: absolute;
        bottom: 20px;
        right: 20px;
        font-size: 48px;
        font-weight: bold;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      }
      .ammo-separator {
        display: inline;
        opacity: 0.5;
      }
      #currency {
        position: absolute;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.7);
        padding: 10px 15px;
        border-radius: 4px;
        font-size: 14px;
      }
      .essence { color: #ffaa00; margin-bottom: 5px; }
      .fairy { color: #ff00ff; }
      #wave-info {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        background: rgba(0, 0, 0, 0.8);
        padding: 20px 40px;
        border-radius: 8px;
        font-size: 24px;
        font-weight: bold;
      }
      #downtime-info {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        background: rgba(0, 0, 0, 0.9);
        padding: 30px 50px;
        border-radius: 8px;
        border: 2px solid #21c48d;
      }
      .downtime-title {
        font-size: 32px;
        font-weight: bold;
        color: #21c48d;
        margin-bottom: 10px;
      }
      .downtime-timer {
        font-size: 48px;
        font-weight: bold;
        margin: 20px 0;
      }
      .downtime-hint {
        font-size: 16px;
        opacity: 0.8;
      }
      #boon-picker {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.95);
        border: 3px solid #21c48d;
        border-radius: 12px;
        padding: 30px;
        z-index: 2000;
        pointer-events: all;
        min-width: 600px;
      }
      .boon-card {
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid #444;
        border-radius: 8px;
        padding: 20px;
        margin: 10px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .boon-card:hover {
        border-color: #21c48d;
        background: rgba(255, 255, 255, 0.2);
      }
      .boon-title {
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 10px;
      }
      .boon-cost {
        color: #ffaa00;
        margin: 10px 0;
      }
      .boon-effect {
        font-size: 14px;
        opacity: 0.9;
      }
    `;
    document.head.appendChild(style);
  }

  private setupEventListeners(): void {
    eventBus.on('currency/change', ({ essence, fairy }) => {
      const essenceEl = document.getElementById('essence-value');
      const fairyEl = document.getElementById('fairy-value');
      if (essenceEl) essenceEl.textContent = essence.toString();
      if (fairyEl) fairyEl.textContent = fairy.toString();
    });

    eventBus.on('wave/start', ({ index }) => {
      const waveEl = document.getElementById('wave-number');
      if (waveEl) waveEl.textContent = index.toString();
      const downtimeEl = document.getElementById('downtime-info');
      if (downtimeEl) downtimeEl.style.display = 'none';
    });

    eventBus.on('downtime/start', () => {
      const downtimeEl = document.getElementById('downtime-info');
      if (downtimeEl) downtimeEl.style.display = 'block';
    });

    eventBus.on('downtime/end', () => {
      const downtimeEl = document.getElementById('downtime-info');
      if (downtimeEl) downtimeEl.style.display = 'none';
      this.closeBoonPicker();
    });
  }

  update(): void {
    // Update health/shield bars
    const health = this.player.getHealth();
    const hpBar = this.hud.querySelector('.hp-bar') as HTMLElement;
    const shieldBar = this.hud.querySelector('.shield-bar') as HTMLElement;
    const hpValue = this.hud.querySelector('#health-bar .value') as HTMLElement;
    const shieldValue = this.hud.querySelector('#shield-bar .value') as HTMLElement;

    if (hpBar) hpBar.style.width = `${health.getHPPercent() * 100}%`;
    if (shieldBar) shieldBar.style.width = `${health.getShieldPercent() * 100}%`;
    if (hpValue) hpValue.textContent = `${Math.ceil(health.getHP())}/${health.getMaxHP()}`;
    if (shieldValue) shieldValue.textContent = `${Math.ceil(health.getShield())}/${health.getMaxShield()}`;

    // Update ammo
    const weapon = this.player.getWeapon();
    const ammoCurrent = this.hud.querySelector('.ammo-current') as HTMLElement;
    const ammoMax = this.hud.querySelector('.ammo-max') as HTMLElement;
    if (ammoCurrent) ammoCurrent.textContent = weapon.getAmmo().toString();
    if (ammoMax) ammoMax.textContent = weapon.getMaxAmmo().toString();

    // Update downtime timer
    if (this.shrineManager.isInDowntime()) {
      const timerEl = document.getElementById('downtime-timer');
      if (timerEl) {
        timerEl.textContent = `${Math.ceil(this.shrineManager.getDowntimeRemaining())}s`;
      }
    }
  }

  showBoonPicker(boons: Boon[], onSelect: (boon: Boon) => void): void {
    this.closeBoonPicker();

    const picker = document.createElement('div');
    picker.id = 'boon-picker';
    picker.innerHTML = `
      <div style="font-size: 24px; font-weight: bold; margin-bottom: 20px; text-align: center;">
        Choose a Boon
      </div>
      <div style="display: flex; gap: 20px;">
        ${boons.map(boon => `
          <div class="boon-card" data-boon-id="${boon.id}">
            <div class="boon-title">${boon.id}</div>
            <div class="boon-cost">
              ${boon.cost.essence ? `${boon.cost.essence} Essence` : ''}
              ${boon.cost.fairy ? `${boon.cost.fairy} Fairy Dust` : ''}
            </div>
            <div class="boon-effect">
              Slot: ${boon.slot}<br>
              Rarity: ${boon.rarity}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="text-align: center; margin-top: 20px; opacity: 0.7;">
        Click a boon to select, or press ESC to cancel
      </div>
    `;

    boons.forEach(boon => {
      const card = picker.querySelector(`[data-boon-id="${boon.id}"]`);
      if (card) {
        card.addEventListener('click', () => {
          onSelect(boon);
          this.closeBoonPicker();
        });
      }
    });

    document.body.appendChild(picker);
    this.boonPicker = picker;

    // Close on ESC
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeBoonPicker();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  closeBoonPicker(): void {
    if (this.boonPicker) {
      this.boonPicker.remove();
      this.boonPicker = null;
    }
  }
}

