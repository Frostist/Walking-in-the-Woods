import { EnemyManager, EnemyConfig, SpawnPoint } from './EnemyManager.js';

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
  private aliveEnemyIds: Set<string> = new Set();
  private enemyManager: EnemyManager;
  private spawnPoints: SpawnPoint[];
  private enemyConfigs: Map<string, EnemyConfig>;
  private activeModifier: string | null = null;
  private enemyQueue: Array<{ type: string; config: EnemyConfig }> = [];
  private spawnPointCooldowns: Map<string, number> = new Map();
  private lastSpawnCheck: number = Date.now();

  constructor(
    config: WaveConfig,
    enemyManager: EnemyManager,
    spawnPoints: SpawnPoint[],
    enemyConfigs: Map<string, EnemyConfig>
  ) {
    this.config = config;
    this.enemyManager = enemyManager;
    this.spawnPoints = spawnPoints;
    this.enemyConfigs = enemyConfigs;

    // Initialize spawn point cooldowns
    spawnPoints.forEach(sp => {
      this.spawnPointCooldowns.set(sp.id, 0);
    });
  }

  public startWave(index: number): void {
    this.currentWave = index;
    this.budget = this.config.baseBudget + this.config.budgetPerWave * (index - 1);
    this.spent = 0;
    this.maxAlive = Math.min(
      this.config.maxAliveBase + Math.floor(this.config.maxAlivePerWave * (index - 1)),
      24
    );
    this.aliveEnemyIds.clear();
    this.enemyQueue = [];

    // Check for modifier
    if (Math.random() < this.config.modifierChance) {
      this.activeModifier = 'fog';
    } else {
      this.activeModifier = null;
    }

    // Queue enemies for this wave
    this.queueWaveEnemies();

    // Broadcast wave start
    // Note: This would be emitted via the server's io instance
  }

  private queueWaveEnemies(): void {
    const waveData = this.config.waves.find(w => w.index === this.currentWave);
    if (!waveData) return;

    // Queue enemies based on composition
    for (const [enemyType, count] of waveData.composition) {
      for (let i = 0; i < count; i++) {
        const config = this.enemyConfigs.get(enemyType);
        if (config && this.spent + config.cost <= this.budget) {
          this.enemyQueue.push({ type: enemyType, config });
        }
      }
    }

    // Check for mini-boss
    if (waveData.miniboss) {
      const bulwarkConfig = this.enemyConfigs.get('bulwark');
      if (bulwarkConfig) {
        this.enemyQueue.push({ type: 'bulwark', config: bulwarkConfig });
      }
    }
  }

  public update(deltaTime: number): boolean {
    // Update spawn point cooldowns
    for (const [spawnId, cooldown] of this.spawnPointCooldowns.entries()) {
      if (cooldown > 0) {
        this.spawnPointCooldowns.set(spawnId, cooldown - deltaTime);
      }
    }

    // Remove dead enemies from tracking
    const allEnemies = this.enemyManager.getAllEnemies();
    const aliveIds = new Set(allEnemies.map(e => e.id));
    this.aliveEnemyIds = aliveIds;

    // Try to spawn queued enemies
    if (this.canSpawnMore() && this.enemyQueue.length > 0) {
      this.trySpawnBatch();
    }

    // Check if wave is complete
    if (this.spent >= this.budget && this.aliveEnemyIds.size === 0) {
      // Wave complete - would emit event via server
      return true; // Return true to indicate wave complete
    }

    return false;
  }

  private canSpawnMore(): boolean {
    return this.aliveEnemyIds.size < this.maxAlive && this.spent < this.budget;
  }

  private trySpawnBatch(): void {
    const eligiblePoints = this.getEligibleSpawnPoints();
    if (eligiblePoints.length === 0) return;

    // Spawn batch of 3-5
    const batchSize = Math.min(Math.floor(Math.random() * 3) + 3, this.enemyQueue.length);
    
    for (let i = 0; i < batchSize && this.enemyQueue.length > 0; i++) {
      const { type, config } = this.enemyQueue.shift()!;
      const spawnPoint = eligiblePoints[Math.floor(Math.random() * eligiblePoints.length)];

      if (this.canSpawnAt(spawnPoint)) {
        const position = {
          x: spawnPoint.pos[0],
          y: spawnPoint.pos[1],
          z: spawnPoint.pos[2]
        };
        
        const enemyId = this.enemyManager.spawnEnemy(type, position);
        this.aliveEnemyIds.add(enemyId);
        this.spent += config.cost;
        
        // Set cooldown
        this.spawnPointCooldowns.set(spawnPoint.id, spawnPoint.cooldown || 12);
      } else {
        // Put back in queue
        this.enemyQueue.unshift({ type, config });
      }
    }
  }

  private getEligibleSpawnPoints(): SpawnPoint[] {
    // For now, return all spawn points that aren't on cooldown
    // In a full implementation, we'd check distance to nearest player
    return this.spawnPoints.filter(sp => {
      const cooldown = this.spawnPointCooldowns.get(sp.id) || 0;
      return cooldown <= 0;
    });
  }

  private canSpawnAt(spawnPoint: SpawnPoint): boolean {
    // Simple check - in full implementation would check distance to players
    return true;
  }

  public getCurrentWave(): number {
    return this.currentWave;
  }

  public getActiveModifier(): string | null {
    return this.activeModifier;
  }

  public onEnemyKilled(enemyId: string): void {
    this.aliveEnemyIds.delete(enemyId);
  }
}

