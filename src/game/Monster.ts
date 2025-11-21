import * as THREE from 'three';

export class Monster {
    private mesh: THREE.Group;
    private scene: THREE.Scene;
    private position: THREE.Vector3;
    private speed: number = 3.0; // Slightly slower than player
    private isFrozen: boolean = false;
    private frozenRotation: number = 0;
    private elapsedTime: number = 0;

    constructor(scene: THREE.Scene, startPosition: THREE.Vector3) {
        this.scene = scene;
        this.position = startPosition.clone();
        this.mesh = this.createMonster();
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
    }

    private createMonster(): THREE.Group {
        const monster = new THREE.Group();

        // Body (dark, menacing shape)
        const bodyGeometry = new THREE.BoxGeometry(1.2, 1.5, 0.8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, // Very dark, almost black
            roughness: 0.9,
            emissive: 0x330000, // Slight red glow
            emissiveIntensity: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.75;
        body.castShadow = true;
        body.receiveShadow = true;
        monster.add(body);

        // Head
        const headGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            roughness: 0.9,
            emissive: 0x440000,
            emissiveIntensity: 0.4
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.9;
        head.castShadow = true;
        head.receiveShadow = true;
        monster.add(head);

        // Glowing eyes
        const eyeGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 2.0
        });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.2, 1.9, 0.45);
        monster.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.2, 1.9, 0.45);
        monster.add(rightEye);

        // Arms
        const armGeometry = new THREE.BoxGeometry(0.3, 1.2, 0.3);
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9
        });
        
        const leftArm = new THREE.Mesh(armGeometry, armMaterial);
        leftArm.position.set(-0.75, 0.6, 0);
        leftArm.castShadow = true;
        monster.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeometry, armMaterial);
        rightArm.position.set(0.75, 0.6, 0);
        rightArm.castShadow = true;
        monster.add(rightArm);

        // Legs
        const legGeometry = new THREE.BoxGeometry(0.4, 1.0, 0.4);
        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9
        });
        
        const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        leftLeg.position.set(-0.3, -0.5, 0);
        leftLeg.castShadow = true;
        monster.add(leftLeg);
        
        const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        rightLeg.position.set(0.3, -0.5, 0);
        rightLeg.castShadow = true;
        monster.add(rightLeg);

        // Store references for animation
        (monster as any).leftArm = leftArm;
        (monster as any).rightArm = rightArm;
        (monster as any).leftLeg = leftLeg;
        (monster as any).rightLeg = rightLeg;

        return monster;
    }

    public update(deltaTime: number, playerPosition: THREE.Vector3, isDay: boolean): void {
        const deltaSeconds = deltaTime / 1000;
        this.elapsedTime += deltaSeconds;

        if (isDay) {
            // Freeze during day
            if (!this.isFrozen) {
                // Store current rotation when first freezing
                this.frozenRotation = this.mesh.rotation.y;
            }
            this.isFrozen = true;
            
            // Reset animation to neutral pose
            const leftArm = (this.mesh as any).leftArm;
            const rightArm = (this.mesh as any).rightArm;
            const leftLeg = (this.mesh as any).leftLeg;
            const rightLeg = (this.mesh as any).rightLeg;

            if (leftArm) leftArm.rotation.x = 0;
            if (rightArm) rightArm.rotation.x = 0;
            if (leftLeg) leftLeg.rotation.x = 0;
            if (rightLeg) rightLeg.rotation.x = 0;
            
            // Keep frozen rotation
            this.mesh.rotation.y = this.frozenRotation;
            return; // Don't move or chase during day
        } else {
            // Unfreeze and chase during night
            this.isFrozen = false;

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

                // Animate walking (swing arms and legs)
                const walkSpeed = 8.0;
                const armSwing = Math.sin(this.elapsedTime * walkSpeed) * 0.3;
                const legSwing = Math.sin(this.elapsedTime * walkSpeed + Math.PI) * 0.2;

                const leftArm = (this.mesh as any).leftArm;
                const rightArm = (this.mesh as any).rightArm;
                const leftLeg = (this.mesh as any).leftLeg;
                const rightLeg = (this.mesh as any).rightLeg;

                if (leftArm) leftArm.rotation.x = armSwing;
                if (rightArm) rightArm.rotation.x = -armSwing;
                if (leftLeg) leftLeg.rotation.x = -legSwing;
                if (rightLeg) rightLeg.rotation.x = legSwing;
            }
        }

        // Keep monster at ground level
        this.position.y = 1.0; // Half of monster height
        this.mesh.position.y = this.position.y;
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public getMesh(): THREE.Group {
        return this.mesh;
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

