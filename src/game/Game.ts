import * as THREE from 'three';
import { PlayerController } from './PlayerController';
import { SceneManager } from './SceneManager';
import { Character } from './Character';
import { NetworkManager, ConnectionStatus } from './NetworkManager';
import { RemotePlayer } from './RemotePlayer';
import { Bullet } from './Bullet';
import { BlockManager } from './BlockManager';
import { Leaderboard } from './Leaderboard';
import { UpdateNotifier } from './UpdateNotifier';
import { NightMonster } from './NightMonster';

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private playerController: PlayerController;
    private sceneManager: SceneManager;
    private character: Character;
    private networkManager: NetworkManager;
    private remotePlayers: Map<string, RemotePlayer> = new Map();
    private bullets: Bullet[] = [];
    private blockManager: BlockManager;
    private nightMonsters: Map<string, NightMonster> = new Map();
    private raycaster: THREE.Raycaster;
    private leaderboard: Leaderboard;
    private updateNotifier: UpdateNotifier;
    private animationId: number = 0;
    private lastTime: number = 0;
    private lastStatusUpdate: number = 0;
    private statusUpdateInterval: number = 500; // Update status every 500ms
    private lastShotTime: number = 0;
    private shotCooldown: number = 100; // Milliseconds between shots
    private isDead: boolean = false;
    
    // Safe spawn zone properties
    private readonly SPAWN_ZONE_CENTER = new THREE.Vector3(0, 0, 0);
    private readonly SPAWN_ZONE_RADIUS = 8; // 8 unit radius safe zone
    private hasLeftSpawnZone: boolean = false;
    private spawnZoneVisual: THREE.Group | null = null;

    constructor() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        // Removed fog - it was making everything blue

        // Create camera
        const aspect = window.innerWidth / window.innerHeight;
        const fov = 75;
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
        this.camera.position.set(0, 1.6, 0); // Eye height
        // Make sure camera looks slightly down to see the ground
        this.camera.rotation.x = -0.1;
        // Set camera to only see layer 0 (character will be on layer 1 in first-person to hide it but allow shadows)
        this.camera.layers.set(0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;

        // Create managers
        this.playerController = new PlayerController(this.camera, this.renderer.domElement);
        this.sceneManager = new SceneManager(this.scene);
        this.character = new Character(this.camera, this.scene);
        this.blockManager = new BlockManager(this.scene);
        this.raycaster = new THREE.Raycaster();
        
        // Connect block manager to player controller for collision detection
        this.playerController.setBlockManager(this.blockManager);
        
        // Initialize network manager - use environment variable or default to localhost
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
        this.networkManager = new NetworkManager(serverUrl);
        
        // Initialize leaderboard
        this.leaderboard = new Leaderboard(serverUrl);
        
        // Initialize update notifier
        this.updateNotifier = new UpdateNotifier();
    }

    public async init(): Promise<void> {
        // Disable controls until name is entered
        this.playerController.disableControls();
        
        // Check if player name is already in cookies
        let playerName = this.getPlayerNameFromCookie();
        
        // If no name in cookies, show name input modal
        if (!playerName) {
            playerName = await this.showNameInput();
            this.savePlayerNameToCookie(playerName);
        }
        
        this.networkManager.setPlayerName(playerName);
        
        // Check if player ID is already in cookies and pass it to network manager
        const storedPlayerId = this.getPlayerIdFromCookie();
        if (storedPlayerId) {
            this.networkManager.setStoredPlayerId(storedPlayerId);
        }
        
        // Enable controls after name is set
        this.playerController.enableControls();
        
        // Show loading screen
        this.showLoadingScreen();
        this.updateLoadingProgress(10, 'Setting up scene...');
        
        // Append canvas to container
        const container = document.getElementById('canvas-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        }

        // Setup scene
        this.sceneManager.setup();
        
        // Create spawn zone visual
        this.createSpawnZoneVisual();
        
        this.updateLoadingProgress(20, 'Loading character...');

        // Load gun for local character
        await this.character.loadGun();
        this.updateLoadingProgress(40, 'Connecting to server...');

        // Connect to multiplayer server
        this.networkManager.connect();
        
        // Setup callback to save player ID when received
        this.networkManager.setOnPlayerIdReceived((playerId) => {
            this.savePlayerIdToCookie(playerId);
        });

        // Setup callback to save registered player name when confirmed by server
        this.networkManager.setOnPlayerNameConfirmed((playerName) => {
            // Update cookie with the registered name (may have been modified by server if original was taken)
            this.savePlayerNameToCookie(playerName);
        });

        // Setup callback to generate trees when received from server
        this.networkManager.onTreesReceived((trees) => {
            this.sceneManager.generateTreesFromServerData(trees);
            this.updateLoadingProgress(70, 'Loading trees...');
        });

        // Setup callback to generate grass when received from server
        this.networkManager.onGrassReceived((grass) => {
            this.sceneManager.generateGrassFromServerData(grass);
            this.updateLoadingProgress(90, 'Loading grass...');
        });

        // Setup callback for bullets from other players
        this.networkManager.onBulletReceived((bulletData) => {
            // Don't create bullet if it's from local player (we already created it)
            const localPlayerId = this.networkManager.getPlayerId();
            if (bulletData.shooterId !== localPlayerId) {
                const position = new THREE.Vector3(
                    bulletData.position.x,
                    bulletData.position.y,
                    bulletData.position.z
                );
                const direction = new THREE.Vector3(
                    bulletData.direction.x,
                    bulletData.direction.y,
                    bulletData.direction.z
                );
                const bullet = new Bullet(this.scene, position, direction, bulletData.shooterId);
                this.bullets.push(bullet);
            }
        });

        // Setup callback for player damage events
        this.networkManager.onPlayerDamaged((playerId, damage) => {
            const localPlayerId = this.networkManager.getPlayerId();
            if (playerId === localPlayerId) {
                // Local player took damage - apply it (this handles server-synchronized damage)
                // Note: We also apply damage immediately on hit detection, but server callback
                // ensures synchronization across all clients
                // Only apply damage if player doesn't have spawn protection
                if (!this.hasSpawnProtection()) {
                    this.character.takeDamage(damage);
                }
            } else {
                // Remote player took damage
                const remotePlayer = this.remotePlayers.get(playerId);
                if (remotePlayer) {
                    remotePlayer.takeDamage(damage);
                }
            }
        });

        // Setup callback for monster updates from server
        this.networkManager.onMonsterUpdate((position, rotationY, health, maxHealth) => {
            this.sceneManager.updateMonsterFromServer(position, rotationY, health, maxHealth);
        });

        // Setup callback for monster death
        this.networkManager.onMonsterDied(() => {
            this.sceneManager.handleMonsterDeath();
        });

        // Setup callback for monster respawn
        this.networkManager.onMonsterRespawned((position, rotationY, health, maxHealth) => {
            this.sceneManager.handleMonsterRespawn(position, rotationY, health, maxHealth);
        });

        // Setup callbacks for night monsters
        this.networkManager.onNightMonstersSpawned((monsters) => {
            for (const monsterData of monsters) {
                const position = new THREE.Vector3(monsterData.position.x, monsterData.position.y, monsterData.position.z);
                const nightMonster = new NightMonster(this.scene, position, monsterData.id);
                this.nightMonsters.set(monsterData.id, nightMonster);
            }
        });

        this.networkManager.onNightMonstersUpdate((monsters) => {
            for (const monsterData of monsters) {
                const nightMonster = this.nightMonsters.get(monsterData.id);
                if (nightMonster) {
                    nightMonster.updateFromServer(
                        monsterData.position,
                        monsterData.rotationY,
                        monsterData.health,
                        monsterData.maxHealth
                    );
                }
            }
        });

        this.networkManager.onNightMonstersDied((monsterIds) => {
            for (const monsterId of monsterIds) {
                const nightMonster = this.nightMonsters.get(monsterId);
                if (nightMonster) {
                    nightMonster.die();
                    nightMonster.dispose();
                    this.nightMonsters.delete(monsterId);
                }
            }
        });

        this.networkManager.onNightMonsterDied((monsterId) => {
            const nightMonster = this.nightMonsters.get(monsterId);
            if (nightMonster) {
                nightMonster.die();
                nightMonster.dispose();
                this.nightMonsters.delete(monsterId);
            }
        });

        // Setup callback for monster health updates
        this.networkManager.onMonsterHealthUpdate((health, maxHealth) => {
            this.sceneManager.updateMonsterHealth(health, maxHealth);
        });

        // Setup callback for blocks from server
        this.networkManager.onBlocksReceived((blocks) => {
            blocks.forEach(block => {
                this.blockManager.addBlockFromNetwork(block);
            });
            this.updateLoadingProgress(95, 'Loading blocks...');
        });

        // Setup callback for block placement from other players
        this.networkManager.onBlockPlaced((blockData) => {
            // Don't add block if we placed it (we already added it locally)
            this.blockManager.addBlockFromNetwork(blockData);
        });

        // Setup callback for block removal from other players
        this.networkManager.onBlockRemoved((blockData) => {
            this.blockManager.removeBlockFromNetwork(blockData);
        });

        // Setup event listeners
        this.setupEventListeners();

        // Initialize connection status UI
        this.updateConnectionStatus();
        
        // Setup health UI
        this.setupHealthUI();
        
        // Wait a bit for everything to settle, then hide loading screen
        setTimeout(() => {
            this.updateLoadingProgress(100, 'Ready!');
            setTimeout(() => {
                this.hideLoadingScreen();
            }, 500);
        }, 1000);

        // Start game loop
        this.gameLoop(0);
    }
    
    private showLoadingScreen(): void {
        const loadingScreen = document.createElement('div');
        loadingScreen.id = 'loading-screen';
        loadingScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: #000;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        `;
        
        loadingScreen.innerHTML = `
            <h1 style="margin-bottom: 30px; font-size: 32px;">Loading Game...</h1>
            <div id="loading-bar-container" style="width: 400px; height: 30px; background: rgba(255, 255, 255, 0.2); border-radius: 15px; overflow: hidden; margin-bottom: 15px;">
                <div id="loading-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease; border-radius: 15px;"></div>
            </div>
            <div id="loading-status" style="font-size: 16px; color: #ccc;">Initializing...</div>
            <div id="loading-percentage" style="margin-top: 10px; font-size: 14px; color: #999;">0%</div>
        `;
        
        document.body.appendChild(loadingScreen);
    }
    
    private updateLoadingProgress(percentage: number, status: string): void {
        const loadingBar = document.getElementById('loading-bar');
        const loadingStatusEl = document.getElementById('loading-status');
        const loadingPercentage = document.getElementById('loading-percentage');
        
        if (loadingBar) {
            loadingBar.style.width = `${percentage}%`;
        }
        if (loadingStatusEl) {
            loadingStatusEl.textContent = status;
        }
        if (loadingPercentage) {
            loadingPercentage.textContent = `${Math.round(percentage)}%`;
        }
    }
    
    private hideLoadingScreen(): void {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.transition = 'opacity 0.5s ease';
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                if (loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }
            }, 500);
        }
    }

    private getPlayerNameFromCookie(): string | null {
        const name = document.cookie
            .split('; ')
            .find(row => row.startsWith('playerName='))
            ?.split('=')[1];
        return name ? decodeURIComponent(name) : null;
    }

    private savePlayerNameToCookie(name: string): void {
        // Save for 1 year
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `playerName=${encodeURIComponent(name)}; expires=${expires.toUTCString()}; path=/`;
    }

    private getPlayerIdFromCookie(): string | null {
        const id = document.cookie
            .split('; ')
            .find(row => row.startsWith('playerId='))
            ?.split('=')[1];
        return id ? decodeURIComponent(id) : null;
    }

    private savePlayerIdToCookie(id: string): void {
        // Save for 1 year
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);
        document.cookie = `playerId=${encodeURIComponent(id)}; expires=${expires.toUTCString()}; path=/`;
    }

    private showNameInput(): Promise<string> {
        return new Promise((resolve) => {
            const savedName = this.getPlayerNameFromCookie();
            
            const modal = document.createElement('div');
            modal.id = 'name-input-modal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.9);
                z-index: 20000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            `;
            
            modal.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 40px;
                    border-radius: 16px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    max-width: 500px;
                    width: 90%;
                    text-align: center;
                ">
                    <h1 style="color: white; margin: 0 0 20px 0; font-size: 28px;">Enter Your Name</h1>
                    <p style="color: rgba(255, 255, 255, 0.9); margin: 0 0 25px 0; font-size: 16px;">
                        Choose a name to display in the game
                    </p>
                    <input 
                        type="text" 
                        id="name-input" 
                        placeholder="Player Name" 
                        maxlength="20"
                        value="${savedName || ''}"
                        style="
                            width: 100%;
                            padding: 15px;
                            font-size: 18px;
                            border: 2px solid rgba(255, 255, 255, 0.3);
                            border-radius: 8px;
                            background: rgba(255, 255, 255, 0.95);
                            color: #333;
                            box-sizing: border-box;
                            margin-bottom: 20px;
                            outline: none;
                            transition: border-color 0.3s;
                        "
                        onfocus="this.style.borderColor='rgba(255, 255, 255, 0.8)'"
                        onblur="this.style.borderColor='rgba(255, 255, 255, 0.3)'"
                    />
                    <button 
                        id="name-submit-btn"
                        style="
                            width: 100%;
                            padding: 15px;
                            font-size: 18px;
                            font-weight: 600;
                            background: white;
                            color: #667eea;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            transition: transform 0.2s, box-shadow 0.2s;
                        "
                        onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 5px 15px rgba(0, 0, 0, 0.3)'"
                        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='none'"
                    >
                        Start Game
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const input = document.getElementById('name-input') as HTMLInputElement;
            const submitBtn = document.getElementById('name-submit-btn') as HTMLButtonElement;
            
            const submitName = () => {
                let name = input.value.trim();
                if (!name) {
                    name = 'Player';
                }
                // Sanitize name (remove special characters, limit length)
                name = name.substring(0, 20).replace(/[<>]/g, '');
                if (!name) {
                    name = 'Player';
                }
                modal.remove();
                resolve(name);
            };
            
            submitBtn.addEventListener('click', submitName);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    submitName();
                }
            });
            
            // Focus input
            setTimeout(() => input.focus(), 100);
        });
    }
    
    private setupHealthUI(): void {
        // Create hearts container
        const heartsContainer = document.createElement('div');
        heartsContainer.id = 'hearts-container';
        heartsContainer.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            gap: 5px;
            z-index: 100;
        `;
        document.body.appendChild(heartsContainer);
        
        // Create spawn protection indicator
        const protectionIndicator = document.createElement('div');
        protectionIndicator.id = 'protection-indicator';
        protectionIndicator.style.cssText = `
            position: absolute;
            top: 50px;
            right: 10px;
            background: linear-gradient(135deg, rgba(0, 200, 255, 0.9), rgba(0, 150, 255, 0.9));
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            z-index: 100;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            box-shadow: 0 2px 10px rgba(0, 200, 255, 0.4);
            display: flex;
            align-items: center;
            gap: 6px;
            animation: pulse-protection 2s ease-in-out infinite;
        `;
        protectionIndicator.innerHTML = `
            <span style="font-size: 16px;">🛡️</span>
            <span>Protected</span>
        `;
        document.body.appendChild(protectionIndicator);
        
        // Add pulse animation style
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse-protection {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.02); }
            }
        `;
        document.head.appendChild(style);
        
        // Create respawn popup (initially hidden)
        const respawnPopup = document.createElement('div');
        respawnPopup.id = 'respawn-popup';
        respawnPopup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 30px 50px;
            border-radius: 12px;
            text-align: center;
            z-index: 1000;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            border: 2px solid rgba(255, 255, 255, 0.2);
            pointer-events: none;
        `;
        respawnPopup.innerHTML = `
            <h2 style="margin: 0 0 15px 0; font-size: 32px; color: #ff4444;">You Died</h2>
            <p style="margin: 0; font-size: 18px; color: #cccccc;">Click anywhere to respawn</p>
        `;
        document.body.appendChild(respawnPopup);
        
        // Update hearts when health changes
        const healthCallback = (health: number) => {
            // Use requestAnimationFrame to ensure DOM updates happen
            requestAnimationFrame(() => {
                this.updateHeartsUI(health);
            });
            if (health <= 0 && !this.isDead) {
                this.onPlayerDeath();
            }
        };
        this.character.setOnHealthChanged(healthCallback);
        
        // Initial hearts display
        const initialHealth = this.character.getHealth();
        this.updateHeartsUI(initialHealth);
    }
    
    /**
     * Check if player is currently inside the spawn zone
     */
    private isInSpawnZone(position: THREE.Vector3): boolean {
        // Use horizontal distance only (ignore Y axis)
        const horizontalDistance = Math.sqrt(
            Math.pow(position.x - this.SPAWN_ZONE_CENTER.x, 2) +
            Math.pow(position.z - this.SPAWN_ZONE_CENTER.z, 2)
        );
        return horizontalDistance <= this.SPAWN_ZONE_RADIUS;
    }
    
    /**
     * Check if player has spawn protection (in zone and hasn't left yet)
     */
    private hasSpawnProtection(): boolean {
        return !this.hasLeftSpawnZone;
    }
    
    /**
     * Update spawn protection status based on player position
     */
    private updateSpawnProtection(): void {
        if (this.isDead) return;
        
        const playerPosition = this.playerController.getPosition();
        const inZone = this.isInSpawnZone(playerPosition);
        
        // Once player leaves the spawn zone, they lose protection forever (until respawn)
        if (!inZone && !this.hasLeftSpawnZone) {
            this.hasLeftSpawnZone = true;
            this.updateProtectionIndicator();
        }
    }
    
    /**
     * Update the protection indicator UI
     */
    private updateProtectionIndicator(): void {
        const indicator = document.getElementById('protection-indicator');
        if (indicator) {
            if (this.hasSpawnProtection()) {
                indicator.style.display = 'flex';
            } else {
                indicator.style.display = 'none';
            }
        }
    }
    
    /**
     * Create the visual spawn zone indicator in the scene
     */
    private createSpawnZoneVisual(): void {
        this.spawnZoneVisual = new THREE.Group();
        
        // Create a circular ring on the ground
        const ringGeometry = new THREE.RingGeometry(
            this.SPAWN_ZONE_RADIUS - 0.1,
            this.SPAWN_ZONE_RADIUS,
            64
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2; // Lay flat on ground
        ring.position.y = 0.02; // Slightly above ground to prevent z-fighting
        this.spawnZoneVisual.add(ring);
        
        // Create a subtle filled circle for the safe zone area
        const circleGeometry = new THREE.CircleGeometry(this.SPAWN_ZONE_RADIUS, 64);
        const circleMaterial = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        const circle = new THREE.Mesh(circleGeometry, circleMaterial);
        circle.rotation.x = -Math.PI / 2;
        circle.position.y = 0.01;
        this.spawnZoneVisual.add(circle);
        
        // Create vertical cylinder outline (like a force field)
        const cylinderGeometry = new THREE.CylinderGeometry(
            this.SPAWN_ZONE_RADIUS,
            this.SPAWN_ZONE_RADIUS,
            4, // Height
            64,
            1,
            true // Open ended
        );
        const cylinderMaterial = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide
        });
        const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        cylinder.position.y = 2; // Center vertically
        this.spawnZoneVisual.add(cylinder);
        
        this.spawnZoneVisual.position.copy(this.SPAWN_ZONE_CENTER);
        this.scene.add(this.spawnZoneVisual);
    }
    
    private updateHeartsUI(health: number): void {
        const heartsContainer = document.getElementById('hearts-container');
        if (!heartsContainer) {
            // Try to recreate it
            this.setupHealthUI();
            return;
        }
        
        const maxHealth = this.character.getMaxHealth();
        // Ensure health is within valid range
        const clampedHealth = Math.max(0, Math.min(maxHealth, health));
        
        // Clear existing hearts
        heartsContainer.innerHTML = '';
        
        // Create hearts based on current health
        // Use different emojis for filled vs empty, as emojis don't reliably change color with CSS
        for (let i = 0; i < maxHealth; i++) {
            const heart = document.createElement('div');
            const isFilled = i < clampedHealth;
            heart.style.cssText = `
                width: 30px;
                height: 30px;
                font-size: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.2s ease;
            `;
            // Use filled heart emoji for filled, empty heart emoji for empty
            // Or hide empty hearts entirely
            if (isFilled) {
                heart.textContent = '❤️';
                heart.style.opacity = '1';
            } else {
                // Use empty heart emoji or hide it
                heart.textContent = '🤍'; // White heart (empty)
                heart.style.opacity = '0.3'; // Make it very faint
                // Alternative: hide completely
                // heart.style.display = 'none';
            }
            heart.setAttribute('data-heart-index', i.toString());
            heart.setAttribute('data-filled', isFilled.toString());
            heartsContainer.appendChild(heart);
        }
    }

    private showBlockTypeNotification(blockTypeName: string): void {
        // Remove existing notification if any
        const existing = document.getElementById('block-type-notification');
        if (existing) {
            existing.remove();
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.id = 'block-type-notification';
        notification.textContent = `Block Type: ${blockTypeName}`;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.75);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 150;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            white-space: nowrap;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(notification);

        // Fade in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
        });

        // Remove after 2 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2000);
    }
    
    private onPlayerDeath(): void {
        this.isDead = true;
        
        // Exit pointer lock so player can click to respawn
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        
        // Show respawn popup
        const respawnPopup = document.getElementById('respawn-popup');
        if (respawnPopup) {
            respawnPopup.style.display = 'block';
        }
        
        // Hide local player character mesh
        const characterMesh = this.character.getMesh();
        characterMesh.visible = false;
        
        // Disable player controls
        // The player controller will still work but we can add visual feedback
    }
    
    private respawn(): void {
        this.isDead = false;
        
        // Hide respawn popup
        const respawnPopup = document.getElementById('respawn-popup');
        if (respawnPopup) {
            respawnPopup.style.display = 'none';
        }
        
        // Show local player character mesh again
        const characterMesh = this.character.getMesh();
        characterMesh.visible = true;
        
        // Reset health to max
        const maxHealth = this.character.getMaxHealth();
        // Reset health - this will trigger the health callback which updates the UI
        this.character.setHealth(maxHealth);
        
        // Ensure hearts container is visible
        const heartsContainer = document.getElementById('hearts-container');
        if (heartsContainer) {
            heartsContainer.style.display = 'flex';
        }
        
        // Explicitly update hearts UI to ensure it's restored
        this.updateHeartsUI(maxHealth);
        
        // Reset player position to spawn (0, 1.6, 0) - Y is eye height
        this.playerController.setPosition(0, 1.6, 0);
        
        // Reset spawn protection - player gets protection again until they leave the zone
        this.hasLeftSpawnZone = false;
        this.updateProtectionIndicator();
        
        // Notify server that player has respawned
        this.networkManager.sendPlayerRespawned();
    }

    private setupEventListeners(): void {
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Left-click shooting or respawn if dead
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                if (this.isDead) {
                    // If player is dead, respawn on click
                    this.respawn();
                } else {
                    // Otherwise, shoot
                    this.shoot();
                }
            } else if (e.button === 2) { // Right mouse button
                if (!this.isDead) {
                    // Place block on right-click
                    this.placeBlock();
                }
            }
        });

        // Prevent context menu on right-click
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Handle key presses for block breaking and block type selection
        document.addEventListener('keydown', (e) => {
            if (this.isDead) {
                return;
            }
            
            if (e.code === 'KeyB') {
                // Break block with 'B' key
                this.breakBlock();
            } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
                // Select stone block
                this.blockManager.setBlockType('stone');
                this.showBlockTypeNotification('Stone');
            } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
                // Select dirt block
                this.blockManager.setBlockType('dirt');
                this.showBlockTypeNotification('Dirt');
            } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
                // Select grass block
                this.blockManager.setBlockType('grass');
                this.showBlockTypeNotification('Grass');
            } else if (e.code === 'Digit4' || e.code === 'Numpad4') {
                // Select wood block
                this.blockManager.setBlockType('wood');
                this.showBlockTypeNotification('Wood');
            } else if (e.code === 'Digit5' || e.code === 'Numpad5') {
                // Select sand block
                this.blockManager.setBlockType('sand');
                this.showBlockTypeNotification('Sand');
            }
        });
    }
    
    private shoot(): void {
        // Can't shoot if dead
        if (this.isDead) {
            return;
        }
        
        const now = performance.now();
        if (now - this.lastShotTime < this.shotCooldown) {
            return; // Cooldown not expired
        }
        this.lastShotTime = now;
        
        // Get bullet spawn node from character
        const spawnNode = this.character.getBulletSpawnNode();
        if (!spawnNode) {
            return;
        }
        
        // Get camera forward direction (where player is looking)
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        direction.normalize();
        
        // Get local player ID for bullet ownership
        const localPlayerId = this.networkManager.getPlayerId();
        
        // Create bullet at spawn node position, shooting in camera direction
        const bullet = new Bullet(this.scene, spawnNode.position, direction, localPlayerId);
        this.bullets.push(bullet);
        
        // Send bullet to server so other players can see it
        this.networkManager.sendBulletShot(spawnNode.position, direction);
    }

    private placeBlock(): void {
        if (this.isDead) {
            return;
        }

        // Use the currently selected block type
        const blockData = this.blockManager.placeBlockAtPreview();
        if (blockData) {
            // Send block placement to server
            this.networkManager.sendBlockPlaced(blockData);
        }
    }

    private breakBlock(): void {
        if (this.isDead) {
            return;
        }

        // Use targeted block instead of preview (preview shows where to place, not what to break)
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const blockData = this.blockManager.removeBlockAtTarget(this.raycaster, 10);
        if (blockData) {
            // Send block removal to server
            this.networkManager.sendBlockRemoved(blockData);
        }
    }

    private onWindowResize(): void {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    private gameLoop(currentTime: number): void {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Update game systems
        this.update(deltaTime);

        // Render
        this.render();

        // Continue loop
        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
    }

    private update(deltaTime: number): void {
        // Don't update player controller if dead
        if (!this.isDead) {
            // Update player controller (handles movement and camera)
            this.playerController.update(deltaTime);
            
            // Update spawn protection status
            this.updateSpawnProtection();
        }

        // Update character based on camera mode (only if not dead)
        if (!this.isDead) {
            const playerPosition = this.playerController.getPosition();
            const rotationY = this.playerController.getRotationY();
            const isThirdPerson = this.playerController.isThirdPersonMode();
            this.character.setCameraMode(isThirdPerson, playerPosition, rotationY);
            
            // Update character position (only matters in third-person)
            this.character.updatePosition(playerPosition, rotationY);

            // Send local player update to server
            this.networkManager.sendPlayerUpdate(playerPosition, rotationY);
        }

        // Update remote players
        this.updateRemotePlayers(deltaTime);

        // Update connection status UI (check every 500ms)
        const now = performance.now();
        if (now - this.lastStatusUpdate > this.statusUpdateInterval) {
            this.updateConnectionStatus();
            this.lastStatusUpdate = now;
        }

        // Get server-synchronized game time
        const serverGameTime = this.networkManager.getServerGameTime();

        // Get current player position for scene updates
        const currentPlayerPosition = this.isDead ? new THREE.Vector3(0, 1.6, 0) : this.playerController.getPosition();

        // Update scene manager with server time (falls back to local time if server time unavailable)
        this.sceneManager.update(deltaTime, currentPlayerPosition, serverGameTime);
        
        // Update bullets
        this.updateBullets(deltaTime);

        // Update block preview
        if (!this.isDead) {
            this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
            this.blockManager.updatePreview(this.raycaster, this.camera, 10);
        }
    }
    
    private updateBullets(deltaTime: number): void {
        // Get all trees for collision detection
        const trees = this.sceneManager.getTrees();
        // Get all blocks for collision detection
        const blocks = this.blockManager.getAllBlockMeshes();
        const localPlayerId = this.networkManager.getPlayerId();
        
        // Update all bullets and check collisions
        this.bullets = this.bullets.filter(bullet => {
            const isAlive = bullet.update(deltaTime, trees, blocks);
            if (!isAlive) {
                bullet.dispose();
                return false;
            }
            
            // Check collision with local player (if bullet wasn't shot by local player)
            if (bullet.getShooterId() !== localPlayerId) {
                if (this.checkBulletCharacterCollision(bullet, this.character.getMesh())) {
                    // Check if player has spawn protection
                    if (!this.hasSpawnProtection()) {
                        // Remote bullet hit local player - apply damage immediately for responsiveness
                        this.character.takeDamage(1);
                        // Also notify server (server will broadcast damage for synchronization)
                        if (localPlayerId) {
                            this.networkManager.sendPlayerDamaged(localPlayerId, 1);
                        }
                    }
                    // Bullet is destroyed even if player is protected
                    bullet.dispose();
                    return false;
                }
            }
            
            // Check collision with remote players (only if we shot the bullet)
            if (bullet.getShooterId() === localPlayerId) {
                for (const [id, remotePlayer] of this.remotePlayers.entries()) {
                    if (this.checkBulletCharacterCollision(bullet, remotePlayer.getCharacter().getMesh())) {
                        // Local bullet hit remote player - notify server (server will broadcast damage)
                        this.networkManager.sendPlayerDamaged(id, 1);
                        bullet.dispose();
                        return false;
                    }
                }
                
                // Check collision with monster (only if we shot the bullet)
                const monsterMesh = this.sceneManager.getMonsterMesh();
                if (monsterMesh && this.checkBulletMonsterCollision(bullet, monsterMesh)) {
                    // Local bullet hit monster - notify server (server will handle damage and death)
                    this.networkManager.sendMonsterDamaged(1);
                    bullet.dispose();
                    return false;
                }
                
                // Check collision with night monsters (only if we shot the bullet)
                for (const [monsterId, nightMonster] of this.nightMonsters.entries()) {
                    if (nightMonster.getIsAlive()) {
                        const nightMonsterMesh = nightMonster.getMesh();
                        if (this.checkBulletMonsterCollision(bullet, nightMonsterMesh)) {
                            // Local bullet hit night monster - notify server
                            this.networkManager.sendNightMonsterDamaged(monsterId, 1);
                            bullet.dispose();
                            return false;
                        }
                    }
                }
            }
            
            return true;
        });
    }
    
    /**
     * Check if a bullet collides with any part of a character mesh using raycasting
     */
    private checkBulletCharacterCollision(bullet: Bullet, characterMesh: THREE.Group): boolean {
        const bulletPos = bullet.getPosition();
        const bulletPrevPos = bullet.getPreviousPosition();
        
        // Create raycaster from previous position to current position
        const direction = bulletPos.clone().sub(bulletPrevPos).normalize();
        const distance = bulletPrevPos.distanceTo(bulletPos);
        
        // If bullet hasn't moved, skip collision check
        if (distance < 0.001) {
            return false;
        }
        
        const raycaster = new THREE.Raycaster();
        raycaster.set(bulletPrevPos, direction);
        
        // Check intersection with all meshes in the character model
        const meshesToCheck: THREE.Mesh[] = [];
        characterMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshesToCheck.push(child);
            }
        });
        
        // Check each mesh for intersection
        // Use recursive traversal to check all meshes including nested ones (like gun parts)
        for (const mesh of meshesToCheck) {
            const intersects = raycaster.intersectObject(mesh, true); // true = recursive, check children too
            if (intersects.length > 0) {
                const intersection = intersects[0];
                // Check if intersection is within the bullet's movement distance
                if (intersection.distance <= distance + 0.1) { // Small buffer for bullet radius
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if a bullet collides with the monster mesh using raycasting
     */
    private checkBulletMonsterCollision(bullet: Bullet, monsterMesh: THREE.Group): boolean {
        const bulletPos = bullet.getPosition();
        const bulletPrevPos = bullet.getPreviousPosition();
        
        // Create raycaster from previous position to current position
        const direction = bulletPos.clone().sub(bulletPrevPos).normalize();
        const distance = bulletPrevPos.distanceTo(bulletPos);
        
        // If bullet hasn't moved, skip collision check
        if (distance < 0.001) {
            return false;
        }
        
        const raycaster = new THREE.Raycaster();
        raycaster.set(bulletPrevPos, direction);
        
        // Check intersection with all meshes in the monster model
        const meshesToCheck: THREE.Mesh[] = [];
        monsterMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshesToCheck.push(child);
            }
        });
        
        // Check each mesh for intersection
        for (const mesh of meshesToCheck) {
            const intersects = raycaster.intersectObject(mesh, true); // true = recursive, check children too
            if (intersects.length > 0) {
                const intersection = intersects[0];
                // Check if intersection is within the bullet's movement distance
                if (intersection.distance <= distance + 0.1) { // Small buffer for bullet radius
                    return true;
                }
            }
        }
        
        return false;
    }

    private updateConnectionStatus(): void {
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        if (!statusDot || !statusText) return;

        const status = this.networkManager.getConnectionStatus();
        
        switch (status) {
            case ConnectionStatus.CONNECTED:
                statusDot.style.backgroundColor = '#00ff00'; // Green
                statusText.textContent = 'Connected';
                break;
            case ConnectionStatus.CONNECTING:
                statusDot.style.backgroundColor = '#ffff00'; // Yellow
                statusText.textContent = 'Connecting...';
                break;
            case ConnectionStatus.RECONNECTING:
                statusDot.style.backgroundColor = '#ffff00'; // Yellow
                statusText.textContent = 'Reconnecting...';
                break;
            case ConnectionStatus.DISCONNECTED:
            default:
                statusDot.style.backgroundColor = '#ff0000'; // Red
                statusText.textContent = 'Disconnected';
                break;
        }
    }

    private updateRemotePlayers(deltaTime: number): void {
        const remotePlayerData = this.networkManager.getRemotePlayers();
        const localPlayerId = this.networkManager.getPlayerId();

        // Get all remote player IDs
        const remotePlayerIds = new Set<string>();
        remotePlayerData.forEach((_data, id) => {
            if (id !== localPlayerId) {
                remotePlayerIds.add(id);
            }
        });

        // Remove players that are no longer connected or are dead
        for (const [id, remotePlayer] of this.remotePlayers.entries()) {
            if (!remotePlayerIds.has(id) || remotePlayer.isDead()) {
                remotePlayer.dispose();
                this.remotePlayers.delete(id);
            }
        }

        // Update existing remote players or create new ones
        remotePlayerData.forEach((data, id) => {
            if (id === localPlayerId) {
                return; // Skip local player
            }

            let remotePlayer = this.remotePlayers.get(id);
            if (!remotePlayer) {
                // Create new remote player
                remotePlayer = new RemotePlayer(id, this.scene, data);
                this.remotePlayers.set(id, remotePlayer);
            } else {
                // Update existing remote player
                remotePlayer.update(data);
            }

            // Update interpolation
            remotePlayer.updateInterpolation(deltaTime);
        });
    }

    private render(): void {
        // Get trees and blocks for line of sight checking
        const trees = this.sceneManager.getTrees();
        const blocks = this.blockManager.getAllBlockMeshes();
        
        // Update health bar positions for all remote players
        for (const remotePlayer of this.remotePlayers.values()) {
            remotePlayer.updateHealthBarPosition(this.camera, this.renderer, trees, blocks);
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    public dispose(): void {
        cancelAnimationFrame(this.animationId);
        this.character.dispose();
        
        // Dispose all bullets
        this.bullets.forEach(bullet => bullet.dispose());
        this.bullets = [];
        
        // Dispose all remote players
        this.remotePlayers.forEach(player => player.dispose());
        this.remotePlayers.clear();
        
        // Dispose block manager
        this.blockManager.dispose();
        
        // Dispose spawn zone visual
        if (this.spawnZoneVisual) {
            this.scene.remove(this.spawnZoneVisual);
            this.spawnZoneVisual = null;
        }
        
        // Disconnect from server
        this.networkManager.disconnect();
        
        // Dispose leaderboard
        this.leaderboard.dispose();
        
        // Dispose update notifier
        this.updateNotifier.dispose();
        
        this.sceneManager.dispose();
        this.renderer.dispose();
    }
}

