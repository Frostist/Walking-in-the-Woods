import { eventBus } from '../app/EventBus';
import { RNG } from '../core/RNG';
import { Enemy, EnemyConfig } from './Enemy';
import { World } from './World';
import { Player } from './Player';
import { SpawnManager } from './SpawnManager';

export interface WaveConfig {
  startIndex: number;
  baseBudget: number;
  budgetPerWave: number;
  maxAliveBase: number;
  maxAlivePerWave: number;
  modifierChance: number;
  miniBossEvery: number[];
  bossThresholds: number[];
  waves: Array<{
    index: number;
    composition: Array<[string, number]>;
    maxAlive: number;
    miniboss?: boolean;
  }>;
}

export class WaveManager {
  private config: WaveConfig;
  private currentWave: number = 0;
  private budget: number = 0;
  private spent: number = 0;
  private maxAlive: number = 6;
  private aliveEnemies: Enemy[] = [];
  private spawnManager: SpawnManager;
  private enemyConfigs: Map<string, EnemyConfig>;
  private activeModifier: string | null = null;

  constructor(
    config: WaveConfig,
    _world: World,
    _player: Player,
    spawnManager: SpawnManager,
    enemyConfigs: Map<string, EnemyConfig>
  ) {
    this.config = config;
    this.spawnManager = spawnManager;
    this.enemyConfigs = enemyConfigs;
  }

  startWave(index: number): void {
    this.currentWave = index;
    this.budget = this.config.baseBudget + this.config.budgetPerWave * (index - 1);
    this.spent = 0;
    this.maxAlive = Math.min(
      this.config.maxAliveBase + this.config.maxAlivePerWave * (index - 1),
      24
    );

    // Check for modifier
    if (RNG.random() < this.config.modifierChance) {
      this.activeModifier = 'fog';
    } else {
      this.activeModifier = null;
    }

    const seed = RNG.seedFor(`wave${index}`);
    RNG.seed(seed);
    eventBus.emit('wave/start', { index, seed });

    // Start spawning
    this.spawnWaveEnemies();
  }

  private spawnWaveEnemies(): void {
    const waveData = this.config.waves.find(w => w.index === this.currentWave);
    if (!waveData) return;

    // Spawn enemies based on composition
    for (const [enemyType, count] of waveData.composition) {
      for (let i = 0; i < count; i++) {
        const config = this.enemyConfigs.get(enemyType);
        if (config && this.spent + config.cost <= this.budget) {
          this.spawnManager.queueEnemy(enemyType, config);
        }
      }
    }

    // Check for mini-boss
    if (waveData.miniboss) {
      const bulwarkConfig = this.enemyConfigs.get('bulwark');
      if (bulwarkConfig) {
        this.spawnManager.queueEnemy('bulwark', bulwarkConfig);
        eventBus.emit('enemy/miniboss/spawned', {});
      }
    }
  }

  onEnemySpawned(enemy: Enemy): void {
    this.aliveEnemies.push(enemy);
    this.spent += enemy.getCost();
  }

  onEnemyKilled(enemy: Enemy): void {
    const index = this.aliveEnemies.indexOf(enemy);
    if (index > -1) {
      this.aliveEnemies.splice(index, 1);
    }

    // Check if wave is complete
    if (this.spent >= this.budget && this.aliveEnemies.length === 0) {
      eventBus.emit('wave/clear', {});
    }
  }

  update(_deltaTime: number): void {
    // Spawn manager handles spawning
    // Just track alive enemies
    this.aliveEnemies = this.aliveEnemies.filter(e => !e.isDeadNow());
  }

  getCurrentWave(): number {
    return this.currentWave;
  }

  getActiveModifier(): string | null {
    return this.activeModifier;
  }

  canSpawnMore(): boolean {
    return this.aliveEnemies.length < this.maxAlive && this.spent < this.budget;
  }
}

