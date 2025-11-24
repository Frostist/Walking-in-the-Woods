import * as THREE from 'three';

export interface BlockData {
    x: number;
    y: number;
    z: number;
    type: string;
}

export class BlockManager {
    private scene: THREE.Scene;
    private blocks: Map<string, THREE.Mesh> = new Map();
    private blockSize: number = 1.0;
    private blockMaterials: Map<string, THREE.MeshStandardMaterial> = new Map();
    private previewBlock: THREE.Mesh | null = null;
    private canPlace: boolean = false;
    private previewPosition: THREE.Vector3 = new THREE.Vector3();
    private currentBlockType: string = 'stone';
    private availableBlockTypes: string[] = ['stone', 'dirt', 'grass', 'wood', 'sand'];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.initializeMaterials();
        this.createPreviewBlock();
    }

    private initializeMaterials(): void {
        // Create different block types with different colors
        const blockTypes = [
            { type: 'stone', color: 0x808080 },
            { type: 'dirt', color: 0x8B4513 },
            { type: 'grass', color: 0x7CB342 },
            { type: 'wood', color: 0x8D6E63 },
            { type: 'sand', color: 0xF4A460 }
        ];

        blockTypes.forEach(({ type, color }) => {
            const material = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.7,
                metalness: 0.1
            });
            this.blockMaterials.set(type, material);
        });
    }

    private createPreviewBlock(): void {
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            emissive: 0x00ff00,
            emissiveIntensity: 0.3
        });
        this.previewBlock = new THREE.Mesh(geometry, material);
        this.previewBlock.visible = false;
        this.scene.add(this.previewBlock);
    }

    /**
     * Get block key from position
     */
    private getBlockKey(x: number, y: number, z: number): string {
        // Round to nearest block position
        const blockX = Math.round(x / this.blockSize) * this.blockSize;
        const blockY = Math.round(y / this.blockSize) * this.blockSize;
        const blockZ = Math.round(z / this.blockSize) * this.blockSize;
        return `${blockX},${blockY},${blockZ}`;
    }

    /**
     * Get block position from key
     */
    private getBlockPositionFromKey(key: string): THREE.Vector3 {
        const [x, y, z] = key.split(',').map(Number);
        return new THREE.Vector3(x, y, z);
    }

    /**
     * Check if a block exists at the given position
     */
    public hasBlock(x: number, y: number, z: number): boolean {
        const key = this.getBlockKey(x, y, z);
        return this.blocks.has(key);
    }

    /**
     * Place a block at the given position
     */
    public placeBlock(x: number, y: number, z: number, type: string = 'stone'): boolean {
        const key = this.getBlockKey(x, y, z);
        
        // Check if block already exists
        if (this.blocks.has(key)) {
            return false;
        }

        // Get material for block type
        const material = this.blockMaterials.get(type) || this.blockMaterials.get('stone')!;
        
        // Create block geometry
        const geometry = new THREE.BoxGeometry(this.blockSize, this.blockSize, this.blockSize);
        const block = new THREE.Mesh(geometry, material.clone());
        
        // Position block at grid-aligned position
        const blockX = Math.round(x / this.blockSize) * this.blockSize;
        const blockY = Math.round(y / this.blockSize) * this.blockSize;
        const blockZ = Math.round(z / this.blockSize) * this.blockSize;
        
        block.position.set(blockX, blockY, blockZ);
        block.castShadow = true;
        block.receiveShadow = true;
        
        // Store block
        this.blocks.set(key, block);
        this.scene.add(block);
        
        return true;
    }

    /**
     * Remove a block at the given position
     */
    public removeBlock(x: number, y: number, z: number): boolean {
        const key = this.getBlockKey(x, y, z);
        const block = this.blocks.get(key);
        
        if (block) {
            this.scene.remove(block);
            block.geometry.dispose();
            if (block.material instanceof THREE.Material) {
                block.material.dispose();
            }
            this.blocks.delete(key);
            return true;
        }
        
        return false;
    }

    /**
     * Update preview block position based on raycast
     */
    public updatePreview(raycaster: THREE.Raycaster, camera: THREE.Camera, maxDistance: number = 10): void {
        // Raycast from camera to find where to place block
        const intersects = raycaster.intersectObjects(Array.from(this.blocks.values()), false);
        
        // Also check for ground plane
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const groundIntersect = new THREE.Vector3();
        const ray = new THREE.Ray(camera.position, raycaster.ray.direction);
        const groundIntersectionPoint = ray.intersectPlane(groundPlane, groundIntersect);
        const groundDistance = groundIntersectionPoint !== null 
            ? camera.position.distanceTo(groundIntersectionPoint) 
            : null;
        
        let targetPosition: THREE.Vector3 | null = null;
        this.canPlace = false;

        // Check if we hit a block
        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (intersect.distance <= maxDistance && intersect.face) {
                // Get the hit block's position
                const hitBlock = intersect.object as THREE.Mesh;
                const hitBlockPos = hitBlock.position.clone();
                
                // Get face normal in world space
                const normal = intersect.face.normal.clone();
                hitBlock.localToWorld(normal);
                normal.normalize();
                
                // Round normal to nearest axis-aligned direction
                const absNormal = new THREE.Vector3(
                    Math.abs(normal.x),
                    Math.abs(normal.y),
                    Math.abs(normal.z)
                );
                
                let direction = new THREE.Vector3(0, 0, 0);
                if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
                    direction.x = normal.x > 0 ? 1 : -1;
                } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                    direction.y = normal.y > 0 ? 1 : -1;
                } else {
                    direction.z = normal.z > 0 ? 1 : -1;
                }
                
                // Calculate adjacent block position
                const adjacentPos = hitBlockPos.clone().add(direction.multiplyScalar(this.blockSize));
                
                // Snap to grid
                const blockX = Math.round(adjacentPos.x / this.blockSize) * this.blockSize;
                const blockY = Math.round(adjacentPos.y / this.blockSize) * this.blockSize;
                const blockZ = Math.round(adjacentPos.z / this.blockSize) * this.blockSize;
                
                const adjacentTargetPos = new THREE.Vector3(blockX, blockY, blockZ);
                
                // Also check if we can place on top of the hit block
                const topPos = new THREE.Vector3(
                    hitBlockPos.x,
                    hitBlockPos.y + this.blockSize,
                    hitBlockPos.z
                );
                
                // Check camera direction to prefer top placement when looking down
                const cameraDirection = raycaster.ray.direction.clone().normalize();
                const isLookingDown = cameraDirection.y < -0.3; // Looking down at an angle
                
                // Prioritize placement: if looking down, prefer top; otherwise prefer adjacent
                if (isLookingDown && !this.hasBlock(topPos.x, topPos.y, topPos.z)) {
                    // Place on top of the block
                    targetPosition = topPos;
                    this.canPlace = true;
                } else if (!this.hasBlock(adjacentTargetPos.x, adjacentTargetPos.y, adjacentTargetPos.z)) {
                    // Place adjacent to the hit face
                    targetPosition = adjacentTargetPos;
                    this.canPlace = true;
                } else if (!this.hasBlock(topPos.x, topPos.y, topPos.z)) {
                    // Adjacent position is blocked, try placing on top instead
                    targetPosition = topPos;
                    this.canPlace = true;
                } else {
                    // Both positions are blocked
                    targetPosition = adjacentTargetPos;
                    this.canPlace = false;
                }
            }
        } else if (groundDistance !== null && groundDistance <= maxDistance) {
            // Place block on ground - blocks are centered, so y=0.5 means bottom at y=0
            const blockX = Math.round(groundIntersect.x / this.blockSize) * this.blockSize;
            const blockZ = Math.round(groundIntersect.z / this.blockSize) * this.blockSize;
            
            // Check if there's already a block at ground level (y=0.5)
            let blockY = 0.5; // Ground level (block center at 0.5, bottom at 0)
            
            // If there's already a block at ground level, place on top of it
            if (this.hasBlock(blockX, blockY, blockZ)) {
                // Find the highest block at this x,z position
                let highestY = blockY;
                for (let y = blockY; y < 100; y += this.blockSize) {
                    if (this.hasBlock(blockX, y, blockZ)) {
                        highestY = y;
                    } else {
                        break;
                    }
                }
                blockY = highestY + this.blockSize;
            }
            
            targetPosition = new THREE.Vector3(blockX, blockY, blockZ);
            
            // Check if position is valid
            if (!this.hasBlock(targetPosition.x, targetPosition.y, targetPosition.z)) {
                this.canPlace = true;
            }
        }

        // Update preview block
        if (this.previewBlock) {
            if (targetPosition) {
                this.previewBlock.position.copy(targetPosition);
                this.previewBlock.visible = true;
                this.previewPosition.copy(targetPosition);
                
                // Change color based on whether we can place
                if (this.previewBlock.material instanceof THREE.MeshStandardMaterial) {
                    this.previewBlock.material.color.setHex(this.canPlace ? 0x00ff00 : 0xff0000);
                }
            } else {
                this.previewBlock.visible = false;
            }
        }
    }

    /**
     * Get preview position (for placing block)
     */
    public getPreviewPosition(): THREE.Vector3 | null {
        if (this.canPlace && this.previewBlock && this.previewBlock.visible) {
            return this.previewPosition.clone();
        }
        return null;
    }

    /**
     * Place block at preview position
     */
    public placeBlockAtPreview(type?: string): BlockData | null {
        if (!this.canPlace || !this.previewBlock || !this.previewBlock.visible) {
            return null;
        }

        // Use provided type or current selected type
        const blockType = type || this.currentBlockType;
        const pos = this.previewPosition;
        if (this.placeBlock(pos.x, pos.y, pos.z, blockType)) {
            return {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                type: blockType
            };
        }
        return null;
    }

    /**
     * Set the current block type
     */
    public setBlockType(type: string): boolean {
        if (this.availableBlockTypes.includes(type)) {
            this.currentBlockType = type;
            return true;
        }
        return false;
    }

    /**
     * Get the current block type
     */
    public getBlockType(): string {
        return this.currentBlockType;
    }

    /**
     * Get all available block types
     */
    public getAvailableBlockTypes(): string[] {
        return [...this.availableBlockTypes];
    }

    /**
     * Cycle to next block type
     */
    public cycleBlockType(): string {
        const currentIndex = this.availableBlockTypes.indexOf(this.currentBlockType);
        const nextIndex = (currentIndex + 1) % this.availableBlockTypes.length;
        this.currentBlockType = this.availableBlockTypes[nextIndex];
        return this.currentBlockType;
    }

    /**
     * Get the block being targeted for breaking
     */
    public getTargetedBlock(raycaster: THREE.Raycaster, maxDistance: number = 10): THREE.Vector3 | null {
        const intersects = raycaster.intersectObjects(Array.from(this.blocks.values()), false);
        
        if (intersects.length > 0) {
            const intersect = intersects[0];
            if (intersect.distance <= maxDistance) {
                const hitBlock = intersect.object as THREE.Mesh;
                return hitBlock.position.clone();
            }
        }
        
        return null;
    }

    /**
     * Remove block at preview position (for breaking blocks)
     */
    public removeBlockAtPreview(): BlockData | null {
        if (!this.previewBlock || !this.previewBlock.visible) {
            return null;
        }

        const pos = this.previewPosition;
        if (this.removeBlock(pos.x, pos.y, pos.z)) {
            return {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                type: 'stone' // Type doesn't matter for removal
            };
        }
        return null;
    }

    /**
     * Remove block at targeted position (for breaking blocks)
     */
    public removeBlockAtTarget(raycaster: THREE.Raycaster, maxDistance: number = 10): BlockData | null {
        const targetPos = this.getTargetedBlock(raycaster, maxDistance);
        if (targetPos) {
            if (this.removeBlock(targetPos.x, targetPos.y, targetPos.z)) {
                return {
                    x: targetPos.x,
                    y: targetPos.y,
                    z: targetPos.z,
                    type: 'stone' // Type doesn't matter for removal
                };
            }
        }
        return null;
    }

    /**
     * Add block from network data
     */
    public addBlockFromNetwork(blockData: BlockData): void {
        this.placeBlock(blockData.x, blockData.y, blockData.z, blockData.type);
    }

    /**
     * Remove block from network data
     */
    public removeBlockFromNetwork(blockData: BlockData): void {
        this.removeBlock(blockData.x, blockData.y, blockData.z);
    }

    /**
     * Get all blocks for network synchronization
     */
    public getAllBlocks(): BlockData[] {
        const blockData: BlockData[] = [];
        for (const [key] of this.blocks.entries()) {
            const pos = this.getBlockPositionFromKey(key);
            // Determine type from material color (simplified - you might want to store type separately)
            const type = 'stone'; // Default type
            blockData.push({
                x: pos.x,
                y: pos.y,
                z: pos.z,
                type: type
            });
        }
        return blockData;
    }

    /**
     * Clear all blocks
     */
    public clearAllBlocks(): void {
        for (const block of this.blocks.values()) {
            this.scene.remove(block);
            block.geometry.dispose();
            if (block.material instanceof THREE.Material) {
                block.material.dispose();
            }
        }
        this.blocks.clear();
    }

    /**
     * Get all block meshes for collision detection
     */
    public getAllBlockMeshes(): THREE.Mesh[] {
        return Array.from(this.blocks.values());
    }

    /**
     * Dispose of all resources
     */
    public dispose(): void {
        this.clearAllBlocks();
        
        if (this.previewBlock) {
            this.scene.remove(this.previewBlock);
            this.previewBlock.geometry.dispose();
            if (this.previewBlock.material instanceof THREE.Material) {
                this.previewBlock.material.dispose();
            }
            this.previewBlock = null;
        }

        // Dispose materials
        for (const material of this.blockMaterials.values()) {
            material.dispose();
        }
        this.blockMaterials.clear();
    }
}

