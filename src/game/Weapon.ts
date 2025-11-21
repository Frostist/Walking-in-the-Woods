import * as THREE from 'three';

export interface WeaponStats {
  dmg: number;
  rpm: number;
  mag: number;
  reload: number;
  projectileSpeed: number;
}

export class Weapon {
  private currentStats: WeaponStats;
  private ammo: number;
  private reloadTimer: number = 0;
  private fireTimer: number = 0;
  private isReloading: boolean = false;
  private element: string | null = null;

  constructor(stats: WeaponStats) {
    this.currentStats = { ...stats };
    this.ammo = stats.mag;
  }

  fire(_direction: THREE.Vector3, _world: THREE.Scene, _camera: THREE.Camera): boolean {
    if (this.isReloading || this.ammo <= 0 || this.fireTimer > 0) {
      return false;
    }

    this.ammo--;
    this.fireTimer = 60 / this.currentStats.rpm;

    return true; // Return true if fired (hit detection handled by caller)
  }

  update(deltaTime: number): void {
    if (this.fireTimer > 0) {
      this.fireTimer -= deltaTime;
    }

    if (this.isReloading) {
      this.reloadTimer -= deltaTime;
      if (this.reloadTimer <= 0) {
        this.ammo = this.currentStats.mag;
        this.isReloading = false;
      }
    }
  }

  reload(): void {
    if (this.ammo < this.currentStats.mag && !this.isReloading) {
      this.isReloading = true;
      this.reloadTimer = this.currentStats.reload;
    }
  }

  applyModifier(mod: Partial<WeaponStats> & { element?: string }): void {
    if (mod.dmg !== undefined) {
      this.currentStats.dmg = mod.dmg;
    }
    if (mod.rpm !== undefined) {
      this.currentStats.rpm = mod.rpm;
    }
    if (mod.mag !== undefined) {
      this.currentStats.mag = mod.mag;
    }
    if (mod.reload !== undefined) {
      this.currentStats.reload = mod.reload;
    }
    if (mod.projectileSpeed !== undefined) {
      this.currentStats.projectileSpeed = mod.projectileSpeed;
    }
    if (mod.element) {
      this.element = mod.element;
    }
  }

  getStats(): WeaponStats {
    return { ...this.currentStats };
  }

  getAmmo(): number {
    return this.ammo;
  }

  getMaxAmmo(): number {
    return this.currentStats.mag;
  }

  isReloadingNow(): boolean {
    return this.isReloading;
  }

  getReloadProgress(): number {
    if (!this.isReloading) return 1;
    return 1 - (this.reloadTimer / this.currentStats.reload);
  }

  getElement(): string | null {
    return this.element;
  }

  canFire(): boolean {
    return !this.isReloading && this.ammo > 0 && this.fireTimer <= 0;
  }
}

