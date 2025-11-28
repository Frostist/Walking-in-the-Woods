import * as THREE from 'three';

export class NightMonster {
    private mesh: THREE.Group;
    private scene: THREE.Scene;
    private position: THREE.Vector3;
    private speed: number = 2.5; // Slightly slower than main monster
    private elapsedTime: number = 0;
    private health: number = 5;
    private maxHealth: number = 5;
    private isAlive: boolean = true;
    private id: string;

    constructor(scene: THREE.Scene, startPosition: THREE.Vector3, id: string) {
        this.scene = scene;
        this.position = startPosition.clone();
        this.id = id;
        this.mesh = this.createMonster();
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }

    private createMonster(): THREE.Group {
        const monster = new THREE.Group();

        // Body (smaller, more agile looking - zombie-like)
        const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.6);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d1b3d, // Dark purple
            roughness: 0.9,
            emissive: 0x1a0a2a, // Dark purple glow
            emissiveIntensity: 0.4
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.6;
        body.castShadow = true;
        body.receiveShadow = true;
        monster.add(body);

        // Head (smaller, more menacing)
        const headGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a0a2a,
            roughness: 0.9,
            emissive: 0x2d1b3d,
            emissiveIntensity: 0.5
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        head.receiveShadow = true;
        monster.add(head);

        // Glowing purple eyes
        const eyeGeometry = new THREE.SphereGeometry(0.12, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0x9d4edd,
            emissive: 0x9d4edd,
            emissiveIntensity: 2.5
        });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.15, 1.5, 0.35);
        monster.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.15, 1.5, 0.35);
        monster.add(rightEye);

        // Arms (thinner, more skeletal)
        const armGeometry = new THREE.BoxGeometry(0.25, 1.0, 0.25);
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d1b3d,
            roughness: 0.9
        });
        
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.5, 0.5, 0);
        leftArm.castShadow = true;
        monster.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.5, 0.5, 0);
        rightArm.castShadow = true;
        monster.add(rightArm);

        // Legs (thinner)
        const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d1b3d,
            roughness: 0.9
        });
        
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.25, -0.4, 0);
        leftLeg.castShadow = true;
        monster.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.25, -0.4, 0);
        rightLeg.castShadow = true;
        monster.add(rightLeg);

        // Store references for animation
        (monster as any).leftArm = leftArm;
        (monster as any).rightArm = rightArm;
        (monster as any).leftLeg = leftLeg;
        (monster as any).rightLeg = rightLeg;

        return monster;
    }

    public update(deltaTime: number, playerPosition: THREE.Vector3): void {
        if (!this.isAlive) {
            return;
        }

        const deltaSeconds = deltaTime / 1000;
        this.elapsedTime += deltaSeconds;

        // Calculate direction to player
        const direction = new THREE.Vector3();
        direction.subVectors(playerPosition, this.position);
        direction.y = 0; // Keep movement horizontal
        const distance = direction.length();

        if (distance > 0.1) {
            // Normalize direction
            direction.normalize();

            // Move towards player
            this.position.x += direction.x * this.speed * deltaSeconds;
            this.position.z += direction.z * this.speed * deltaSeconds;

            // Update mesh position
            this.mesh.position.copy(this.position);

            // Rotate to face player
            const angle = Math.atan2(direction.x, direction.z);
            this.mesh.rotation.y = angle;

            // Animate walking (faster, more erratic movement)
            const walkSpeed = 10.0;
            const armSwing = Math.sin(this.elapsedTime * walkSpeed) * 0.4;
            const legSwing = Math.sin(this.elapsedTime * walkSpeed + Math.PI) * 0.3;

            const leftArm = (this.mesh as any).leftArm;
            const rightArm = (this.mesh as any).rightArm;
            const leftLeg = (this.mesh as any).leftLeg;
            const rightLeg = (this.mesh as any).rightLeg;

            if (leftArm) leftArm.rotation.x = armSwing;
            if (rightArm) rightArm.rotation.x = -armSwing;
            if (leftLeg) leftLeg.rotation.x = -legSwing;
            if (rightLeg) rightLeg.rotation.x = legSwing;
        }

        // Keep monster at ground level
        this.position.y = 1.0;
        this.mesh.position.y = this.position.y;
    }

    /**
     * Update monster position from server
     */
    public updateFromServer(position: { x: number; y: number; z: number }, rotationY: number, health?: number, maxHealth?: number): void {
        if (!this.isAlive && health === undefined) {
            return;
        }
        
        // Update position from server
        this.position.set(position.x, position.y, position.z);
        this.mesh.position.copy(this.position);
        
        // Update rotation from server
        this.mesh.rotation.y = rotationY;
        
        // Update health if provided
        if (health !== undefined) {
            this.health = health;
        }
        if (maxHealth !== undefined) {
            this.maxHealth = maxHealth;
        }
        
        // Show/hide mesh based on alive status
        this.mesh.visible = this.isAlive;
        
        // Animate walking
        this.elapsedTime += 0.016;
        const walkSpeed = 10.0;
        const armSwing = Math.sin(this.elapsedTime * walkSpeed) * 0.4;
        const legSwing = Math.sin(this.elapsedTime * walkSpeed + Math.PI) * 0.3;

        const leftArm = (this.mesh as any).leftArm;
        const rightArm = (this.mesh as any).rightArm;
        const leftLeg = (this.mesh as any).leftLeg;
        const rightLeg = (this.mesh as any).rightLeg;

        if (leftArm) leftArm.rotation.x = armSwing;
        if (rightArm) rightArm.rotation.x = -armSwing;
        if (leftLeg) leftLeg.rotation.x = -legSwing;
        if (rightLeg) rightLeg.rotation.x = legSwing;
    }

    /**
     * Handle monster death (called when day comes)
     * Plays a "burn" dissolve effect when dying to sunlight
     */
    public die(): void {
        this.isAlive = false;
        
        // Play burn/dissolve effect before hiding
        this.playBurnEffect();
    }
    
    /**
     * Play a burning/dissolve effect when monster dies to sunlight
     */
    private playBurnEffect(): void {
        // Change all materials to show burning effect
        this.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const material = child.material as THREE.MeshStandardMaterial;
                // Make it glow orange/red like burning
                material.emissive = new THREE.Color(0xff4400);
                material.emissiveIntensity = 2.0;
            }
        });
        
        // Animate scale down and fade over 500ms
        const startTime = performance.now();
        const duration = 500;
        const initialScale = this.mesh.scale.clone();
        
        const animate = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Scale down
            const scale = 1 - progress;
            this.mesh.scale.set(
                initialScale.x * scale,
                initialScale.y * scale,
                initialScale.z * scale
            );
            
            // Move up slightly (like dissolving into the air)
            this.mesh.position.y += 0.02;
            
            // Update emissive intensity
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                    const material = child.material as THREE.MeshStandardMaterial;
                    material.emissiveIntensity = 2.0 * (1 - progress);
                    material.opacity = 1 - progress;
                    material.transparent = true;
                }
            });
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Hide mesh after animation completes
                this.mesh.visible = false;
            }
        };
        
        requestAnimationFrame(animate);
    }

    /**
     * Get monster ID
     */
    public getId(): string {
        return this.id;
    }

    /**
     * Get position
     */
    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    /**
     * Get mesh
     */
    public getMesh(): THREE.Group {
        return this.mesh;
    }

    /**
     * Check if monster is alive
     */
    public getIsAlive(): boolean {
        return this.isAlive;
    }

    /**
     * Get current health
     */
    public getHealth(): number {
        return this.health;
    }

    /**
     * Get max health
     */
    public getMaxHealth(): number {
        return this.maxHealth;
    }

    public dispose(): void {
        this.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        this.scene.remove(this.mesh);
    }
}

