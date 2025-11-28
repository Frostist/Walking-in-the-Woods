import * as THREE from 'three';
import { BlockManager } from './BlockManager';
import { VRControllerManager, ControllerState } from './VRControllerManager';

export class VRPlayerController {
    private position: THREE.Vector3;
    private height: number = 1.6; // Eye height
    private playerHeight: number = 1.8; // Total player height for collision
    private playerRadius: number = 0.3; // Player collision radius
    
    // Movement
    private velocity: THREE.Vector3;
    private moveSpeed: number = 5.0;
    private sprintMultiplier: number = 1.5;
    
    // Jump and gravity
    private verticalVelocity: number = 0;
    private gravity: number = -20.0;
    private jumpHeight: number = 1.15;
    private jumpSpeed: number = Math.sqrt(2 * Math.abs(this.gravity) * this.jumpHeight);
    private isGrounded: boolean = false;
    private groundCheckDistance: number = 0.1;
    
    // Block manager reference for collision
    private blockManager: BlockManager | null = null;
    
    // VR specific
    private controllerManager: VRControllerManager;
    private referenceSpace: XRReferenceSpace | null = null;
    private rotationY: number = 0; // Y rotation for character (head tracking handles camera)
    
    // Controls enabled flag
    private controlsEnabled: boolean = false;
    private lastJumpPress: boolean = false;

    constructor(controllerManager: VRControllerManager) {
        this.controllerManager = controllerManager;
        this.velocity = new THREE.Vector3();
        this.position = new THREE.Vector3(0, this.height, 0);
    }
    
    public setBlockManager(blockManager: BlockManager): void {
        this.blockManager = blockManager;
    }

    public setReferenceSpace(referenceSpace: XRReferenceSpace): void {
        this.referenceSpace = referenceSpace;
    }

    public enableControls(): void {
        this.controlsEnabled = true;
    }
    
    public disableControls(): void {
        this.controlsEnabled = false;
        this.velocity.set(0, 0, 0);
    }
    
    public update(deltaTime: number, xrFrame?: XRFrame): void {
        if (!this.controlsEnabled) {
            return;
        }

        // Update position from XR reference space if available
        if (xrFrame && this.referenceSpace) {
            const pose = xrFrame.getViewerPose(this.referenceSpace);
            if (pose) {
                // Update position based on XR head position
                // Note: In VR, the camera position is managed by WebXR, but we track the player's ground position
                const headPosition = new THREE.Vector3(
                    pose.transform.position.x,
                    pose.transform.position.y,
                    pose.transform.position.z
                );
                
                // Extract Y rotation from head orientation for character rotation
                const headQuat = new THREE.Quaternion(
                    pose.transform.orientation.x,
                    pose.transform.orientation.y,
                    pose.transform.orientation.z,
                    pose.transform.orientation.w
                );
                const euler = new THREE.Euler().setFromQuaternion(headQuat);
                this.rotationY = euler.y;
                
                // Update horizontal position from head (but keep our own Y for physics)
                this.position.x = headPosition.x;
                this.position.z = headPosition.z;
                // Keep our own Y position for physics (gravity, jumping, etc.)
            }
        }

        // Convert deltaTime from milliseconds to seconds
        const deltaSeconds = deltaTime / 1000;

        // Reset velocity
        this.velocity.x = 0;
        this.velocity.z = 0;

        // Get controller states
        const leftState = this.controllerManager.getLeftControllerState();
        const rightState = this.controllerManager.getRightControllerState();

        // Movement from left thumbstick
        const thumbstickX = leftState.thumbstick.x;
        const thumbstickY = leftState.thumbstick.y;
        
        // Calculate movement direction based on head rotation
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        
        // Forward is based on head rotation (rotationY)
        forward.set(
            Math.sin(this.rotationY),
            0,
            Math.cos(this.rotationY)
        ).normalize();
        
        right.set(
            Math.cos(this.rotationY),
            0,
            -Math.sin(this.rotationY)
        ).normalize();

        // Check sprint (right thumbstick pressed down or grip)
        const speed = (rightState.grip || Math.abs(rightState.thumbstick.y) > 0.8)
            ? this.moveSpeed * this.sprintMultiplier 
            : this.moveSpeed;

        // Apply thumbstick input
        if (Math.abs(thumbstickX) > 0.1 || Math.abs(thumbstickY) > 0.1) {
            const moveForward = forward.multiplyScalar(thumbstickY * speed);
            const moveRight = right.multiplyScalar(thumbstickX * speed);
            this.velocity.add(moveForward);
            this.velocity.add(moveRight);
        }

        // Normalize velocity if moving diagonally
        if (this.velocity.length() > speed) {
            this.velocity.normalize().multiplyScalar(speed);
        }

        // Handle jump (A button on right controller)
        const jumpPressed = rightState.buttonA;
        if (jumpPressed && !this.lastJumpPress && this.isGrounded) {
            this.verticalVelocity = this.jumpSpeed;
            this.isGrounded = false;
        }
        this.lastJumpPress = jumpPressed;

        // Apply gravity
        this.verticalVelocity += this.gravity * deltaSeconds;
        
        // Calculate new position
        const newPosition = this.position.clone();
        newPosition.x += this.velocity.x * deltaSeconds;
        newPosition.z += this.velocity.z * deltaSeconds;
        newPosition.y += this.verticalVelocity * deltaSeconds;
        
        // Check collision with blocks
        const finalPosition = this.checkBlockCollision(newPosition);
        
        // Check if landing on top of a block
        const landingPosition = this.checkLandingOnBlock(finalPosition);
        
        // Update position
        this.position.copy(landingPosition);
        
        // Check if grounded
        this.checkGrounded();
        
        // If falling and not grounded, find the ground/block surface below
        if (this.verticalVelocity <= 0 && !this.isGrounded) {
            const groundY = this.findGroundBelow(this.position);
            if (groundY !== null) {
                const playerBottom = this.position.y - this.height;
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
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public setPosition(x: number, y: number, z: number): void {
        this.position.set(x, y, z);
        this.verticalVelocity = 0;
        this.isGrounded = true;
    }
    
    public isMoving(): boolean {
        return this.velocity.length() > 0.1;
    }
    
    public getCurrentMoveSpeed(): number {
        return this.velocity.length();
    }
    
    public getRotationY(): number {
        return this.rotationY;
    }
    
    public isThirdPersonMode(): boolean {
        return false; // VR is always first-person
    }

    // Copy collision detection methods from PlayerController
    private checkBlockCollision(newPosition: THREE.Vector3): THREE.Vector3 {
        if (!this.blockManager) {
            return newPosition;
        }
        
        const blockSize = 1.0;
        const playerBottom = newPosition.y - this.height;
        const playerTop = newPosition.y + (this.playerHeight - this.height);
        
        const checkRadius = this.playerRadius + blockSize * 0.6;
        const minX = Math.floor((newPosition.x - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxX = Math.ceil((newPosition.x + checkRadius) / blockSize) * blockSize + blockSize / 2;
        const minZ = Math.floor((newPosition.z - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxZ = Math.ceil((newPosition.z + checkRadius) / blockSize) * blockSize + blockSize / 2;
        
        let finalPosition = newPosition.clone();
        
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                const checkMinY = Math.floor((playerBottom - blockSize) / blockSize) * blockSize + blockSize / 2;
                const checkMaxY = Math.ceil((playerTop + blockSize) / blockSize) * blockSize + blockSize / 2;
                
                for (let y = checkMinY; y <= checkMaxY; y += blockSize) {
                    if (this.blockManager!.hasBlock(x, y, z)) {
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
                        
                        if (playerMax.x > blockMin.x && playerMin.x < blockMax.x &&
                            playerMax.y > blockMin.y && playerMin.y < blockMax.y &&
                            playerMax.z > blockMin.z && playerMin.z < blockMax.z) {
                            
                            const overlapX = Math.min(playerMax.x - blockMin.x, blockMax.x - playerMin.x);
                            const overlapZ = Math.min(playerMax.z - blockMin.z, blockMax.z - playerMin.z);
                            const overlapY = Math.min(playerMax.y - blockMin.y, blockMax.y - playerMin.y);
                            
                            if (overlapY < overlapX && overlapY < overlapZ) {
                                if (this.verticalVelocity > 0 && playerTop > blockMin.y && playerBottom < blockMin.y) {
                                    finalPosition.y = blockMin.y - (this.playerHeight - this.height);
                                    this.verticalVelocity = 0;
                                } else if (this.verticalVelocity <= 0 && playerBottom < blockMax.y && playerTop > blockMax.y) {
                                    finalPosition.y = blockMax.y + this.height;
                                    this.verticalVelocity = 0;
                                    this.isGrounded = true;
                                }
                            } else if (overlapX < overlapZ) {
                                if (finalPosition.x > x) {
                                    finalPosition.x = blockMax.x + this.playerRadius;
                                } else {
                                    finalPosition.x = blockMin.x - this.playerRadius;
                                }
                            } else {
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
    
    private checkLandingOnBlock(position: THREE.Vector3): THREE.Vector3 {
        if (!this.blockManager) {
            return position;
        }
        
        const blockSize = 1.0;
        const playerBottom = position.y - this.height;
        const checkRadius = this.playerRadius;
        const minX = Math.floor((position.x - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxX = Math.ceil((position.x + checkRadius) / blockSize) * blockSize + blockSize / 2;
        const minZ = Math.floor((position.z - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxZ = Math.ceil((position.z + checkRadius) / blockSize) * blockSize + blockSize / 2;
        
        let highestBlockTop = -Infinity;
        let foundBlock = false;
        
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                const checkMaxY = Math.ceil((playerBottom + 0.3) / blockSize) * blockSize + blockSize / 2;
                for (let y = blockSize / 2; y <= checkMaxY; y += blockSize) {
                    if (this.blockManager.hasBlock(x, y, z)) {
                        const blockTop = y + blockSize / 2;
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
        
        if (foundBlock && highestBlockTop !== -Infinity && this.verticalVelocity <= 0) {
            const distanceToBlock = playerBottom - highestBlockTop;
            if (distanceToBlock <= 0.3 && distanceToBlock >= -0.3) {
                const newY = highestBlockTop + this.height;
                this.verticalVelocity = 0;
                this.isGrounded = true;
                return new THREE.Vector3(position.x, newY, position.z);
            }
        }
        
        return position;
    }
    
    private findGroundBelow(position: THREE.Vector3): number | null {
        if (!this.blockManager) {
            return 0;
        }
        
        const blockSize = 1.0;
        const playerBottom = position.y - this.height;
        const checkRadius = this.playerRadius;
        const minX = Math.floor((position.x - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxX = Math.ceil((position.x + checkRadius) / blockSize) * blockSize + blockSize / 2;
        const minZ = Math.floor((position.z - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxZ = Math.ceil((position.z + checkRadius) / blockSize) * blockSize + blockSize / 2;
        
        let highestSurface = 0;
        let foundSurface = false;
        
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                const checkMaxY = Math.ceil(playerBottom / blockSize) * blockSize + blockSize / 2 + blockSize;
                for (let y = blockSize / 2; y <= checkMaxY; y += blockSize) {
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
        
        return foundSurface ? highestSurface : 0;
    }
    
    private checkGrounded(): void {
        if (!this.blockManager) {
            this.isGrounded = Math.abs(this.position.y - this.height) < 0.1;
            return;
        }
        
        const blockSize = 1.0;
        const playerBottom = this.position.y - this.height;
        
        if (this.verticalVelocity > 0) {
            this.isGrounded = false;
            return;
        }
        
        const checkRadius = this.playerRadius + 0.1;
        const minX = Math.floor((this.position.x - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxX = Math.ceil((this.position.x + checkRadius) / blockSize) * blockSize + blockSize / 2;
        const minZ = Math.floor((this.position.z - checkRadius) / blockSize) * blockSize + blockSize / 2;
        const maxZ = Math.ceil((this.position.z + checkRadius) / blockSize) * blockSize + blockSize / 2;
        
        let foundGround = false;
        let groundY = 0;
        
        for (let x = minX; x <= maxX; x += blockSize) {
            for (let z = minZ; z <= maxZ; z += blockSize) {
                const checkMaxY = Math.ceil((playerBottom + this.groundCheckDistance) / blockSize) * blockSize + blockSize / 2;
                for (let y = blockSize / 2; y <= checkMaxY; y += blockSize) {
                    if (this.blockManager.hasBlock(x, y, z)) {
                        const blockTop = y + blockSize / 2;
                        const distanceToBlock = playerBottom - blockTop;
                        
                        if (Math.abs(distanceToBlock) <= this.groundCheckDistance) {
                            this.isGrounded = true;
                            if (blockTop > groundY) {
                                groundY = blockTop;
                            }
                            foundGround = true;
                        } else if (blockTop > groundY && blockTop <= playerBottom + this.groundCheckDistance) {
                            groundY = blockTop;
                        }
                    }
                }
            }
        }
        
        const distanceToGround = playerBottom - groundY;
        if (distanceToGround >= -this.groundCheckDistance && distanceToGround <= this.groundCheckDistance) {
            foundGround = true;
            if (Math.abs(distanceToGround) < 0.05 && this.verticalVelocity <= 0) {
                this.position.y = groundY + this.height;
            }
        }
        
        if (!foundGround && Math.abs(playerBottom) < this.groundCheckDistance) {
            foundGround = true;
        }
        
        this.isGrounded = foundGround;
        
        if (this.isGrounded && this.verticalVelocity < 0) {
            this.verticalVelocity = 0;
        }
    }
}

