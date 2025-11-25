import * as THREE from 'three';
import { BlockManager } from './BlockManager';

export class PlayerController {
    private camera: THREE.PerspectiveCamera;
    private domElement: HTMLElement;
    private velocity: THREE.Vector3;
    private moveSpeed: number = 5.0;
    private sprintMultiplier: number = 1.5;
    
    // Mouse look
    private euler: THREE.Euler;
    private isPointerLocked: boolean = false;
    private sensitivity: number = 0.002;
    
    // Keyboard state
    private keys: { [key: string]: boolean } = {};
    private vKeyJustPressed: boolean = false;
    
    // Player position
    private position: THREE.Vector3;
    private height: number = 1.6; // Eye height
    private playerHeight: number = 1.8; // Total player height for collision
    private playerRadius: number = 0.3; // Player collision radius
    
    // Jump and gravity
    private verticalVelocity: number = 0;
    private gravity: number = -20.0; // Gravity acceleration
    private jumpSpeed: number = 7.0; // Initial jump velocity
    private isGrounded: boolean = false;
    private groundCheckDistance: number = 0.1; // Distance to check for ground
    
    // Block manager reference for collision
    private blockManager: BlockManager | null = null;
    
    // Camera mode
    private isThirdPerson: boolean = false;
    private thirdPersonDistance: number = 5.0; // Distance behind character
    private thirdPersonHeight: number = 2.5; // Height above character
    private cameraRotationX: number = -0.3; // Look down angle in third person
    
    // Controls enabled flag
    private controlsEnabled: boolean = false;

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.velocity = new THREE.Vector3();
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.position = new THREE.Vector3(0, this.height, 0);
        
        this.setupEventListeners();
    }
    
    public setBlockManager(blockManager: BlockManager): void {
        this.blockManager = blockManager;
    }

    private setupEventListeners(): void {
        // Pointer lock for mouse look
        this.domElement.addEventListener('click', () => {
            if (!this.controlsEnabled) return;
            if (!this.isPointerLocked) {
                this.domElement.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement === this.domElement;
        });

        // Mouse movement
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!this.controlsEnabled) return;
            
            this.keys[e.code] = true;
            
            // Toggle camera mode with 'V' key (only once per press)
            if (e.code === 'KeyV' && !this.vKeyJustPressed) {
                this.vKeyJustPressed = true;
                this.isThirdPerson = !this.isThirdPerson;
                // Release pointer lock when switching modes
                if (this.isPointerLocked) {
                    document.exitPointerLock();
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (!this.controlsEnabled) return;
            
            this.keys[e.code] = false;
            if (e.code === 'KeyV') {
                this.vKeyJustPressed = false;
            }
        });
        
        // Jump with Space key
        document.addEventListener('keydown', (e) => {
            if (!this.controlsEnabled) return;
            
            if (e.code === 'Space' && this.isGrounded) {
                e.preventDefault();
                this.verticalVelocity = this.jumpSpeed;
                this.isGrounded = false;
            }
        });
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.controlsEnabled || !this.isPointerLocked) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        if (this.isThirdPerson) {
            // In third-person, rotate camera around character
            this.euler.y -= movementX * this.sensitivity;
            this.cameraRotationX -= movementY * this.sensitivity;
            // Clamp vertical rotation
            this.cameraRotationX = Math.max(-Math.PI / 2, Math.min(0.5, this.cameraRotationX));
        } else {
            // In first-person, rotate camera directly
            this.euler.setFromQuaternion(this.camera.quaternion);
            this.euler.y -= movementX * this.sensitivity;
            this.euler.x -= movementY * this.sensitivity;
            // Clamp vertical rotation
            this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
        }
    }

    public enableControls(): void {
        this.controlsEnabled = true;
    }
    
    public disableControls(): void {
        this.controlsEnabled = false;
        // Clear all key states when disabling
        this.keys = {};
    }
    
    public update(deltaTime: number): void {
        // Don't update if controls are disabled
        if (!this.controlsEnabled) {
            // Still update camera position to prevent issues
            this.camera.position.copy(this.position);
            return;
        }
        
        // Convert deltaTime from milliseconds to seconds
        const deltaSeconds = deltaTime / 1000;

        // Reset velocity
        this.velocity.x = 0;
        this.velocity.z = 0;

        // Get camera forward and right vectors
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        forward.y = 0; // Keep movement horizontal
        forward.normalize();

        // Check sprint
        const speed = this.keys['ShiftLeft'] || this.keys['ShiftRight'] 
            ? this.moveSpeed * this.sprintMultiplier 
            : this.moveSpeed;

        // Desktop keyboard controls
        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
            this.velocity.add(forward.multiplyScalar(speed));
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown']) {
            this.velocity.add(forward.multiplyScalar(-speed));
        }
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
            this.velocity.add(right.multiplyScalar(-speed));
        }
        if (this.keys['KeyD'] || this.keys['ArrowRight']) {
            this.velocity.add(right.multiplyScalar(speed));
        }

        // Normalize velocity if moving diagonally
        if (this.velocity.length() > speed) {
            this.velocity.normalize().multiplyScalar(speed);
        }

        // Apply gravity
        this.verticalVelocity += this.gravity * deltaSeconds;
        
        // Calculate new position
        const newPosition = this.position.clone();
        newPosition.x += this.velocity.x * deltaSeconds;
        newPosition.z += this.velocity.z * deltaSeconds;
        newPosition.y += this.verticalVelocity * deltaSeconds;
        
        // Check collision with blocks
        const finalPosition = this.checkBlockCollision(newPosition);
        
        // Check if landing on top of a block (even when jumping up)
        const landingPosition = this.checkLandingOnBlock(finalPosition);
        
        // Update position
        this.position.copy(landingPosition);
        
        // Check if grounded (on ground or on top of a block)
        this.checkGrounded();
        
        // If falling and not grounded, find the ground/block surface below and snap feet to it
        if (this.verticalVelocity <= 0 && !this.isGrounded) {
            const groundY = this.findGroundBelow(this.position);
            if (groundY !== null) {
                const playerBottom = this.position.y - this.height;
                // If player's feet are below or close to the ground, snap to it
                if (playerBottom <= groundY + 0.1) {
                    this.position.y = groundY + this.height;
                    this.verticalVelocity = 0;
                    this.isGrounded = true;
                }
            }
        }
        
        // Clamp Y position to prevent falling through world
        if (this.position.y < this.height) {
            this.position.y = this.height;
            this.verticalVelocity = 0;
            this.isGrounded = true;
        }

        // Update camera position based on mode
        if (this.isThirdPerson) {
            // Third-person: position camera behind and above character
            const cameraOffset = new THREE.Vector3(
                Math.sin(this.euler.y) * this.thirdPersonDistance,
                this.thirdPersonHeight,
                Math.cos(this.euler.y) * this.thirdPersonDistance
            );
            this.camera.position.copy(this.position).add(cameraOffset);
            
            // Look at character position (slightly above ground)
            const lookAtTarget = this.position.clone();
            lookAtTarget.y += 0.8; // Look at character's chest/head area
            this.camera.lookAt(lookAtTarget);
        } else {
            // First-person: camera at eye height (position.y already includes height offset)
            this.camera.position.copy(this.position);
            // Camera rotation is handled in onMouseMove for first-person
        }
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public setPosition(x: number, y: number, z: number): void {
        this.position.set(x, y, z);
        this.verticalVelocity = 0; // Reset vertical velocity when respawning
        this.isGrounded = true; // Assume grounded when respawning
        this.camera.position.copy(this.position);
    }
    
    public isMoving(): boolean {
        return this.velocity.length() > 0.1;
    }
    
    public getCurrentMoveSpeed(): number {
        return this.velocity.length();
    }
    
    public getRotationY(): number {
        return this.euler.y;
    }
    
    public isThirdPersonMode(): boolean {
        return this.isThirdPerson;
    }
    
    public toggleCameraMode(): void {
        this.isThirdPerson = !this.isThirdPerson;
        if (this.isPointerLocked) {
            document.exitPointerLock();
        }
    }
    
    /**
     * Check collision with blocks and adjust position
     */
    private checkBlockCollision(newPosition: THREE.Vector3): THREE.Vector3 {
        if (!this.blockManager) {
            return newPosition;
        }
        
        const blockSize = 1.0; // Match BlockManager block size
        const playerBottom = newPosition.y - this.height;
        const playerTop = newPosition.y + (this.playerHeight - this.height);
        
        // Check blocks in a small area around the player
        const checkRadius = this.playerRadius + blockSize * 0.6;
        const minX = Math.floor((newPosition.x - checkRadius) / blockSize) * blockSize;
        const maxX = Math.ceil((newPosition.x + checkRadius) / blockSize) * blockSize;
        const minZ = Math.floor((newPosition.z - checkRadius) / blockSize) * blockSize;
        const maxZ = Math.ceil((newPosition.z + checkRadius) / blockSize) * blockSize;
        
        let finalPosition = newPosition.clone();
        
        // Check all blocks in the area
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                // Check multiple Y levels (player can be at different heights)
                for (let y = Math.floor(playerBottom / blockSize) * blockSize; 
                     y <= Math.ceil(playerTop / blockSize) * blockSize; 
                     y += blockSize) {
                    
                    if (this.blockManager.hasBlock(x, y, z)) {
                        // Block center is at (x, y, z), so bounds are:
                        const blockMin = new THREE.Vector3(x - blockSize/2, y - blockSize/2, z - blockSize/2);
                        const blockMax = new THREE.Vector3(x + blockSize/2, y + blockSize/2, z + blockSize/2);
                        
                        const playerMin = new THREE.Vector3(
                            finalPosition.x - this.playerRadius,
                            playerBottom,
                            finalPosition.z - this.playerRadius
                        );
                        const playerMax = new THREE.Vector3(
                            finalPosition.x + this.playerRadius,
                            playerTop,
                            finalPosition.z + this.playerRadius
                        );
                        
                        // Check if player collides with block
                        if (playerMax.x > blockMin.x && playerMin.x < blockMax.x &&
                            playerMax.y > blockMin.y && playerMin.y < blockMax.y &&
                            playerMax.z > blockMin.z && playerMin.z < blockMax.z) {
                            
                            // Handle collision - push player out
                            const overlapX = Math.min(
                                playerMax.x - blockMin.x,
                                blockMax.x - playerMin.x
                            );
                            const overlapZ = Math.min(
                                playerMax.z - blockMin.z,
                                blockMax.z - playerMin.z
                            );
                            const overlapY = Math.min(
                                playerMax.y - blockMin.y,
                                blockMax.y - playerMin.y
                            );
                            
                            // Push out in the direction of smallest overlap
                            if (overlapY < overlapX && overlapY < overlapZ) {
                                // Vertical collision - standing on block or hitting head
                                // Check if landing on top of block (feet at or just above block surface)
                                if (playerBottom <= blockMax.y + 0.15 && playerBottom >= blockMax.y - 0.2) {
                                    // Landing on top of block - ensure feet are exactly on block surface
                                    finalPosition.y = blockMax.y + this.height;
                                    // Stop vertical velocity and mark as grounded when landing
                                    // Allow landing even when jumping up if feet are close to block surface
                                    if (this.verticalVelocity <= 0 || playerBottom <= blockMax.y + 0.1) {
                                        this.verticalVelocity = 0;
                                        this.isGrounded = true;
                                    }
                                } else if (this.verticalVelocity > 0 && playerTop > blockMin.y) {
                                    // Hitting head on block
                                    finalPosition.y = blockMin.y - (this.playerHeight - this.height);
                                    this.verticalVelocity = 0;
                                }
                            } else if (overlapX < overlapZ) {
                                // Push out horizontally in X direction
                                if (finalPosition.x > x) {
                                    finalPosition.x = blockMax.x + this.playerRadius;
                                } else {
                                    finalPosition.x = blockMin.x - this.playerRadius;
                                }
                            } else {
                                // Push out horizontally in Z direction
                                if (finalPosition.z > z) {
                                    finalPosition.z = blockMax.z + this.playerRadius;
                                } else {
                                    finalPosition.z = blockMin.z - this.playerRadius;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        return finalPosition;
    }
    
    /**
     * Check if player is landing on top of a block and adjust position accordingly
     * This handles the case when jumping onto blocks
     */
    private checkLandingOnBlock(position: THREE.Vector3): THREE.Vector3 {
        if (!this.blockManager) {
            return position;
        }
        
        const blockSize = 1.0;
        const playerBottom = position.y - this.height;
        const checkRadius = this.playerRadius;
        const minX = Math.floor((position.x - checkRadius) / blockSize) * blockSize;
        const maxX = Math.ceil((position.x + checkRadius) / blockSize) * blockSize;
        const minZ = Math.floor((position.z - checkRadius) / blockSize) * blockSize;
        const maxZ = Math.ceil((position.z + checkRadius) / blockSize) * blockSize;
        
        let highestBlockTop = -Infinity;
        let foundBlock = false;
        
        // Check all blocks in the area around the player
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                // Check blocks from ground level up to slightly above player's feet
                for (let y = 0; y <= Math.ceil((playerBottom + 0.3) / blockSize) * blockSize; y += blockSize) {
                    if (this.blockManager.hasBlock(x, y, z)) {
                        const blockTop = y + blockSize / 2;
                        // Check if player's feet are at or just above this block's top surface
                        if (blockTop > highestBlockTop &&
                            blockTop <= playerBottom + 0.3 &&
                            blockTop >= playerBottom - 0.3) {
                            highestBlockTop = blockTop;
                            foundBlock = true;
                        }
                    }
                }
            }
        }
        
        // If we found a block the player is landing on, snap feet to it
        if (foundBlock && highestBlockTop !== -Infinity) {
            // Calculate distance from player's feet to block top
            const distanceToBlock = playerBottom - highestBlockTop;
            
            // If player's feet are close to or on the block surface, snap to it
            // This handles both landing from a jump and standing on a block
            if (distanceToBlock <= 0.3 && distanceToBlock >= -0.3) {
                // Snap player's feet to block surface
                const newY = highestBlockTop + this.height;
                
                // If falling, always snap to block
                // If jumping up but feet are at or just above block, also snap (landing case)
                // Allow landing within 0.3 units above block for reliable staircase climbing
                const shouldSnap = this.verticalVelocity <= 0 ||
                                  (distanceToBlock >= -0.15 && distanceToBlock <= 0.3);

                if (shouldSnap) {
                    // When we snap position, always stop upward velocity and mark as grounded
                    // This ensures reliable landing when jumping up onto blocks
                    if (distanceToBlock <= 0.3) {
                        this.verticalVelocity = Math.min(0, this.verticalVelocity);
                        this.isGrounded = true;
                    }
                    return new THREE.Vector3(position.x, newY, position.z);
                }
            }
        }
        
        return position;
    }
    
    /**
     * Find the highest ground or block surface below the player
     * Returns the Y coordinate of the surface, or null if no surface found
     */
    private findGroundBelow(position: THREE.Vector3): number | null {
        if (!this.blockManager) {
            // No block manager, ground is at y=0
            return 0;
        }
        
        const blockSize = 1.0;
        const playerBottom = position.y - this.height;
        const checkRadius = this.playerRadius;
        const minX = Math.floor((position.x - checkRadius) / blockSize) * blockSize;
        const maxX = Math.ceil((position.x + checkRadius) / blockSize) * blockSize;
        const minZ = Math.floor((position.z - checkRadius) / blockSize) * blockSize;
        const maxZ = Math.ceil((position.z + checkRadius) / blockSize) * blockSize;
        
        let highestSurface = 0; // Ground level is at y=0
        let foundSurface = false;
        
        // Check all blocks below the player
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                // Check blocks from ground level up to player's current position
                for (let y = 0; y <= Math.ceil(playerBottom / blockSize) * blockSize + blockSize; y += blockSize) {
                    if (this.blockManager.hasBlock(x, y, z)) {
                        const blockTop = y + blockSize / 2;
                        if (blockTop > highestSurface && blockTop <= playerBottom + 0.5) {
                            highestSurface = blockTop;
                            foundSurface = true;
                        }
                    }
                }
            }
        }
        
        return foundSurface ? highestSurface : 0; // Return ground level if no blocks found
    }
    
    /**
     * Check if player is grounded (on ground or on top of a block)
     */
    private checkGrounded(): void {
        if (!this.blockManager) {
            // Fallback: check if at ground level
            this.isGrounded = Math.abs(this.position.y - this.height) < 0.1;
            return;
        }
        
        const blockSize = 1.0;
        const playerBottom = this.position.y - this.height;
        
        // Check if there's a block or ground directly below the player
        const checkRadius = this.playerRadius;
        const minX = Math.floor((this.position.x - checkRadius) / blockSize) * blockSize;
        const maxX = Math.ceil((this.position.x + checkRadius) / blockSize) * blockSize;
        const minZ = Math.floor((this.position.z - checkRadius) / blockSize) * blockSize;
        const maxZ = Math.ceil((this.position.z + checkRadius) / blockSize) * blockSize;
        
        let foundGround = false;
        let groundY = 0; // Default to ground level
        
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                // Check blocks from ground level up to slightly above player's feet
                for (let y = 0; y <= Math.ceil((playerBottom + 0.2) / blockSize) * blockSize; y += blockSize) {
                    if (this.blockManager.hasBlock(x, y, z)) {
                        const blockTop = y + blockSize / 2;
                        if (blockTop > groundY && blockTop <= playerBottom + this.groundCheckDistance) {
                            groundY = blockTop;
                            foundGround = true;
                        }
                    }
                }
            }
        }
        
        // Check if player's feet are on or very close to the ground/block surface
        const distanceToGround = playerBottom - groundY;
        if (Math.abs(distanceToGround) <= this.groundCheckDistance) {
            foundGround = true;
            // Snap feet to ground if very close
            if (distanceToGround < 0 && Math.abs(distanceToGround) < 0.05) {
                this.position.y = groundY + this.height;
            }
        }
        
        // Also check if at ground level (y = 0)
        if (!foundGround && Math.abs(playerBottom) < this.groundCheckDistance) {
            foundGround = true;
        }
        
        this.isGrounded = foundGround;
        
        // Reset vertical velocity if grounded and falling
        if (this.isGrounded && this.verticalVelocity < 0) {
            this.verticalVelocity = 0;
        }
    }
}

