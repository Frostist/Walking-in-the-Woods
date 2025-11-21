import * as THREE from 'three';
import { RNG } from '../core/RNG';
import { Enemy, EnemyConfig } from './Enemy';
import { World } from './World';
import { Player } from './Player';
import { WaveManager } from './WaveManager';

export interface SpawnPoint {
  id: string;
  pos: [number, number, number];
  tags: string[];
  cooldown?: number;
}

export class SpawnManager {
  private spawnPoints: Array<{ id: string; pos: THREE.Vector3; tags: string[]; cooldown: number; timer: number }> = [];
  private world: World;
  private player: Player;
  private waveManager: WaveManager | null = null;
  private enemyQueue: Array<{ type: string; config: EnemyConfig }> = [];
  private spawnedEnemies: Enemy[] = [];
  private proximityMin: number = 35;
  private proximityMax: number = 55;
  private safetyBubble: number = 12;

  constructor(world: World, player: Player, spawnPoints: SpawnPoint[]) {
    this.world = world;
    this.player = player;

    // Convert spawn points
    spawnPoints.forEach(sp => {
      this.spawnPoints.push({
        id: sp.id,
        pos: new THREE.Vector3(sp.pos[0], sp.pos[1], sp.pos[2]),
        tags: sp.tags,
        cooldown: sp.cooldown || 12,
        timer: 0
      });
    });
  }

  setWaveManager(waveManager: WaveManager): void {
    this.waveManager = waveManager;
  }

  queueEnemy(type: string, config: EnemyConfig): void {
    this.enemyQueue.push({ type, config });
  }

  update(deltaTime: number): void {
    // Update cooldowns
    this.spawnPoints.forEach(sp => {
      if (sp.timer > 0) {
        sp.timer -= deltaTime;
      }
    });

    // Clear spawned enemies list (they're tracked by App now)
    this.spawnedEnemies = [];

    // Spawn queued enemies
    if (this.enemyQueue.length > 0 && this.waveManager?.canSpawnMore()) {
      this.spawnedEnemies = this.trySpawnBatch();
    }
  }

  private trySpawnBatch(): Enemy[] {
    const eligiblePoints = this.getEligiblePoints();
    if (eligiblePoints.length === 0) return [];

    const spawned: Enemy[] = [];
    // Spawn batch of 3-5
    const batchSize = Math.min(RNG.randomInt(3, 5), this.enemyQueue.length);
    
    for (let i = 0; i < batchSize && this.enemyQueue.length > 0; i++) {
      const { type, config } = this.enemyQueue.shift()!;
      const spawnPoint = RNG.choice(eligiblePoints);

      if (this.canSpawnAt(spawnPoint)) {
        const enemy = this.spawnEnemy(type, config, spawnPoint.pos);
        spawned.push(enemy);
        spawnPoint.timer = spawnPoint.cooldown;
      } else {
        // Put back in queue
        this.enemyQueue.unshift({ type, config });
      }
    }
    return spawned;
  }

  getSpawnedEnemies(): Enemy[] {
    return [...this.spawnedEnemies];
  }

  private getEligiblePoints(): Array<typeof this.spawnPoints[0]> {
    const playerPos = this.player.getPosition();
    
    return this.spawnPoints.filter(sp => {
      const distance = sp.pos.distanceTo(playerPos);
      return (
        distance >= this.proximityMin &&
        distance <= this.proximityMax &&
        sp.timer <= 0 &&
        this.hasLineOfSight(sp.pos, playerPos)
      );
    });
  }

  private canSpawnAt(spawnPoint: typeof this.spawnPoints[0]): boolean {
    const playerPos = this.player.getPosition();
    const distance = spawnPoint.pos.distanceTo(playerPos);
    return distance >= this.safetyBubble;
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    // Simple LoS check (raycast would be better)
    const direction = to.clone().sub(from).normalize();
    const raycaster = new THREE.Raycaster(from, direction, 0, from.distanceTo(to));
    
    // Check against props
    const intersects = raycaster.intersectObjects(this.world.props, false);
    return intersects.length === 0;
  }

  private spawnEnemy(_type: string, config: EnemyConfig, position: THREE.Vector3): Enemy {
    const enemy = new Enemy(config, position, this.world, this.player);
    this.waveManager?.onEnemySpawned(enemy);
    return enemy;
  }
}

