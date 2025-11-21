import * as THREE from 'three';
import { GunLoader } from './GunLoader';
import { CharacterDataLoader, CharacterExportData } from './CharacterDataLoader';

export class Character {
    private mesh: THREE.Group;
    private camera: THREE.PerspectiveCamera;
    private scene: THREE.Scene;
    private gun: THREE.Group | null = null;
    private rightHand: THREE.Mesh | null = null;
    private characterData: CharacterExportData | null = null;
    
    constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
        this.camera = camera;
        this.scene = scene;
        this.mesh = new THREE.Group();
        // Start in scene (will be moved to camera in first-person mode)
        scene.add(this.mesh);
        this.mesh.position.set(0, 0, 0);
        // Load character data asynchronously
        this.loadCharacterData();
    }
    
    private async loadCharacterData(): Promise<void> {
        try {
            this.characterData = await CharacterDataLoader.loadCharacterData();
            const oldMesh = this.mesh;
            this.mesh = this.createCharacter();
            // Remove old mesh and add new one
            if (oldMesh && this.scene.children.includes(oldMesh)) {
                this.scene.remove(oldMesh);
            }
            if (!this.scene.children.includes(this.mesh)) {
                this.scene.add(this.mesh);
            }
            this.mesh.position.set(0, 0, 0);
        } catch (error) {
            console.error('Failed to load character data, using default character:', error);
            const oldMesh = this.mesh;
            this.mesh = this.createDefaultCharacter();
            if (oldMesh && this.scene.children.includes(oldMesh)) {
                this.scene.remove(oldMesh);
            }
            if (!this.scene.children.includes(this.mesh)) {
                this.scene.add(this.mesh);
            }
            this.mesh.position.set(0, 0, 0);
        }
    }
    
    public async ensureCharacterLoaded(): Promise<void> {
        if (!this.characterData) {
            // Load synchronously since data is now embedded
            this.characterData = await CharacterDataLoader.loadCharacterData();
            const oldMesh = this.mesh;
            this.mesh = this.createCharacter();
            if (oldMesh && this.scene.children.includes(oldMesh)) {
                this.scene.remove(oldMesh);
            }
            if (!this.scene.children.includes(this.mesh)) {
                this.scene.add(this.mesh);
            }
            this.mesh.position.set(0, 0, 0);
        }
    }
    
    public setCameraMode(isThirdPerson: boolean, playerPosition: THREE.Vector3, rotationY: number): void {
        if (isThirdPerson) {
            // Third-person: character in scene at ground level
            if (this.camera.children.includes(this.mesh)) {
                this.camera.remove(this.mesh);
            }
            // Ensure mesh is in scene
            if (!this.scene.children.includes(this.mesh)) {
                this.scene.add(this.mesh);
            }
            // Position character at ground level
            this.mesh.position.set(playerPosition.x, 0, playerPosition.z);
            this.mesh.rotation.y = rotationY;
            // Show head in third-person
            const head = this.mesh.children.find(child => {
                if (child instanceof THREE.Mesh) {
                    const headPart = this.characterData?.parts.find(p => p.id === 'head');
                    if (headPart) {
                        return Math.abs(child.position.y - headPart.position.y) < 0.1;
                    }
                    return Math.abs(child.position.y - 1.6) < 0.1;
                }
                return false;
            });
            if (head) head.visible = true;
            // Set character to layer 0 so it's visible in third-person
            this.mesh.layers.set(0);
            // Gun is visible in third-person (attached to hand in scene)
            if (this.gun) {
                // Remove gun from camera if it's there
                if (this.camera.children.includes(this.gun)) {
                    this.camera.remove(this.gun);
                }
                // Attach gun back to hand if not already there
                if (this.rightHand && !this.rightHand.children.includes(this.gun)) {
                    this.rightHand.add(this.gun);
                    // Reset gun position relative to hand
                    this.gun.position.set(0, 0, -0.15);
                    this.gun.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
                }
                this.gun.layers.set(0);
            }
        } else {
            // First-person: keep in scene but hide from camera using layers
            if (this.camera.children.includes(this.mesh)) {
                this.camera.remove(this.mesh);
            }
            // Ensure mesh is in scene
            if (!this.scene.children.includes(this.mesh)) {
                this.scene.add(this.mesh);
            }
            // Position character at ground level (below camera position)
            this.mesh.position.set(playerPosition.x, 0, playerPosition.z);
            this.mesh.rotation.y = rotationY;
            // Hide head in first-person
            const head = this.mesh.children.find(child => {
                if (child instanceof THREE.Mesh) {
                    const headPart = this.characterData?.parts.find(p => p.id === 'head');
                    if (headPart) {
                        return Math.abs(child.position.y - headPart.position.y) < 0.1;
                    }
                    return Math.abs(child.position.y - 1.6) < 0.1;
                }
                return false;
            });
            if (head) head.visible = false;
            // Set character to layer 1 so it's hidden from camera but still casts shadows
            this.mesh.layers.set(1);
            // For first-person, keep gun attached to hand (same as third-person)
            if (this.gun) {
                // Remove gun from camera if it's there
                if (this.camera.children.includes(this.gun)) {
                    this.camera.remove(this.gun);
                }
                // Ensure gun is attached to hand
                if (this.rightHand && !this.rightHand.children.includes(this.gun)) {
                    this.rightHand.add(this.gun);
                    // Reset gun position relative to hand
                    this.gun.position.set(0, 0, -0.15);
                    this.gun.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
                }
                // Make gun visible even though character is on layer 1
                // Set gun to layer 0 so it's visible in first-person
                this.gun.layers.set(0);
                this.gun.visible = true;
                this.gun.traverse((child: THREE.Object3D) => {
                    child.visible = true;
                    if (child instanceof THREE.Mesh) {
                        child.visible = true;
                        child.layers.set(0);
                    }
                });
            }
        }
    }
    
    public updatePosition(playerPosition: THREE.Vector3, rotationY: number): void {
        // Update position when in scene (both first-person and third-person now keep mesh in scene)
        if (this.mesh.parent === this.scene) {
            this.mesh.position.set(playerPosition.x, 0, playerPosition.z);
            this.mesh.rotation.y = rotationY;
        }
    }
    
    private createCharacter(): THREE.Group {
        if (!this.characterData) {
            return this.createDefaultCharacter();
        }
        
        const character = new THREE.Group();
        const partMap = new Map<string, THREE.Mesh>();
        
        // Create all parts from JSON data
        for (const partData of this.characterData.parts) {
            const geometry = this.createGeometryFromPart(partData);
            const material = new THREE.MeshStandardMaterial({
                color: partData.color,
                roughness: 0.8
            });
            const mesh = new THREE.Mesh(geometry, material);
            
            // Apply position, rotation, and scale from JSON
            mesh.position.set(partData.position.x, partData.position.y, partData.position.z);
            mesh.rotation.set(partData.rotation.x, partData.rotation.y, partData.rotation.z);
            mesh.scale.set(partData.scale.x, partData.scale.y, partData.scale.z);
            
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Store part ID in userData for later reference
            mesh.userData.id = partData.id;
            mesh.userData.type = partData.type;
            
            // Hide head in first-person
            if (partData.id === 'head') {
                mesh.visible = false;
            }
            
            character.add(mesh);
            partMap.set(partData.id, mesh);
        }
        
        // Store reference to right hand for gun attachment
        this.rightHand = partMap.get('rightHand') || null;
        
        return character;
    }
    
    private createGeometryFromPart(part: { geometry: string; type: string; id: string }): THREE.BufferGeometry {
        // Use exact geometry sizes from CharacterBuilder based on part type and ID
        switch (part.geometry) {
            case 'sphere':
                if (part.type === 'head') {
                    return new THREE.SphereGeometry(0.25, 16, 16);
                } else if (part.type === 'shoulder') {
                    return new THREE.SphereGeometry(0.1, 8, 8);
                }
                return new THREE.SphereGeometry(0.25, 16, 16);
            case 'box':
                if (part.type === 'torso') {
                    return new THREE.BoxGeometry(0.32, 0.4, 0.2);
                } else if (part.type === 'hips') {
                    return new THREE.BoxGeometry(0.35, 0.2, 0.2);
                } else if (part.type === 'hand') {
                    return new THREE.BoxGeometry(0.1, 0.12, 0.05);
                } else if (part.type === 'foot') {
                    return new THREE.BoxGeometry(0.12, 0.05, 0.25);
                }
                return new THREE.BoxGeometry(0.2, 0.2, 0.2); // Default for custom boxes
            case 'cylinder':
                if (part.type === 'neck') {
                    return new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8);
                } else if (part.type === 'arm') {
                    // Check if it's upper arm or forearm
                    if (part.id.includes('Upper') || part.id === 'leftUpperArm' || part.id === 'rightUpperArm') {
                        return new THREE.CylinderGeometry(0.08, 0.08, 0.35, 8);
                    } else {
                        return new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8);
                    }
                } else if (part.type === 'leg') {
                    // Check if it's thigh or shin
                    if (part.id.includes('Thigh') || part.id === 'leftThigh' || part.id === 'rightThigh') {
                        return new THREE.CylinderGeometry(0.1, 0.1, 0.45, 8);
                    } else {
                        return new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
                    }
                }
                return new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8); // Default for custom cylinders
            default:
                return new THREE.BoxGeometry(0.2, 0.2, 0.2);
        }
    }
    
    private createDefaultCharacter(): THREE.Group {
        const character = new THREE.Group();
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xffdbac, // Skin tone
            roughness: 0.8
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.6;
        head.visible = false; // Hide head in first-person
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
        
        // Torso (chest)
        const torsoGeometry = new THREE.BoxGeometry(0.32, 0.4, 0.2);
        const torsoMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a90e2, // Blue shirt
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
        
        // Right upper arm - straight out in front
        const rightUpperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
        rightUpperArm.position.set(0.28, 1.075, -0.175); // Move forward (negative Z)
        rightUpperArm.rotation.x = Math.PI / 2; // Rotate to point forward (horizontal)
        rightUpperArm.rotation.z = -0.1; // Slight angle to the right
        rightUpperArm.castShadow = true;
        rightUpperArm.receiveShadow = true;
        character.add(rightUpperArm);
        
        // Right forearm - continue straight forward
        const rightForearm = new THREE.Mesh(forearmGeometry, armMaterial);
        rightForearm.position.set(0.28, 1.075, -0.5); // Further forward
        rightForearm.rotation.x = Math.PI / 2; // Rotate to point forward (horizontal)
        rightForearm.rotation.z = -0.1; // Slight angle to the right
        rightForearm.castShadow = true;
        rightForearm.receiveShadow = true;
        character.add(rightForearm);
        
        // Right hand - at the end of the arm, holding gun forward
        const rightHand = new THREE.Mesh(handGeometry, handMaterial);
        rightHand.position.set(0.28, 1.075, -0.65); // At the end of the extended arm
        rightHand.rotation.x = Math.PI / 2; // Rotate to match arm orientation
        rightHand.rotation.z = -0.1;
        rightHand.castShadow = true;
        rightHand.receiveShadow = true;
        character.add(rightHand);
        // Store reference to right hand for gun attachment
        this.rightHand = rightHand;
        
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
    
    public async loadGun(): Promise<void> {
        try {
            // Ensure character data and mesh are loaded
            await this.ensureCharacterLoaded();
            
            // Double-check rightHand exists
            if (!this.rightHand) {
                // Try to find it in the mesh
                const findPart = (obj: THREE.Object3D, id: string): THREE.Mesh | undefined => {
                    if (obj instanceof THREE.Mesh && obj.userData?.id === id) {
                        return obj;
                    }
                    for (const child of obj.children) {
                        const found = findPart(child, id);
                        if (found) return found;
                    }
                    return undefined;
                };
                this.rightHand = findPart(this.mesh, 'rightHand') || null;
            }
            
            const gunModel = await GunLoader.loadGun();
            this.gun = gunModel;
            
            // Use gun data from JSON if available
            if (this.characterData?.gun) {
                const gunData = this.characterData.gun;
                this.gun.scale.set(gunData.scale.x, gunData.scale.y, gunData.scale.z);
                
                // Find parent part - search recursively in case it's nested
                let parentPart: THREE.Mesh | undefined = undefined;
                
                const findPart = (obj: THREE.Object3D, id: string): THREE.Mesh | undefined => {
                    if (obj instanceof THREE.Mesh && obj.userData?.id === id) {
                        return obj;
                    }
                    for (const child of obj.children) {
                        const found = findPart(child, id);
                        if (found) return found;
                    }
                    return undefined;
                };
                
                parentPart = findPart(this.mesh, gunData.parentId);
                
                // Fallback to stored rightHand reference
                if (!parentPart && this.rightHand) {
                    parentPart = this.rightHand;
                }
                
                if (parentPart) {
                    // Remove gun from any previous parent
                    if (this.gun.parent) {
                        this.gun.parent.remove(this.gun);
                    }
                    parentPart.add(this.gun);
                    // Position and rotation are relative to parent (rightHand)
                    this.gun.position.set(gunData.position.x, gunData.position.y, gunData.position.z);
                    this.gun.rotation.set(gunData.rotation.x, gunData.rotation.y, gunData.rotation.z);
                    console.log('Gun attached to', gunData.parentId, 'at position', gunData.position);
                } else {
                    console.warn('Could not find parent part for gun:', gunData.parentId, 'Available parts:', Array.from(this.mesh.children).map(c => c.userData?.id));
                    // Fallback: try to attach to rightHand directly
                    if (this.rightHand) {
                        if (this.gun.parent) {
                            this.gun.parent.remove(this.gun);
                        }
                        this.rightHand.add(this.gun);
                        this.gun.position.set(gunData.position.x, gunData.position.y, gunData.position.z);
                        this.gun.rotation.set(gunData.rotation.x, gunData.rotation.y, gunData.rotation.z);
                        console.log('Gun attached to rightHand (fallback)');
                    } else {
                        console.error('Cannot attach gun: no parent part and no rightHand');
                    }
                }
            } else {
                // Fallback to old method
                const bbox = this.getGunBoundingBox();
                if (bbox) {
                    const size = bbox.getSize(new THREE.Vector3());
                    const targetLength = 0.4;
                    const currentLength = Math.max(size.x, size.y, size.z);
                    const scale = targetLength / currentLength;
                    this.gun.scale.set(scale, scale, scale);
                } else {
                    this.gun.scale.set(0.5, 0.5, 0.5);
                }
                
                if (this.rightHand) {
                    this.rightHand.add(this.gun);
                    this.gun.position.set(0, 0, -0.15);
                    this.gun.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
                }
            }
            
            // Make gun visible
            this.gun.layers.set(0);
            this.gun.visible = true;
            this.gun.traverse((child: THREE.Object3D) => {
                child.visible = true;
                if (child instanceof THREE.Mesh) {
                    child.visible = true;
                    child.layers.set(0);
                }
            });
        } catch (error) {
            console.error('Error loading gun:', error);
            // Silently fail - gun loading errors are not critical
        }
    }
    
    public getBulletSpawnNode(): { position: THREE.Vector3; rotation: THREE.Euler } | null {
        if (!this.characterData?.bulletSpawnNode) {
            return null;
        }
        
        // Calculate world position and rotation of bullet spawn node
        const spawnData = this.characterData.bulletSpawnNode;
        
        // Helper function to find part recursively
        const findPart = (obj: THREE.Object3D, id: string): THREE.Object3D | undefined => {
            if (obj.userData?.id === id) {
                return obj;
            }
            for (const child of obj.children) {
                const found = findPart(child, id);
                if (found) return found;
            }
            return undefined;
        };
        
        // Check if bullet spawn node has a parentId (it might be relative to gun, hand, or character)
        if (spawnData.parentId) {
            let parentPart = findPart(this.mesh, spawnData.parentId);
            
            // If parent is the gun, find the gun
            if (!parentPart && spawnData.parentId !== 'character' && spawnData.parentId !== 'scene') {
                // Try to find gun if parentId refers to gun
                if (this.gun && this.gun.parent) {
                    const gunParent = this.gun.parent;
                    if (gunParent.userData?.id === spawnData.parentId) {
                        parentPart = gunParent as THREE.Mesh;
                    }
                }
            }
            
            if (parentPart) {
                // Position is relative to parent part
                const localPos = new THREE.Vector3(
                    spawnData.position.x,
                    spawnData.position.y,
                    spawnData.position.z
                );
                const worldPos = new THREE.Vector3();
                parentPart.localToWorld(worldPos.copy(localPos));
                
                // Calculate world rotation
                const parentQuat = new THREE.Quaternion();
                parentPart.getWorldQuaternion(parentQuat);
                const spawnQuat = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(spawnData.rotation.x, spawnData.rotation.y, spawnData.rotation.z)
                );
                const finalQuat = parentQuat.multiply(spawnQuat);
                const finalWorldRot = new THREE.Euler().setFromQuaternion(finalQuat);
                
                return { position: worldPos, rotation: finalWorldRot };
            }
        }
        
        // Default: position is relative to character mesh (local space)
        // This matches how CharacterBuilder exports it when bullet spawn node is a child of character
        const localPos = new THREE.Vector3(
            spawnData.position.x,
            spawnData.position.y,
            spawnData.position.z
        );
        const worldPos = new THREE.Vector3();
        this.mesh.localToWorld(worldPos.copy(localPos));
        
        // Calculate world rotation
        const characterQuat = new THREE.Quaternion();
        this.mesh.getWorldQuaternion(characterQuat);
        const spawnQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(spawnData.rotation.x, spawnData.rotation.y, spawnData.rotation.z)
        );
        const finalQuat = characterQuat.multiply(spawnQuat);
        const finalRot = new THREE.Euler().setFromQuaternion(finalQuat);
        
        return { position: worldPos, rotation: finalRot };
    }
    
    private getGunBoundingBox(): THREE.Box3 | null {
        if (!this.gun) return null;
        const box = new THREE.Box3();
        box.setFromObject(this.gun);
        return box;
    }
    
    public getMesh(): THREE.Group {
        return this.mesh;
    }
    
    public dispose(): void {
        // Remove gun if attached to camera
        if (this.gun && this.camera.children.includes(this.gun)) {
            this.camera.remove(this.gun);
        }
        // Remove gun if attached to hand
        if (this.gun && this.rightHand && this.rightHand.children.includes(this.gun)) {
            this.rightHand.remove(this.gun);
        }
        
        if (this.camera.children.includes(this.mesh)) {
            this.camera.remove(this.mesh);
        }
        if (this.scene.children.includes(this.mesh)) {
            this.scene.remove(this.mesh);
        }
        // Three.js will handle cleanup when scene is disposed
    }
}
