import { eventBus } from '../app/EventBus';

export class Health {
  private maxHP: number;
  private currentHP: number;
  private maxShield: number;
  private currentShield: number;
  private shieldRechargeRate: number;
  private shieldRechargeDelay: number;
  private lastDamageTime: number = 0;

  constructor(
    maxHP: number = 100,
    maxShield: number = 50,
    shieldRechargeRate: number = 10,
    shieldRechargeDelay: number = 3
  ) {
    this.maxHP = maxHP;
    this.currentHP = maxHP;
    this.maxShield = maxShield;
    this.currentShield = maxShield;
    this.shieldRechargeRate = shieldRechargeRate;
    this.shieldRechargeDelay = shieldRechargeDelay;
  }

  takeDamage(amount: number): void {
    const now = performance.now() / 1000;
    this.lastDamageTime = now;

    // Shield absorbs damage first
    if (this.currentShield > 0) {
      const shieldDamage = Math.min(amount, this.currentShield);
      this.currentShield -= shieldDamage;
      amount -= shieldDamage;
    }

    // Remaining damage goes to HP
    if (amount > 0) {
      this.currentHP = Math.max(0, this.currentHP - amount);
      eventBus.emit('player/hurt', { amount });
    }

    if (this.currentHP <= 0) {
      eventBus.emit('player/dead', {});
    }
  }

  heal(amount: number): void {
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
  }

  update(deltaTime: number): void {
    const now = performance.now() / 1000;
    const timeSinceDamage = now - this.lastDamageTime;

    // Shield recharge
    if (timeSinceDamage >= this.shieldRechargeDelay && this.currentShield < this.maxShield) {
      this.currentShield = Math.min(
        this.maxShield,
        this.currentShield + this.shieldRechargeRate * deltaTime
      );
    }
  }

  getHP(): number {
    return this.currentHP;
  }

  getMaxHP(): number {
    return this.maxHP;
  }

  getShield(): number {
    return this.currentShield;
  }

  getMaxShield(): number {
    return this.maxShield;
  }

  getHPPercent(): number {
    return this.currentHP / this.maxHP;
  }

  getShieldPercent(): number {
    return this.currentShield / this.maxShield;
  }

  isDead(): boolean {
    return this.currentHP <= 0;
  }

  applyModifier(mod: { max?: string; rechargeRate?: string; rechargeDelay?: string }): void {
    if (mod.max) {
      const change = this.parsePercentChange(mod.max);
      this.maxShield = this.maxShield * (1 + change);
      this.currentShield = this.maxShield; // Refill on upgrade
    }
    if (mod.rechargeRate) {
      const change = this.parsePercentChange(mod.rechargeRate);
      this.shieldRechargeRate = this.shieldRechargeRate * (1 + change);
    }
    if (mod.rechargeDelay) {
      const change = this.parsePercentChange(mod.rechargeDelay);
      this.shieldRechargeDelay = Math.max(0.5, this.shieldRechargeDelay * (1 + change));
    }
  }

  private parsePercentChange(str: string): number {
    if (str.startsWith('+')) {
      return parseFloat(str.slice(1)) / 100;
    } else if (str.startsWith('-')) {
      return -parseFloat(str.slice(1)) / 100;
    }
    return 0;
  }
}

