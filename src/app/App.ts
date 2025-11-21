import * as THREE from 'three';
import { Time } from '../core/Time';
import { Input } from '../core/Input';
import { CameraRig } from '../core/CameraRig';
import { Effects } from '../core/Effects';
import { GameState, GameStateType } from '../game/GameState';
import { World } from '../game/World';
import { Player } from '../game/Player';
import { Enemy, EnemyConfig } from '../game/Enemy';
import { WaveManager, WaveConfig } from '../game/WaveManager';
import { SpawnManager, SpawnPoint } from '../game/SpawnManager';
import { Economy } from '../game/Economy';
import { ShrineManager, DeitiesConfig, Boon } from '../game/ShrineManager';
import { UI } from '../game/UI';
import { eventBus } from './EventBus';
import { RNG } from '../core/RNG';
import { NetworkManager, EnemyState } from '../game/NetworkManager';

export class App {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private cameraRig: CameraRig;
  private scene: THREE.Scene;
  private world: World;
  private player: Player;
  private gameState: GameState;
  private waveManager: WaveManager | null = null;
  private spawnManager: SpawnManager | null = null;
  private shrineManager: ShrineManager | null = null;
  private economy: Economy;
  private ui: UI | null = null;
  private effects: Effects;
  private enemies: Enemy[] = [];
  private enemyMap: Map<string, Enemy> = new Map(); // Server enemy ID -> Client Enemy
  private networkManager: NetworkManager;
  private animationId: number = 0;
  private lastPlayerUpdate: number = 0;
  private playerUpdateInterval: number = 0.05; // Send position updates 20 times per second
  private enemyConfigs: Map<string, EnemyConfig> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Initialize camera
    this.cameraRig = new CameraRig(container, this.renderer.domElement);

    // Initialize input
    Input.init(this.renderer.domElement);
    
    // Add click handler to canvas to activate pointer lock
    // This must be a direct user interaction (click), not mousedown
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.cameraRig.isLocked()) {
        console.log('Attempting to lock pointer...');
        this.cameraRig.lock();
      }
    });

    // Initialize world
    this.world = new World();
    this.scene = this.world.scene;

    // Add camera controls object to scene (required for PointerLockControls to work)
    this.scene.add(this.cameraRig.getObject());

    // Initialize effects
    this.effects = new Effects(this.scene);

    // Initialize game state
    this.gameState = new GameState();

    // Initialize economy
    this.economy = new Economy();

    // Initialize player
    this.player = new Player(this.world, this.cameraRig.camera);

    // Initialize network manager
    const serverUrl = (window as any).SERVER_URL || 'http://localhost:3001';
    this.networkManager = new NetworkManager(serverUrl);
    this.networkManager.connect();

    // Load configs and initialize systems
    this.init().catch(console.error);
  }

  private async init(): Promise<void> {
    // Load configs
    const [enemiesConfig, wavesConfig, spawnsConfig, deitiesConfig, boonsConfig] = await Promise.all([
      fetch('/config/enemies.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load enemies.json: ${r.statusText}`);
        return r.json();
      }),
      fetch('/config/waves.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load waves.json: ${r.statusText}`);
        return r.json();
      }),
      fetch('/config/spawns.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load spawns.json: ${r.statusText}`);
        return r.json();
      }),
      fetch('/config/deities.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load deities.json: ${r.statusText}`);
        return r.json();
      }),
      fetch('/config/boons.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load boons.json: ${r.statusText}`);
        return r.json();
      })
    ]);

    // Convert enemy configs to Map
    this.enemyConfigs = new Map<string, EnemyConfig>();
    Object.entries(enemiesConfig).forEach(([key, value]) => {
      this.enemyConfigs.set(key, value as EnemyConfig);
    });

    // Initialize spawn manager
    this.spawnManager = new SpawnManager(this.world, this.player, spawnsConfig as SpawnPoint[]);

    // Initialize wave manager
    this.waveManager = new WaveManager(
      wavesConfig as WaveConfig,
      this.world,
      this.player,
      this.spawnManager,
      this.enemyConfigs
    );
    this.spawnManager.setWaveManager(this.waveManager);

    // Initialize shrine manager
    this.shrineManager = new ShrineManager(
      deitiesConfig as DeitiesConfig,
      boonsConfig as Boon[],
      this.world.scene,
      this.economy
    );

    // Initialize UI
    this.ui = new UI(
      this.container,
      this.economy,
      this.player,
      this.waveManager,
      this.shrineManager
    );

    // Setup event listeners
    this.setupEvents();
    this.setupNetworkEvents();

    // Start game
    this.gameState.setState(GameStateType.Boot);
    
    // Wait for network connection before starting wave
    if (this.networkManager.isConnected()) {
      this.networkManager.sendStartWave(1);
    } else {
      // Fallback: start wave locally if not connected
      this.startWave(1);
    }

    // Start game loop
    this.tick();
  }

  private setupEvents(): void {
    eventBus.on('wave/clear', () => {
      this.onWaveClear();
    });

    eventBus.on('player/dead', () => {
      this.onPlayerDeath();
    });

    eventBus.on('boon/selected', ({ boonId }) => {
      this.applyBoon(boonId);
    });

    eventBus.on('enemy/miniboss/spawned', () => {
      // Handle mini-boss spawn
    });
  }

  private setupNetworkEvents(): void {
    // Enemy updates from server
    this.networkManager.onEnemiesUpdate((enemies: EnemyState[]) => {
      this.updateEnemiesFromServer(enemies);
    });

    // Enemy spawned
    this.networkManager.onEnemySpawned((data) => {
      this.spawnEnemyFromServer(data);
    });

    // Enemy died
    this.networkManager.onEnemyDied((data) => {
      this.removeEnemyFromServer(data.id);
    });

    // Enemy health update
    this.networkManager.onEnemyHealthUpdate((data) => {
      const enemy = this.enemyMap.get(data.id);
      if (enemy) {
        // Update enemy health (would need to add method to Enemy class)
        // For now, we'll rely on the server state updates
      }
    });

    // Game state updates
    this.networkManager.onGameStateUpdate((data) => {
      if (data.state === 'InWave') {
        this.gameState.setState(GameStateType.InWave);
      } else if (data.state === 'Downtime') {
        this.gameState.setState(GameStateType.Downtime);
        this.startDowntime();
      } else if (data.state === 'WaveClear') {
        this.gameState.setState(GameStateType.WaveClear);
      }
    });

    // Wave started
    this.networkManager.onWaveStarted((data) => {
      this.gameState.setState(GameStateType.InWave);
      if (this.waveManager) {
        // Update wave number if needed
      }
    });

    // Enemy killed (for economy)
    this.networkManager.onEnemyKilled((data) => {
      // Drop currency
      const essenceDrop = RNG.randomInt(1, 3);
      this.economy.addEssence(essenceDrop);

      // Chance for fairy dust
      const fairyChance = 0.05; // 5% base
      if (RNG.random() < fairyChance) {
        this.economy.addFairy(1);
      }
    });

    // Player damaged
    this.networkManager.onPlayerDamaged((data) => {
      // Handle player damage from server
      // This would be handled by the Player class if needed
    });
  }

  private startWave(index: number): void {
    this.gameState.setState(GameStateType.InWave);
    this.waveManager?.startWave(index);
  }

  private onWaveClear(): void {
    this.gameState.setState(GameStateType.WaveClear);
    this.startDowntime();
  }

  private startDowntime(): void {
    this.gameState.setState(GameStateType.Downtime);
    this.shrineManager?.startDowntime();
  }

  private onPlayerDeath(): void {
    this.gameState.setState(GameStateType.Wipe);
    // Show death screen
  }

  private applyBoon(_boonId: string): void {
    // Boon application is handled by ShrineManager
    // This is a hook for additional effects
  }

  private tick = (): void => {
    this.animationId = requestAnimationFrame(this.tick);

    const deltaTime = Time.step(performance.now() / 1000);
    if (deltaTime === 0) return;

    // Update input
    // Input is polled on demand

    // Update camera controls first (handles mouse look)
    this.cameraRig.update(deltaTime);

    // Update player (movement relative to camera)
    this.player.update(deltaTime);

    // Sync camera position with player position
    const controlsObject = this.cameraRig.getObject();
    controlsObject.position.copy(this.player.getPosition());

    // Send player position updates to server
    this.lastPlayerUpdate += deltaTime;
    if (this.lastPlayerUpdate >= this.playerUpdateInterval) {
      const pos = this.player.getPosition();
      this.networkManager.sendPlayerUpdate(
        { x: pos.x, y: pos.y, z: pos.z },
        0 // rotationY would need to be tracked
      );
      this.lastPlayerUpdate = 0;
    }

    // Handle player fire
    if (Input.isMouseDown(0) && this.gameState.isInWave()) {
      if (this.player.fire()) {
        // Hit detection
        this.handlePlayerFire();
      }
    }

    // Update enemies from server state (if connected)
    if (this.networkManager.isConnected()) {
      // Enemies are updated via network events
      // Just update visual positions here
      this.enemies.forEach(enemy => {
        // Position updates come from server via enemiesUpdate event
      });
    } else {
      // Fallback: local enemy management
      this.enemies.forEach(enemy => {
        enemy.update(deltaTime);
        if (enemy.isDeadNow()) {
          this.onEnemyKilled(enemy);
        }
      });
      this.enemies = this.enemies.filter(e => !e.isDeadNow());

      // Update spawn manager
      this.spawnManager?.update(deltaTime);
      
      // Get newly spawned enemies
      if (this.spawnManager) {
        const newEnemies = this.spawnManager.getSpawnedEnemies();
        newEnemies.forEach(enemy => {
          if (!this.enemies.includes(enemy)) {
            this.enemies.push(enemy);
          }
        });
      }

      // Update wave manager
      this.waveManager?.update(deltaTime);
    }

    // Update shrine manager
    this.shrineManager?.update(deltaTime);

    // Handle shrine interaction
    if (Input.isKeyDown('f') && this.gameState.isDowntime()) {
      this.handleShrineInteraction();
    }

    // Update UI
    this.ui?.update();

    // Render
    this.renderer.render(this.scene, this.cameraRig.camera);
  };

  private handlePlayerFire(): void {
    const direction = this.cameraRig.getDirection();
    const raycaster = new THREE.Raycaster(
      this.cameraRig.camera.position,
      direction,
      0,
      60
    );

    const hits = raycaster.intersectObjects(this.world.enemyMeshes, true);
    if (hits.length > 0) {
      const hit = hits[0];
      const enemy = this.enemies.find(e => e.mesh === hit.object);
      if (enemy) {
        const weapon = this.player.getWeapon();
        const element = weapon.getElement();
        const damage = weapon.getStats().dmg;
        
        // Find server enemy ID
        let enemyId: string | null = null;
        for (const [id, e] of this.enemyMap.entries()) {
          if (e === enemy) {
            enemyId = id;
            break;
          }
        }
        
        if (enemyId && this.networkManager.isConnected()) {
          // Send damage to server
          this.networkManager.sendEnemyDamage(enemyId, damage, element || undefined);
        } else {
          // Local damage (fallback)
          enemy.takeDamage(damage, element || undefined);
        }
        
        this.effects.createHitFlash(hit.point, element === 'fire' ? 0xff7a00 : 0xff0000);
      }
    }
  }

  private handleShrineInteraction(): void {
    if (!this.shrineManager) return;

    const playerPos = this.player.getPosition();
    const activeDeities = this.shrineManager.getActiveDeities();

    for (const deityId of activeDeities) {
      const boons = this.shrineManager.interactShrine(deityId, playerPos);
      if (boons && boons.length > 0) {
        this.ui?.showBoonPicker(boons, (boon) => {
          if (this.shrineManager?.selectBoon(boon)) {
            this.applyBoonEffect(boon);
          }
        });
        break;
      }
    }
  }

  private applyBoonEffect(boon: Boon): void {
    if (boon.slot === 'weapon' && boon.effect.weapon) {
      const weapon = this.player.getWeapon();
      const mod: any = {};
      
      if (boon.effect.weapon.dmg) {
        const change = this.parsePercentChange(boon.effect.weapon.dmg);
        mod.dmg = weapon.getStats().dmg * (1 + change);
      }
      if (boon.effect.weapon.rpm) {
        const change = this.parsePercentChange(boon.effect.weapon.rpm);
        mod.rpm = weapon.getStats().rpm * (1 + change);
      }
      if (boon.effect.element) {
        mod.element = boon.effect.element;
      }
      
      weapon.applyModifier(mod);
    }

    if (boon.slot === 'defense' && boon.effect.shield) {
      const health = this.player.getHealth();
      health.applyModifier(boon.effect.shield);
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

  private onEnemyKilled(enemy: Enemy): void {
    this.waveManager?.onEnemyKilled(enemy);
    
    // Drop currency
    const essenceDrop = RNG.randomInt(1, 3);
    this.economy.addEssence(essenceDrop);

    // Chance for fairy dust
    const fairyChance = 0.05; // 5% base
    if (RNG.random() < fairyChance) {
      this.economy.addFairy(1);
    }
  }

  private updateEnemiesFromServer(enemies: EnemyState[]): void {
    // Update existing enemies or create new ones
    const serverEnemyIds = new Set(enemies.map(e => e.id));
    
    // Remove enemies that no longer exist on server
    for (const [id, enemy] of this.enemyMap.entries()) {
      if (!serverEnemyIds.has(id)) {
        this.removeEnemyFromServer(id);
      }
    }
    
    // Update or create enemies
    for (const enemyState of enemies) {
      let enemy = this.enemyMap.get(enemyState.id);
      
      if (!enemy) {
        // Create new enemy if config is available
        const enemyConfig = this.enemyConfigs.get(enemyState.type);
        if (enemyConfig) {
          const position = new THREE.Vector3(
            enemyState.position.x,
            enemyState.position.y,
            enemyState.position.z
          );
          enemy = new Enemy(enemyConfig, position, this.world, this.player);
          this.enemies.push(enemy);
          this.enemyMap.set(enemyState.id, enemy);
        } else {
          console.warn(`Cannot create enemy: config not found for type ${enemyState.type}`);
          continue;
        }
      }
      
      // Update position
      enemy.position.set(enemyState.position.x, enemyState.position.y, enemyState.position.z);
      enemy.mesh.position.copy(enemy.position);
      
      // Update rotation
      enemy.mesh.rotation.y = enemyState.rotationY;
    }
  }

  private spawnEnemyFromServer(data: { id: string; type: string; position: { x: number; y: number; z: number }; health: number; maxHealth: number }): void {
    // Get enemy config
    const enemyConfig = this.enemyConfigs.get(data.type);
    if (!enemyConfig) {
      console.warn(`Unknown enemy type: ${data.type}`);
      return;
    }
    
    const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    const enemy = new Enemy(enemyConfig, position, this.world, this.player);
    
    this.enemies.push(enemy);
    this.enemyMap.set(data.id, enemy);
  }

  private removeEnemyFromServer(enemyId: string): void {
    const enemy = this.enemyMap.get(enemyId);
    if (enemy) {
      // Remove from arrays
      const index = this.enemies.indexOf(enemy);
      if (index > -1) {
        this.enemies.splice(index, 1);
      }
      
      // Remove from world
      this.world.removeEnemy(enemy.mesh);
      
      // Clean up
      enemy.mesh.geometry.dispose();
      (enemy.mesh.material as THREE.Material).dispose();
      
      this.enemyMap.delete(enemyId);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.networkManager.disconnect();
    this.renderer.dispose();
  }
}

