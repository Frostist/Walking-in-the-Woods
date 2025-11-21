import * as THREE from 'three';
import { Player2Character } from './Player2Character';
import { RemotePlayerData } from './NetworkManager';

export class RemotePlayer {
    private id: string;
    private character: Player2Character;
    private targetPosition: THREE.Vector3;
    private targetRotationY: number;
    private currentPosition: THREE.Vector3;
    private currentRotationY: number;
    private interpolationSpeed: number = 0.2; // How fast to interpolate (0-1)
    private health: number = 5; // 5 hearts
    private maxHealth: number = 5;
    private healthBarElement: HTMLElement | null = null;

    constructor(id: string, scene: THREE.Scene, initialData: RemotePlayerData) {
        this.id = id;
        this.character = new Player2Character(scene);
        this.targetPosition = new THREE.Vector3(initialData.position.x, initialData.position.y, initialData.position.z);
        this.targetRotationY = initialData.rotationY;
        this.currentPosition = this.targetPosition.clone();
        this.currentRotationY = this.targetRotationY;
        
        // Set initial position
        this.character.updatePosition(this.currentPosition, this.currentRotationY);
        
        // Load gun for remote player
        this.character.loadGun().catch(() => {
            // Silently fail - gun loading errors are not critical
        });
        
        // Create health bar element
        this.createHealthBar();
    }

    public update(data: RemotePlayerData): void {
        // Update target position and rotation
        this.targetPosition.set(data.position.x, data.position.y, data.position.z);
        this.targetRotationY = data.rotationY;
    }

    public updateInterpolation(deltaTime: number): void {
        // Interpolate position smoothly
        const deltaSeconds = deltaTime / 1000;
        const lerpFactor = Math.min(1, this.interpolationSpeed * (deltaSeconds * 60)); // Normalize to 60fps
        
        this.currentPosition.lerp(this.targetPosition, lerpFactor);
        
        // Interpolate rotation
        let rotationDiff = this.targetRotationY - this.currentRotationY;
        // Normalize rotation difference to [-PI, PI]
        while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
        while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
        
        this.currentRotationY += rotationDiff * lerpFactor;
        
        // Update character visual position
        this.character.updatePosition(this.currentPosition, this.currentRotationY);
    }

    public getId(): string {
        return this.id;
    }

    public getCharacter(): Player2Character {
        return this.character;
    }
    
    public getHealth(): number {
        return this.health;
    }
    
    public getMaxHealth(): number {
        return this.maxHealth;
    }
    
    public takeDamage(amount: number = 1): void {
        this.health = Math.max(0, this.health - amount);
        this.character.takeDamage(amount);
        this.updateHealthBarDisplay();
    }
    
    public isDead(): boolean {
        return this.health <= 0;
    }
    
    private createHealthBar(): void {
        // Create health bar container
        const healthBar = document.createElement('div');
        healthBar.id = `health-bar-${this.id}`;
        healthBar.style.cssText = `
            position: absolute;
            pointer-events: none;
            display: flex;
            gap: 3px;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            transform: translate(-50%, -100%);
        `;
        document.body.appendChild(healthBar);
        this.healthBarElement = healthBar;
        
        // Initial health display
        this.updateHealthBarDisplay();
    }
    
    private updateHealthBarDisplay(): void {
        if (!this.healthBarElement) return;
        
        const clampedHealth = Math.max(0, Math.min(this.maxHealth, this.health));
        
        // Clear existing hearts
        this.healthBarElement.innerHTML = '';
        
        // Create hearts based on current health
        for (let i = 0; i < this.maxHealth; i++) {
            const heart = document.createElement('div');
            const isFilled = i < clampedHealth;
            heart.style.cssText = `
                width: 20px;
                height: 20px;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.2s ease;
            `;
            if (isFilled) {
                heart.textContent = '❤️';
                heart.style.opacity = '1';
            } else {
                heart.textContent = '🤍';
                heart.style.opacity = '0.3';
            }
            this.healthBarElement.appendChild(heart);
        }
    }
    
    public updateHealthBarPosition(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): void {
        if (!this.healthBarElement) return;
        
        // Character mesh is positioned at ground level (y=0), head is at y=1.6 relative to mesh
        // So head world position is at y=1.6, add 0.4 to position health bar above head
        const headPosition = new THREE.Vector3(
            this.currentPosition.x,
            1.6 + 0.4, // Head height (1.6) + offset above head (0.4)
            this.currentPosition.z
        );
        
        // Project 3D position to 2D screen coordinates
        const projectedPosition = headPosition.clone();
        projectedPosition.project(camera);
        
        // Convert normalized device coordinates to screen coordinates
        const x = (projectedPosition.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (projectedPosition.y * -0.5 + 0.5) * renderer.domElement.clientHeight;
        
        // Only show health bar if player is in front of camera and within reasonable distance
        if (projectedPosition.z < 1 && projectedPosition.z > 0) {
            this.healthBarElement.style.display = 'flex';
            this.healthBarElement.style.left = `${x}px`;
            this.healthBarElement.style.top = `${y}px`;
        } else {
            // Hide if behind camera or too far
            this.healthBarElement.style.display = 'none';
        }
    }
    
    public getBoundingBox(): THREE.Box3 {
        return this.character.getBoundingBox();
    }
    
    public getPosition(): THREE.Vector3 {
        return this.currentPosition.clone();
    }

    public dispose(): void {
        // Remove health bar element
        if (this.healthBarElement && this.healthBarElement.parentNode) {
            this.healthBarElement.parentNode.removeChild(this.healthBarElement);
            this.healthBarElement = null;
        }
        
        this.character.dispose();
    }
}

