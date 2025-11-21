import * as THREE from 'three';
import { PlayerController } from './PlayerController';
import { SceneManager } from './SceneManager';
import { Character } from './Character';
import { Player2Character } from './Player2Character';

export class Game {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private playerController: PlayerController;
    private sceneManager: SceneManager;
    private character: Character;
    private player2Character: Player2Character;
    private animationId: number = 0;
    private lastTime: number = 0;

    constructor() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        // Removed fog - it was making everything blue

        // Create camera
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.set(0, 1.6, 0); // Eye height
        // Make sure camera looks slightly down to see the ground
        this.camera.rotation.x = -0.1;
        // Set camera to only see layer 0 (character will be on layer 1 in first-person to hide it but allow shadows)
        this.camera.layers.set(0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows for realistic look
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.shadowMap.needsUpdate = true;

        // Create managers
        this.playerController = new PlayerController(this.camera, this.renderer.domElement);
        this.sceneManager = new SceneManager(this.scene);
        this.character = new Character(this.camera, this.scene);
        // Create Player 2 character (red torso) - positioned slightly away from player 1
        this.player2Character = new Player2Character(this.scene);
        this.player2Character.updatePosition(new THREE.Vector3(5, 0, 5), 0);
    }

    public init(): void {
        // Append canvas to container
        const container = document.getElementById('canvas-container');
        if (container) {
            container.appendChild(this.renderer.domElement);
        }

        // Setup scene
        this.sceneManager.setup();

        // Setup event listeners
        this.setupEventListeners();

        // Start game loop
        this.gameLoop(0);
    }

    private setupEventListeners(): void {
        window.addEventListener('resize', () => this.onWindowResize());
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

        // Update Player 2 character (for now, just keep it at a fixed position)
        // TODO: This will be updated with multiplayer position data
        const player2Position = new THREE.Vector3(5, 0, 5);
        this.player2Character.updatePosition(player2Position, 0);

        // Update scene manager
        this.sceneManager.update(deltaTime, playerPosition);

        // Update monster with player position
        this.sceneManager.updateMonster(deltaTime, playerPosition);
    }

    private render(): void {
        this.renderer.render(this.scene, this.camera);
    }

    public dispose(): void {
        cancelAnimationFrame(this.animationId);
        this.character.dispose();
        this.player2Character.dispose();
        this.sceneManager.dispose();
        this.renderer.dispose();
    }
}

