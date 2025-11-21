import * as THREE from 'three';
import { TouchController, TouchInput } from './TouchController';

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
    
    // Touch controller (optional, for mobile)
    private touchController: TouchController | null = null;
    private isMobile: boolean = false;
    
    // Player position
    private position: THREE.Vector3;
    private height: number = 1.6; // Eye height
    
    // Camera mode
    private isThirdPerson: boolean = false;
    private thirdPersonDistance: number = 5.0; // Distance behind character
    private thirdPersonHeight: number = 2.5; // Height above character
    private cameraRotationX: number = -0.3; // Look down angle in third person

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement, touchController?: TouchController | null) {
        this.camera = camera;
        this.domElement = domElement;
        this.velocity = new THREE.Vector3();
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.position = new THREE.Vector3(0, this.height, 0);
        this.touchController = touchController || null;
        this.isMobile = touchController !== null && touchController !== undefined;
        
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Only setup desktop controls if not on mobile
        if (!this.isMobile) {
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
        }

        // Keyboard (works on both desktop and mobile if physical keyboard available)
        document.addEventListener('keydown', (e) => {
            // Skip keyboard input on mobile to avoid conflicts
            if (this.isMobile) return;
            
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
            if (this.isMobile) return;
            
            this.keys[e.code] = false;
            if (e.code === 'KeyV') {
                this.vKeyJustPressed = false;
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

        // Handle touch input for camera rotation (mobile)
        if (this.isMobile && this.touchController) {
            const touchInput = this.touchController.getInput();
            
            // Apply camera rotation from touch
            if (touchInput.cameraDeltaX !== 0 || touchInput.cameraDeltaY !== 0) {
                if (this.isThirdPerson) {
                    // In third-person, rotate camera around character
                    this.euler.y -= touchInput.cameraDeltaX;
                    this.cameraRotationX -= touchInput.cameraDeltaY;
                    // Clamp vertical rotation
                    this.cameraRotationX = Math.max(-Math.PI / 2, Math.min(0.5, this.cameraRotationX));
                } else {
                    // In first-person, rotate camera directly
                    this.euler.setFromQuaternion(this.camera.quaternion);
                    this.euler.y -= touchInput.cameraDeltaX;
                    this.euler.x -= touchInput.cameraDeltaY;
                    // Clamp vertical rotation
                    this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
                    this.camera.quaternion.setFromEuler(this.euler);
                }
            }
        }

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
        let speed = this.moveSpeed;
        if (this.isMobile && this.touchController) {
            const touchInput = this.touchController.getInput();
            speed = touchInput.sprint ? this.moveSpeed * this.sprintMultiplier : this.moveSpeed;
        } else {
            speed = this.keys['ShiftLeft'] || this.keys['ShiftRight'] 
                ? this.moveSpeed * this.sprintMultiplier 
                : this.moveSpeed;
        }

        // Movement input - use touch on mobile, keyboard on desktop
        if (this.isMobile && this.touchController) {
            const touchInput = this.touchController.getInput();
            if (touchInput.moveX !== 0 || touchInput.moveZ !== 0) {
                // Apply movement from joystick
                this.velocity.add(right.multiplyScalar(touchInput.moveX * speed));
                this.velocity.add(forward.multiplyScalar(touchInput.moveZ * speed));
            }
        } else {
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
        }

        // Normalize velocity if moving diagonally
        if (this.velocity.length() > speed) {
            this.velocity.normalize().multiplyScalar(speed);
        }

        // Update position
        this.position.x += this.velocity.x * deltaSeconds;
        this.position.z += this.velocity.z * deltaSeconds;

        // Keep player at ground level (you can add terrain height checks later)
        this.position.y = this.height;

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
            // First-person: camera at eye height
            this.camera.position.copy(this.position);
            // Camera rotation is handled in onMouseMove for first-person
        }
    }

    public getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public setPosition(x: number, y: number, z: number): void {
        this.position.set(x, y, z);
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
    
    public setTouchController(touchController: TouchController | null): void {
        this.touchController = touchController;
        this.isMobile = touchController !== null;
    }
}

