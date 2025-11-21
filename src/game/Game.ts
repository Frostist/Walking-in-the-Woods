import * as THREE from 'three';
import { PlayerController } from './PlayerController';
import { SceneManager } from './SceneManager';
import { Character } from './Character';
import { NetworkManager, ConnectionStatus } from './NetworkManager';
import { RemotePlayer } from './RemotePlayer';
import { Bullet } from './Bullet';

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
    private animationId: number = 0;
    private lastTime: number = 0;
    private lastStatusUpdate: number = 0;
    private statusUpdateInterval: number = 500; // Update status every 500ms
    private lastShotTime: number = 0;
    private shotCooldown: number = 100; // Milliseconds between shots

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
        
        // Initialize network manager - use environment variable or default to localhost
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
        this.networkManager = new NetworkManager(serverUrl);
    }

    public async init(): Promise<void> {
        // Append canvas to container
        const container = document.getElementById('canvas-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        }

        // Setup scene
        this.sceneManager.setup();

        // Load gun for local character
        await this.character.loadGun();

        // Connect to multiplayer server
        this.networkManager.connect();

        // Setup callback to generate trees when received from server
        this.networkManager.onTreesReceived((trees) => {
            console.log(`Generating ${trees.length} trees from server data`);
            this.sceneManager.generateTreesFromServerData(trees);
        });

        // Setup callback to generate grass when received from server
        this.networkManager.onGrassReceived((grass) => {
            console.log(`Generating ${grass.length} grass patches from server data`);
            this.sceneManager.generateGrassFromServerData(grass);
        });

        // Setup event listeners
        this.setupEventListeners();

        // Initialize connection status UI
        this.updateConnectionStatus();

        // Start game loop
        this.gameLoop(0);
    }

    private setupEventListeners(): void {
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Left-click shooting
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                this.shoot();
            }
        });
    }
    
    private shoot(): void {
        const now = performance.now();
        if (now - this.lastShotTime < this.shotCooldown) {
            return; // Cooldown not expired
        }
        this.lastShotTime = now;
        
        // Get bullet spawn node from character
        const spawnNode = this.character.getBulletSpawnNode();
        if (!spawnNode) {
            console.warn('Bullet spawn node not found');
            return;
        }
        
        // Get camera forward direction (where player is looking)
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        direction.normalize();
        
        // Create bullet at spawn node position, shooting in camera direction
        const bullet = new Bullet(this.scene, spawnNode.position, direction);
        this.bullets.push(bullet);
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
        // Update player controller (handles movement and camera)
        this.playerController.update(deltaTime);

        // Update character based on camera mode
        const playerPosition = this.playerController.getPosition();
        const rotationY = this.playerController.getRotationY();
        const isThirdPerson = this.playerController.isThirdPersonMode();
        this.character.setCameraMode(isThirdPerson, playerPosition, rotationY);
        
        // Update character position (only matters in third-person)
        this.character.updatePosition(playerPosition, rotationY);

        // Send local player update to server
        this.networkManager.sendPlayerUpdate(playerPosition, rotationY);

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

        // Update scene manager with server time (falls back to local time if server time unavailable)
        this.sceneManager.update(deltaTime, playerPosition, serverGameTime);

        // Update monster with player position
        this.sceneManager.updateMonster(deltaTime, playerPosition);
        
        // Update bullets
        this.updateBullets(deltaTime);
    }
    
    private updateBullets(deltaTime: number): void {
        // Get all trees for collision detection
        const trees = this.sceneManager.getTrees();
        
        // Update all bullets and remove dead ones
        this.bullets = this.bullets.filter(bullet => {
            const isAlive = bullet.update(deltaTime, trees);
            if (!isAlive) {
                bullet.dispose();
            }
            return isAlive;
        });
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

        // Remove players that are no longer connected
        for (const [id, remotePlayer] of this.remotePlayers.entries()) {
            if (!remotePlayerIds.has(id)) {
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
        
        // Disconnect from server
        this.networkManager.disconnect();
        
        this.sceneManager.dispose();
        this.renderer.dispose();
    }
}

