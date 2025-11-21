import * as THREE from 'three';

export class Player2Character {
    private mesh: THREE.Group;
    private scene: THREE.Scene;
    
    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.mesh = this.createCharacter();
        // Add to scene
        scene.add(this.mesh);
        this.mesh.position.set(0, 0, 0);
    }
    
    public updatePosition(playerPosition: THREE.Vector3, rotationY: number): void {
        // Update position
        if (this.mesh.parent === this.scene) {
            this.mesh.position.set(playerPosition.x, 0, playerPosition.z);
            this.mesh.rotation.y = rotationY;
        }
    }
    
    private createCharacter(): THREE.Group {
        const character = new THREE.Group();
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac, // Skin tone
            roughness: 0.8
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.6;
        head.visible = true; // Always visible for player 2
        head.castShadow = true;
        head.receiveShadow = true;
        character.add(head);
        
        // Neck
        const neckGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8);
        const neckMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac, // Skin tone
            roughness: 0.8
        });
        const neck = new THREE.Mesh(neckGeometry, neckMaterial);
        neck.position.y = 1.45;
        neck.castShadow = true;
        neck.receiveShadow = true;
        character.add(neck);
        
        // Torso (chest) - RED for Player 2!
        const torsoGeometry = new THREE.BoxGeometry(0.32, 0.4, 0.2);
        const torsoMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000, // RED shirt for Player 2
            roughness: 0.7
        });
        const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
        torso.position.y = 1.2;
        torso.castShadow = true;
        torso.receiveShadow = true;
        character.add(torso);
        
        // Hips
        const hipsGeometry = new THREE.BoxGeometry(0.35, 0.2, 0.2);
        const hipsMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5016, // Dark green pants
            roughness: 0.8
        });
        const hips = new THREE.Mesh(hipsGeometry, hipsMaterial);
        hips.position.y = 0.85;
        hips.castShadow = true;
        hips.receiveShadow = true;
        character.add(hips);
        
        // Left shoulder (attachment point for arm)
        const shoulderGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        const shoulderMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac, // Skin tone
            roughness: 0.8
        });
        const leftShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
        leftShoulder.position.set(-0.28, 1.25, 0);
        leftShoulder.castShadow = true;
        leftShoulder.receiveShadow = true;
        character.add(leftShoulder);
        
        // Right shoulder
        const rightShoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
        rightShoulder.position.set(0.28, 1.25, 0);
        rightShoulder.castShadow = true;
        rightShoulder.receiveShadow = true;
        character.add(rightShoulder);
        
        // Left upper arm
        const upperArmGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.35, 8);
        const armMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac, // Skin tone
            roughness: 0.8
        });
        const leftUpperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
        leftUpperArm.position.set(-0.28, 1.075, 0);
        leftUpperArm.rotation.z = 0.2; // Slight forward angle
        leftUpperArm.castShadow = true;
        leftUpperArm.receiveShadow = true;
        character.add(leftUpperArm);
        
        // Left forearm
        const forearmGeometry = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8);
        const leftForearm = new THREE.Mesh(forearmGeometry, armMaterial);
        leftForearm.position.set(-0.28, 0.85, 0);
        leftForearm.rotation.z = 0.2;
        leftForearm.castShadow = true;
        leftForearm.receiveShadow = true;
        character.add(leftForearm);
        
        // Left hand
        const handGeometry = new THREE.BoxGeometry(0.1, 0.12, 0.05);
        const handMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            roughness: 0.8
        });
        const leftHand = new THREE.Mesh(handGeometry, handMaterial);
        leftHand.position.set(-0.28, 0.7, 0);
        leftHand.castShadow = true;
        leftHand.receiveShadow = true;
        character.add(leftHand);
        
        // Right upper arm
        const rightUpperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
        rightUpperArm.position.set(0.28, 1.075, 0);
        rightUpperArm.rotation.z = -0.2; // Slight forward angle
        rightUpperArm.castShadow = true;
        rightUpperArm.receiveShadow = true;
        character.add(rightUpperArm);
        
        // Right forearm
        const rightForearm = new THREE.Mesh(forearmGeometry, armMaterial);
        rightForearm.position.set(0.28, 0.85, 0);
        rightForearm.rotation.z = -0.2;
        rightForearm.castShadow = true;
        rightForearm.receiveShadow = true;
        character.add(rightForearm);
        
        // Right hand
        const rightHand = new THREE.Mesh(handGeometry, handMaterial);
        rightHand.position.set(0.28, 0.7, 0);
        rightHand.castShadow = true;
        rightHand.receiveShadow = true;
        character.add(rightHand);
        
        // Left thigh
        const thighGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.45, 8);
        const legMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d5016, // Dark green pants
            roughness: 0.8
        });
        const leftThigh = new THREE.Mesh(thighGeometry, legMaterial);
        leftThigh.position.set(-0.12, 0.525, 0);
        leftThigh.rotation.z = 0.05; // Slight forward angle
        leftThigh.castShadow = true;
        leftThigh.receiveShadow = true;
        character.add(leftThigh);
        
        // Left shin
        const shinGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
        const shinMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac, // Skin tone for lower leg
            roughness: 0.8
        });
        const leftShin = new THREE.Mesh(shinGeometry, shinMaterial);
        leftShin.position.set(-0.12, 0.25, 0);
        leftShin.rotation.z = 0.05;
        leftShin.castShadow = true;
        leftShin.receiveShadow = true;
        character.add(leftShin);
        
        // Left foot
        const footGeometry = new THREE.BoxGeometry(0.12, 0.05, 0.25);
        const footMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, // Black shoes
            roughness: 0.9
        });
        const leftFoot = new THREE.Mesh(footGeometry, footMaterial);
        leftFoot.position.set(-0.12, 0.05, 0.1);
        leftFoot.castShadow = true;
        leftFoot.receiveShadow = true;
        character.add(leftFoot);
        
        // Right thigh
        const rightThigh = new THREE.Mesh(thighGeometry, legMaterial);
        rightThigh.position.set(0.12, 0.525, 0);
        rightThigh.rotation.z = -0.05; // Slight forward angle
        rightThigh.castShadow = true;
        rightThigh.receiveShadow = true;
        character.add(rightThigh);
        
        // Right shin
        const rightShin = new THREE.Mesh(shinGeometry, shinMaterial);
        rightShin.position.set(0.12, 0.25, 0);
        rightShin.rotation.z = -0.05;
        rightShin.castShadow = true;
        rightShin.receiveShadow = true;
        character.add(rightShin);
        
        // Right foot
        const rightFoot = new THREE.Mesh(footGeometry, footMaterial);
        rightFoot.position.set(0.12, 0.05, 0.1);
        rightFoot.castShadow = true;
        rightFoot.receiveShadow = true;
        character.add(rightFoot);
        
        return character;
    }
    
    public getMesh(): THREE.Group {
        return this.mesh;
    }
    
    public dispose(): void {
        if (this.scene.children.includes(this.mesh)) {
            this.scene.remove(this.mesh);
        }
        // Three.js will handle cleanup when scene is disposed
    }
}

