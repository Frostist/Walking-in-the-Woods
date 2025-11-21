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
            this.keys[e.code] = false;
            if (e.code === 'KeyV') {
                this.vKeyJustPressed = false;
            }
        });
        
        // Jump with Space key
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.isGrounded) {
                e.preventDefault();
                this.verticalVelocity = this.jumpSpeed;
                this.isGrounded = false;
            }
        });
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isPointerLocked) return;

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

    public update(deltaTime: number): void {
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
        
        // Update position
        this.position.copy(finalPosition);
        
        // Check if grounded (on ground or on top of a block)
        this.checkGrounded();
        
        // Clamp Y position to prevent falling through world
        if (this.position.y < 0) {
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
                                if (this.verticalVelocity <= 0 && playerBottom < blockMax.y) {
                                    // Standing on top of block
                                    finalPosition.y = blockMax.y + this.height;
                                    this.verticalVelocity = 0;
                                    this.isGrounded = true;
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
        const checkY = Math.floor(playerBottom / blockSize) * blockSize;
        
        // Check if there's a block directly below the player
        const checkRadius = this.playerRadius;
        const minX = Math.floor((this.position.x - checkRadius) / blockSize) * blockSize;
        const maxX = Math.ceil((this.position.x + checkRadius) / blockSize) * blockSize;
        const minZ = Math.floor((this.position.z - checkRadius) / blockSize) * blockSize;
        const maxZ = Math.ceil((this.position.z + checkRadius) / blockSize) * blockSize;
        
        let foundGround = false;
        
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                // Check block at ground level
                if (this.blockManager.hasBlock(x, checkY, z)) {
                    const blockTop = checkY + blockSize / 2;
                    const distanceToBlock = playerBottom - blockTop;
                    if (distanceToBlock >= -this.groundCheckDistance && distanceToBlock <= this.groundCheckDistance) {
                        foundGround = true;
                        break;
                    }
                }
            }
            if (foundGround) break;
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

