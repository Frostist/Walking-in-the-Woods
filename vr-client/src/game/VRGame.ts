import * as THREE from 'three';
import { VRPlayerController } from './VRPlayerController';
import { VRControllerManager } from './VRControllerManager';
import { SceneManager } from './SceneManager';
import { Character } from './Character';
import { NetworkManager, ConnectionStatus } from './NetworkManager';
import { RemotePlayer } from './RemotePlayer';
import { Bullet } from './Bullet';
import { BlockManager } from './BlockManager';
import { Leaderboard } from './Leaderboard';
import { UpdateNotifier } from './UpdateNotifier';
import { NightMonster } from './NightMonster';

export class VRGame {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private playerController: VRPlayerController;
    private controllerManager: VRControllerManager;
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
    private lastTime: number = 0;
    private lastStatusUpdate: number = 0;
    private statusUpdateInterval: number = 500;
    private lastShotTime: number = 0;
    private shotCooldown: number = 100;
    private isDead: boolean = false;
    
    // VR specific
    private xrSession: XRSession | null = null;
    private referenceSpace: XRReferenceSpace | null = null;
    private isInVR: boolean = false;
    
    // Safe spawn zone properties
    private readonly SPAWN_ZONE_CENTER = new THREE.Vector3(0, 0, 0);
    private readonly SPAWN_ZONE_RADIUS = 8;
    private hasLeftSpawnZone: boolean = false;
    private spawnZoneVisual: THREE.Group | null = null;
    
    // Controller button states (to detect button presses)
    private lastRightTrigger: boolean = false;
    private lastRightGrip: boolean = false;
    private lastLeftGrip: boolean = false;
    private lastRightButtonB: boolean = false;
    private currentBlockTypeIndex: number = 0;
    private blockTypes: string[] = ['stone', 'dirt', 'grass', 'wood', 'sand'];

    constructor() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);

        // Create camera (will be managed by WebXR)
        const aspect = window.innerWidth / window.innerHeight;
        const fov = 75;
        this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
        this.camera.position.set(0, 1.6, 0);
        this.camera.layers.set(0);

        // Create renderer with WebXR support
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;
        
        // Enable WebXR
        this.renderer.xr.enabled = true;

        // Create VR controller manager
        this.controllerManager = new VRControllerManager(this.scene);
        
        // Create VR player controller
        this.playerController = new VRPlayerController(this.controllerManager);
        
        // Create managers
        this.sceneManager = new SceneManager(this.scene);
        this.character = new Character(this.camera, this.scene);
        this.blockManager = new BlockManager(this.scene);
        this.raycaster = new THREE.Raycaster();
        
        // Connect block manager to player controller
        this.playerController.setBlockManager(this.blockManager);
        
        // Initialize network manager
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
        
        // Check if player ID is already in cookies
        const storedPlayerId = this.getPlayerIdFromCookie();
        if (storedPlayerId) {
            this.networkManager.setStoredPlayerId(storedPlayerId);
        }
        
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
        
        // Setup callbacks (same as desktop version)
        this.setupNetworkCallbacks();
        
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

        // Setup WebXR button
        this.setupVRButton();
        
        // Start game loop (non-VR mode initially)
        this.gameLoop(0);
    }
    
    private setupVRButton(): void {
        const button = document.getElementById('enter-vr-button');
        if (button) {
            button.addEventListener('click', () => {
                this.enterVR();
            });
            
            // Check if WebXR is available
            if (navigator.xr) {
                navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
                    if (supported) {
                        button.classList.add('visible');
                    }
                });
            }
        }
    }
    
    private async enterVR(): Promise<void> {
        if (!navigator.xr) {
            alert('WebXR not supported in this browser');
            return;
        }

        try {
            // Request immersive VR session
            this.xrSession = await navigator.xr!.requestSession('immersive-vr', {
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['bounded-floor', 'hand-tracking']
            });
            
            // Set up controller manager with session
            this.controllerManager.setSession(this.xrSession);
            
            // Get reference space
            this.referenceSpace = await this.xrSession.requestReferenceSpace('local-floor');
            this.playerController.setReferenceSpace(this.referenceSpace);
            
            // Set up renderer for VR
            this.renderer.xr.setSession(this.xrSession);
            this.isInVR = true;
            
            // Hide VR button
            const button = document.getElementById('enter-vr-button');
            if (button) {
                button.style.display = 'none';
            }
            
            // Enable controls
            this.playerController.enableControls();
            
            // Handle session end
            this.xrSession.addEventListener('end', () => {
                this.exitVR();
            });
            
        } catch (error) {
            console.error('Failed to enter VR:', error);
            alert('Failed to enter VR: ' + error);
        }
    }
    
    private exitVR(): void {
        this.isInVR = false;
        this.xrSession = null;
        this.referenceSpace = null;
        
        // Show VR button again
        const button = document.getElementById('enter-vr-button');
        if (button) {
            button.style.display = 'block';
        }
        
        // Disable controls temporarily
        this.playerController.disableControls();
    }
    
    private setupNetworkCallbacks(): void {
        // Setup callback to save player ID when received
        this.networkManager.setOnPlayerIdReceived((playerId) => {
            this.savePlayerIdToCookie(playerId);
        });

        // Setup callback to save registered player name
        this.networkManager.setOnPlayerNameConfirmed((playerName) => {
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
                if (!this.hasSpawnProtection()) {
                    this.character.takeDamage(damage);
                }
            } else {
                const remotePlayer = this.remotePlayers.get(playerId);
                if (remotePlayer) {
                    remotePlayer.takeDamage(damage);
                }
            }
        });

        // Setup callback for monster updates
        this.networkManager.onMonsterUpdate((position, rotationY, health, maxHealth) => {
            this.sceneManager.updateMonsterFromServer(position, rotationY, health, maxHealth);
        });

        this.networkManager.onMonsterDied(() => {
            this.sceneManager.handleMonsterDeath();
        });

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
                    setTimeout(() => {
                        nightMonster.dispose();
                        this.nightMonsters.delete(monsterId);
                    }, 600);
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
            this.blockManager.addBlockFromNetwork(blockData);
        });

        // Setup callback for block removal from other players
        this.networkManager.onBlockRemoved((blockData) => {
            this.blockManager.removeBlockFromNetwork(blockData);
        });
    }
    
    private setupEventListeners(): void {
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    private handleVRInput(): void {
        if (this.isDead || !this.isInVR) return;
        
        const rightState = this.controllerManager.getRightControllerState();
        const leftState = this.controllerManager.getLeftControllerState();
        
        // Shooting with right trigger
        if (rightState.trigger && !this.lastRightTrigger) {
            this.shoot();
        }
        this.lastRightTrigger = rightState.trigger;
        
        // Place block with right grip
        if (rightState.grip && !this.lastRightGrip) {
            this.placeBlock();
        }
        this.lastRightGrip = rightState.grip;
        
        // Remove block with left grip
        if (leftState.grip && !this.lastLeftGrip) {
            this.breakBlock();
        }
        this.lastLeftGrip = leftState.grip;
        
        // Cycle block type with B button
        if (rightState.buttonB && !this.lastRightButtonB) {
            this.currentBlockTypeIndex = (this.currentBlockTypeIndex + 1) % this.blockTypes.length;
            this.blockManager.setBlockType(this.blockTypes[this.currentBlockTypeIndex]);
            this.showBlockTypeNotification(this.blockTypes[this.currentBlockTypeIndex]);
        }
        this.lastRightButtonB = rightState.buttonB;
    }
    
    private shoot(): void {
        if (this.isDead) return;
        
        const now = performance.now();
        if (now - this.lastShotTime < this.shotCooldown) return;
        this.lastShotTime = now;
        
        // Get bullet spawn from right controller
        const rightController = this.controllerManager.getRightController();
        if (!rightController) return;
        
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(rightController.quaternion);
        direction.normalize();
        
        const position = rightController.position.clone();
        position.add(direction.clone().multiplyScalar(0.2)); // Offset slightly forward
        
        const localPlayerId = this.networkManager.getPlayerId();
        const bullet = new Bullet(this.scene, position, direction, localPlayerId);
        this.bullets.push(bullet);
        
        this.networkManager.sendBulletShot(position, direction);
    }

    private placeBlock(): void {
        if (this.isDead) return;
        
        // Use right controller ray for block placement
        const rightRay = this.controllerManager.getRightRay();
        this.blockManager.updatePreview(rightRay, this.camera, 10);
        const blockData = this.blockManager.placeBlockAtPreview();
        if (blockData) {
            this.networkManager.sendBlockPlaced(blockData);
        }
    }

    private breakBlock(): void {
        if (this.isDead) return;
        
        // Use left controller ray for block breaking
        const leftRay = this.controllerManager.getLeftRay();
        const blockData = this.blockManager.removeBlockAtTarget(leftRay, 10);
        if (blockData) {
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

        // Render (WebXR handles VR rendering automatically)
        if (!this.isInVR) {
            this.render();
        }

        // Continue loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    // VR rendering loop (called by WebXR)
    public onXRFrame(time: number, frame: XRFrame): void {
        if (!this.referenceSpace || !this.xrSession) return;
        
        // Update controllers
        this.controllerManager.update(frame, this.referenceSpace);
        
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        // Update game systems
        this.update(deltaTime, frame);
        
        // Handle VR input
        this.handleVRInput();
        
        // Update block preview with right controller
        if (!this.isDead) {
            const rightRay = this.controllerManager.getRightRay();
            this.blockManager.updatePreview(rightRay, this.camera, 10);
        }
    }

    private update(deltaTime: number, xrFrame?: XRFrame): void {
        if (!this.isDead) {
            // Update player controller (pass XR frame for VR position tracking)
            this.playerController.update(deltaTime, xrFrame);
            this.updateSpawnProtection();
        }

        if (!this.isDead) {
            const playerPosition = this.playerController.getPosition();
            const rotationY = this.playerController.getRotationY();
            this.character.setCameraMode(false, playerPosition, rotationY); // Always first-person in VR
            this.character.updatePosition(playerPosition, rotationY);
            this.networkManager.sendPlayerUpdate(playerPosition, rotationY);
        }

        this.updateRemotePlayers(deltaTime);

        const now = performance.now();
        if (now - this.lastStatusUpdate > this.statusUpdateInterval) {
            this.updateConnectionStatus();
            this.lastStatusUpdate = now;
        }

        const serverGameTime = this.networkManager.getServerGameTime();
        const currentPlayerPosition = this.isDead ? new THREE.Vector3(0, 1.6, 0) : this.playerController.getPosition();
        this.sceneManager.update(deltaTime, currentPlayerPosition, serverGameTime);
        
        this.updateBullets(deltaTime);
    }
    
    private updateBullets(deltaTime: number): void {
        const trees = this.sceneManager.getTrees();
        const blocks = this.blockManager.getAllBlockMeshes();
        const localPlayerId = this.networkManager.getPlayerId();
        
        this.bullets = this.bullets.filter(bullet => {
            const isAlive = bullet.update(deltaTime, trees, blocks);
            if (!isAlive) {
                bullet.dispose();
                return false;
            }
            
            if (bullet.getShooterId() !== localPlayerId) {
                if (this.checkBulletCharacterCollision(bullet, this.character.getMesh())) {
                    if (!this.hasSpawnProtection()) {
                        this.character.takeDamage(1);
                        if (localPlayerId) {
                            this.networkManager.sendPlayerDamaged(localPlayerId, 1);
                        }
                    }
                    bullet.dispose();
                    return false;
                }
            }
            
            if (bullet.getShooterId() === localPlayerId) {
                for (const [id, remotePlayer] of this.remotePlayers.entries()) {
                    if (this.checkBulletCharacterCollision(bullet, remotePlayer.getCharacter().getMesh())) {
                        this.networkManager.sendPlayerDamaged(id, 1);
                        bullet.dispose();
                        return false;
                    }
                }
                
                const monsterMesh = this.sceneManager.getMonsterMesh();
                if (monsterMesh && this.checkBulletMonsterCollision(bullet, monsterMesh)) {
                    this.networkManager.sendMonsterDamaged(1);
                    bullet.dispose();
                    return false;
                }
                
                for (const [monsterId, nightMonster] of this.nightMonsters.entries()) {
                    if (nightMonster.getIsAlive()) {
                        const nightMonsterMesh = nightMonster.getMesh();
                        if (this.checkBulletMonsterCollision(bullet, nightMonsterMesh)) {
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
    
    private checkBulletCharacterCollision(bullet: Bullet, characterMesh: THREE.Group): boolean {
        const bulletPos = bullet.getPosition();
        const bulletPrevPos = bullet.getPreviousPosition();
        const direction = bulletPos.clone().sub(bulletPrevPos).normalize();
        const distance = bulletPrevPos.distanceTo(bulletPos);
        
        if (distance < 0.001) return false;
        
        const raycaster = new THREE.Raycaster();
        raycaster.set(bulletPrevPos, direction);
        
        const meshesToCheck: THREE.Mesh[] = [];
        characterMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshesToCheck.push(child);
            }
        });
        
        for (const mesh of meshesToCheck) {
            const intersects = raycaster.intersectObject(mesh, true);
            if (intersects.length > 0) {
                const intersection = intersects[0];
                if (intersection.distance <= distance + 0.1) {
                    return true;
                }
            }
        }
        
        return false;
    }

    private checkBulletMonsterCollision(bullet: Bullet, monsterMesh: THREE.Group): boolean {
        const bulletPos = bullet.getPosition();
        const bulletPrevPos = bullet.getPreviousPosition();
        const direction = bulletPos.clone().sub(bulletPrevPos).normalize();
        const distance = bulletPrevPos.distanceTo(bulletPos);
        
        if (distance < 0.001) return false;
        
        const raycaster = new THREE.Raycaster();
        raycaster.set(bulletPrevPos, direction);
        
        const meshesToCheck: THREE.Mesh[] = [];
        monsterMesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                meshesToCheck.push(child);
            }
        });
        
        for (const mesh of meshesToCheck) {
            const intersects = raycaster.intersectObject(mesh, true);
            if (intersects.length > 0) {
                const intersection = intersects[0];
                if (intersection.distance <= distance + 0.1) {
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
                statusDot.style.backgroundColor = '#00ff00';
                statusText.textContent = 'Connected';
                break;
            case ConnectionStatus.CONNECTING:
                statusDot.style.backgroundColor = '#ffff00';
                statusText.textContent = 'Connecting...';
                break;
            case ConnectionStatus.RECONNECTING:
                statusDot.style.backgroundColor = '#ffff00';
                statusText.textContent = 'Reconnecting...';
                break;
            case ConnectionStatus.DISCONNECTED:
            default:
                statusDot.style.backgroundColor = '#ff0000';
                statusText.textContent = 'Disconnected';
                break;
        }
    }

    private updateRemotePlayers(deltaTime: number): void {
        const remotePlayerData = this.networkManager.getRemotePlayers();
        const localPlayerId = this.networkManager.getPlayerId();

        const remotePlayerIds = new Set<string>();
        remotePlayerData.forEach((_data, id) => {
            if (id !== localPlayerId) {
                remotePlayerIds.add(id);
            }
        });

        for (const [id, remotePlayer] of this.remotePlayers.entries()) {
            if (!remotePlayerIds.has(id) || remotePlayer.isDead()) {
                remotePlayer.dispose();
                this.remotePlayers.delete(id);
            }
        }

        remotePlayerData.forEach((data, id) => {
            if (id === localPlayerId) return;

            let remotePlayer = this.remotePlayers.get(id);
            if (!remotePlayer) {
                remotePlayer = new RemotePlayer(id, this.scene, data);
                this.remotePlayers.set(id, remotePlayer);
            } else {
                remotePlayer.update(data);
            }

            remotePlayer.updateInterpolation(deltaTime);
        });
    }

    private render(): void {
        const trees = this.sceneManager.getTrees();
        const blocks = this.blockManager.getAllBlockMeshes();
        
        for (const remotePlayer of this.remotePlayers.values()) {
            remotePlayer.updateHealthBarPosition(this.camera, this.renderer, trees, blocks);
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    // Copy all the UI helper methods from Game.ts
    private showLoadingScreen(): void {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }
    }
    
    private updateLoadingProgress(percentage: number, status: string): void {
        const loadingBar = document.getElementById('loading-bar');
        const loadingStatusEl = document.getElementById('loading-status');
        const loadingPercentage = document.getElementById('loading-percentage');
        
        if (loadingBar) loadingBar.style.width = `${percentage}%`;
        if (loadingStatusEl) loadingStatusEl.textContent = status;
        if (loadingPercentage) loadingPercentage.textContent = `${Math.round(percentage)}%`;
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
                        "
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
                        "
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
                if (!name) name = 'Player';
                name = name.substring(0, 20).replace(/[<>]/g, '');
                if (!name) name = 'Player';
                modal.remove();
                resolve(name);
            };
            
            submitBtn.addEventListener('click', submitName);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') submitName();
            });
            
            setTimeout(() => input.focus(), 100);
        });
    }
    
    private setupHealthUI(): void {
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
        `;
        protectionIndicator.innerHTML = `
            <span style="font-size: 16px;">🛡️</span>
            <span>Protected</span>
        `;
        document.body.appendChild(protectionIndicator);
        
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
        `;
        respawnPopup.innerHTML = `
            <h2 style="margin: 0 0 15px 0; font-size: 32px; color: #ff4444;">You Died</h2>
            <p style="margin: 0; font-size: 18px; color: #cccccc;">Press A button to respawn</p>
        `;
        document.body.appendChild(respawnPopup);
        
        const healthCallback = (health: number) => {
            requestAnimationFrame(() => {
                this.updateHeartsUI(health);
            });
            if (health <= 0 && !this.isDead) {
                this.onPlayerDeath();
            }
        };
        this.character.setOnHealthChanged(healthCallback);
        
        const initialHealth = this.character.getHealth();
        this.updateHeartsUI(initialHealth);
    }
    
    private isInSpawnZone(position: THREE.Vector3): boolean {
        const horizontalDistance = Math.sqrt(
            Math.pow(position.x - this.SPAWN_ZONE_CENTER.x, 2) +
            Math.pow(position.z - this.SPAWN_ZONE_CENTER.z, 2)
        );
        return horizontalDistance <= this.SPAWN_ZONE_RADIUS;
    }
    
    private hasSpawnProtection(): boolean {
        return !this.hasLeftSpawnZone;
    }
    
    private updateSpawnProtection(): void {
        if (this.isDead) return;
        
        const playerPosition = this.playerController.getPosition();
        const inZone = this.isInSpawnZone(playerPosition);
        
        if (!inZone && !this.hasLeftSpawnZone) {
            this.hasLeftSpawnZone = true;
            this.character.setHealth(this.character.getMaxHealth());
            this.updateProtectionIndicator();
        }
    }
    
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
    
    private createSpawnZoneVisual(): void {
        this.spawnZoneVisual = new THREE.Group();
        
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
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        this.spawnZoneVisual.add(ring);
        
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
        
        this.spawnZoneVisual.position.copy(this.SPAWN_ZONE_CENTER);
        this.scene.add(this.spawnZoneVisual);
    }
    
    private updateHeartsUI(health: number): void {
        const heartsContainer = document.getElementById('hearts-container');
        if (!heartsContainer) {
            this.setupHealthUI();
            return;
        }
        
        const maxHealth = this.character.getMaxHealth();
        const clampedHealth = Math.max(0, Math.min(maxHealth, health));
        
        heartsContainer.innerHTML = '';
        
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
            `;
            if (isFilled) {
                heart.textContent = '❤️';
                heart.style.opacity = '1';
            } else {
                heart.textContent = '🤍';
                heart.style.opacity = '0.3';
            }
            heartsContainer.appendChild(heart);
        }
    }

    private showBlockTypeNotification(blockTypeName: string): void {
        const existing = document.getElementById('block-type-notification');
        if (existing) existing.remove();

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
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.style.opacity = '1';
        });

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
        
        const respawnPopup = document.getElementById('respawn-popup');
        if (respawnPopup) {
            respawnPopup.style.display = 'block';
        }
        
        const characterMesh = this.character.getMesh();
        characterMesh.visible = false;
    }
    
    private respawn(): void {
        this.isDead = false;
        
        const respawnPopup = document.getElementById('respawn-popup');
        if (respawnPopup) {
            respawnPopup.style.display = 'none';
        }
        
        const characterMesh = this.character.getMesh();
        characterMesh.visible = true;
        
        const maxHealth = this.character.getMaxHealth();
        this.character.setHealth(maxHealth);
        
        const heartsContainer = document.getElementById('hearts-container');
        if (heartsContainer) {
            heartsContainer.style.display = 'flex';
        }
        
        this.updateHeartsUI(maxHealth);
        this.playerController.setPosition(0, 1.6, 0);
        this.hasLeftSpawnZone = false;
        this.updateProtectionIndicator();
        this.networkManager.sendPlayerRespawned();
    }

    public dispose(): void {
        if (this.xrSession) {
            this.xrSession.end();
        }
        
        this.character.dispose();
        this.bullets.forEach(bullet => bullet.dispose());
        this.bullets = [];
        this.remotePlayers.forEach(player => player.dispose());
        this.remotePlayers.clear();
        this.blockManager.dispose();
        
        if (this.spawnZoneVisual) {
            this.scene.remove(this.spawnZoneVisual);
            this.spawnZoneVisual = null;
        }
        
        this.networkManager.disconnect();
        this.leaderboard.dispose();
        this.updateNotifier.dispose();
        this.sceneManager.dispose();
        this.renderer.dispose();
        this.controllerManager.dispose();
    }
}

