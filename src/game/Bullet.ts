import * as THREE from 'three';

export class Bullet {
    private mesh: THREE.Mesh;
    private velocity: THREE.Vector3;
    private speed: number = 50.0; // Units per second
    private lifetime: number = 5.0; // Seconds
    private age: number = 0;
    private scene: THREE.Scene;
    private isDisposed: boolean = false;

    constructor(
        scene: THREE.Scene,
        position: THREE.Vector3,
        direction: THREE.Vector3
    ) {
        this.scene = scene;
        
        // Create bullet mesh (small sphere)
        const geometry = new THREE.SphereGeometry(0.05, 8, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0xffff00, // Yellow bullet
            emissive: 0xffff00,
            emissiveIntensity: 0.5
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(position);
        
        // Set velocity based on direction
        this.velocity = direction.normalize().multiplyScalar(this.speed);
        
        // Add to scene
        scene.add(this.mesh);
        
        // Enable shadows
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = false;
    }

    public update(deltaTime: number): boolean {
        if (this.isDisposed) return false;
        
        // Update age
        this.age += deltaTime / 1000; // Convert to seconds
        
        // Check lifetime
        if (this.age >= this.lifetime) {
            this.dispose();
            return false;
        }
        
        // Update position
        const deltaSeconds = deltaTime / 1000;
        const movement = this.velocity.clone().multiplyScalar(deltaSeconds);
        this.mesh.position.add(movement);
        
        return true;
    }

    public dispose(): void {
        if (this.isDisposed) return;
        
        if (this.scene.children.includes(this.mesh)) {
            this.scene.remove(this.mesh);
        }
        
        this.mesh.geometry.dispose();
        if (this.mesh.material instanceof THREE.Material) {
            this.mesh.material.dispose();
        }
        
        this.isDisposed = true;
    }

    public getMesh(): THREE.Mesh {
        return this.mesh;
    }

    public getPosition(): THREE.Vector3 {
        return this.mesh.position.clone();
    }
}

