import * as THREE from 'three';
import { RNG } from '../core/RNG';
import { eventBus } from '../app/EventBus';
import { Economy } from './Economy';

export interface Deity {
  color: string;
  slots: string[];
}

export interface Boon {
  id: string;
  deity: string;
  slot: string;
  rarity: string;
  cost: { essence?: number; fairy?: number };
  effect: {
    weapon?: any;
    shield?: any;
    passive?: any;
    utility?: any;
    element?: string;
  };
}

export interface DeitiesConfig {
  [key: string]: Deity;
}

export class ShrineManager {
  private deities: DeitiesConfig;
  private boons: Boon[];
  private activeDeities: string[] = [];
  private shrines: Map<string, THREE.Mesh> = new Map();
  private world: THREE.Scene;
  private economy: Economy;
  private downtimeDuration: number = 25;
  private downtimeTimer: number = 0;
  private isDowntime: boolean = false;

  constructor(
    deities: DeitiesConfig,
    boons: Boon[],
    world: THREE.Scene,
    economy: Economy
  ) {
    this.deities = deities;
    this.boons = boons;
    this.world = world;
    this.economy = economy;

    // Create shrine meshes
    this.createShrines();
  }

  private createShrines(): void {
    const shrinePositions = [
      new THREE.Vector3(-15, 0, 15),
      new THREE.Vector3(15, 0, -15),
    ];

    shrinePositions.forEach((pos, index) => {
      const deityId = Object.keys(this.deities)[index];
      if (!deityId) return;

      // Hex pedestal
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(1, 1.2, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a })
      );
      pedestal.position.copy(pos);
      pedestal.position.y = 0.25;
      this.world.add(pedestal);

      // Rune plane
      const rune = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        new THREE.MeshBasicMaterial({
          color: this.deities[deityId].color,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        })
      );
      rune.position.copy(pos);
      rune.position.y = 0.8;
      rune.rotation.x = -Math.PI / 2;
      this.world.add(rune);

      this.shrines.set(deityId, pedestal);
    });
  }

  startDowntime(): void {
    this.isDowntime = true;
    this.downtimeTimer = this.downtimeDuration;
    
    // Activate 2 deities
    const deityKeys = Object.keys(this.deities);
    const shuffled = [...deityKeys].sort(() => RNG.random() - 0.5);
    this.activeDeities = shuffled.slice(0, 2);

    // Illuminate shrines
    this.activeDeities.forEach(deityId => {
      const shrine = this.shrines.get(deityId);
      if (shrine) {
        (shrine.material as THREE.MeshStandardMaterial).emissive.setHex(
          parseInt(this.deities[deityId].color.replace('#', '0x'))
        );
        (shrine.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
      }
    });

    eventBus.emit('downtime/start', {
      duration: this.downtimeDuration,
      activeDeities: this.activeDeities
    });
  }

  update(deltaTime: number): void {
    if (this.isDowntime) {
      this.downtimeTimer -= deltaTime;
      
      // Rotate rune planes
      this.activeDeities.forEach(deityId => {
        const rune = this.world.children.find(child => 
          child.position.distanceTo(this.shrines.get(deityId)!.position) < 1
        );
        if (rune) {
          rune.rotation.z += deltaTime * 0.5;
        }
      });

      if (this.downtimeTimer <= 0) {
        this.endDowntime();
      }
    }
  }

  endDowntime(): void {
    this.isDowntime = false;
    
    // Dim shrines
    this.activeDeities.forEach(deityId => {
      const shrine = this.shrines.get(deityId);
      if (shrine) {
        (shrine.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        (shrine.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      }
    });

    this.activeDeities = [];
    eventBus.emit('downtime/end', {});
  }

  interactShrine(deityId: string, playerPos: THREE.Vector3): Boon[] | null {
    if (!this.isDowntime || !this.activeDeities.includes(deityId)) {
      return null;
    }

    const shrine = this.shrines.get(deityId);
    if (!shrine) return null;

    const distance = shrine.position.distanceTo(playerPos);
    if (distance > 3) return null;

    // Roll 2 boons for this deity
    const seed = RNG.seedFor(`downtime_${deityId}`);
    RNG.seed(seed);
    
    const deityBoons = this.boons.filter(b => b.deity === deityId);
    const rolledBoons = this.pickTwo(deityBoons);

    return rolledBoons;
  }

  selectBoon(boon: Boon): boolean {
    if (!this.economy.canAfford(boon.cost)) {
      return false;
    }

    if (!this.economy.spend(boon.cost)) {
      return false;
    }

    eventBus.emit('boon/selected', {
      deity: boon.deity,
      boonId: boon.id,
      slot: boon.slot as any
    });

    return true;
  }

  private pickTwo(boons: Boon[]): Boon[] {
    if (boons.length <= 2) return [...boons];

    const selected: Boon[] = [];
    const available = [...boons];

    for (let i = 0; i < 2; i++) {
      const index = RNG.randomInt(0, available.length - 1);
      selected.push(available[index]);
      available.splice(index, 1);
    }

    return selected;
  }

  getActiveDeities(): string[] {
    return [...this.activeDeities];
  }

  isInDowntime(): boolean {
    return this.isDowntime;
  }

  getDowntimeRemaining(): number {
    return Math.max(0, this.downtimeTimer);
  }
}

