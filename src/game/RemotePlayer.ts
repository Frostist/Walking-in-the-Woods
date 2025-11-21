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
    }
    
    public getBoundingBox(): THREE.Box3 {
        return this.character.getBoundingBox();
    }
    
    public getPosition(): THREE.Vector3 {
        return this.currentPosition.clone();
    }

    public dispose(): void {
        this.character.dispose();
    }
}

