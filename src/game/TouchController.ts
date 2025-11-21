export interface TouchInput {
    moveX: number; // -1 to 1, left/right movement
    moveZ: number; // -1 to 1, forward/backward movement
    cameraDeltaX: number; // Camera rotation delta X
    cameraDeltaY: number; // Camera rotation delta Y
    sprint: boolean; // Sprint button pressed
}

export class TouchController {
    private joystickArea: HTMLElement | null = null;
    private joystickHandle: HTMLElement | null = null;
    private cameraArea: HTMLElement | null = null;
    private sprintButton: HTMLElement | null = null;
    
    // Joystick state
    private joystickCenterX: number = 0;
    private joystickCenterY: number = 0;
    private joystickRadius: number = 60; // Radius of joystick movement
    private joystickActive: boolean = false;
    private joystickTouchId: number | null = null;
    private joystickCurrentX: number = 0;
    private joystickCurrentY: number = 0;
    
    // Camera control state
    private cameraActive: boolean = false;
    private cameraTouchId: number | null = null;
    private cameraLastX: number = 0;
    private cameraLastY: number = 0;
    private cameraDeltaX: number = 0;
    private cameraDeltaY: number = 0;
    
    // Sprint state
    private sprintPressed: boolean = false;
    
    // Sensitivity
    private cameraSensitivity: number = 0.002;

    constructor() {
        this.setupUI();
        this.setupEventListeners();
    }

    private setupUI(): void {
        // Create joystick container (left side)
        this.joystickArea = document.createElement('div');
        this.joystickArea.id = 'joystick-area';
        this.joystickArea.style.cssText = `
            position: fixed;
            left: 20px;
            bottom: 20px;
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.5);
            display: none;
            z-index: 1000;
            touch-action: none;
        `;
        
        // Create joystick handle
        this.joystickHandle = document.createElement('div');
        this.joystickHandle.id = 'joystick-handle';
        this.joystickHandle.style.cssText = `
            position: absolute;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.8);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            transition: transform 0.1s ease-out;
        `;
        this.joystickArea.appendChild(this.joystickHandle);
        
        // Create camera control area (right side)
        this.cameraArea = document.createElement('div');
        this.cameraArea.id = 'camera-area';
        this.cameraArea.style.cssText = `
            position: fixed;
            right: 0;
            top: 0;
            width: 50%;
            height: 100%;
            display: none;
            z-index: 999;
            touch-action: none;
        `;
        
        // Create sprint button
        this.sprintButton = document.createElement('div');
        this.sprintButton.id = 'sprint-button';
        this.sprintButton.innerHTML = 'SPRINT';
        this.sprintButton.style.cssText = `
            position: fixed;
            right: 20px;
            bottom: 20px;
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: rgba(0, 255, 0, 0.3);
            border: 2px solid rgba(0, 255, 0, 0.6);
            display: none;
            z-index: 1000;
            touch-action: none;
            color: white;
            font-size: 14px;
            font-weight: bold;
            align-items: center;
            justify-content: center;
            user-select: none;
        `;
        
        document.body.appendChild(this.joystickArea);
        document.body.appendChild(this.cameraArea);
        document.body.appendChild(this.sprintButton);
    }

    private setupEventListeners(): void {
        if (!this.joystickArea || !this.cameraArea || !this.sprintButton) return;

        // Joystick events
        this.joystickArea.addEventListener('touchstart', (e) => this.onJoystickStart(e), { passive: false });
        this.joystickArea.addEventListener('touchmove', (e) => this.onJoystickMove(e), { passive: false });
        this.joystickArea.addEventListener('touchend', (e) => this.onJoystickEnd(e), { passive: false });
        this.joystickArea.addEventListener('touchcancel', (e) => this.onJoystickEnd(e), { passive: false });

        // Camera area events
        this.cameraArea.addEventListener('touchstart', (e) => this.onCameraStart(e), { passive: false });
        this.cameraArea.addEventListener('touchmove', (e) => this.onCameraMove(e), { passive: false });
        this.cameraArea.addEventListener('touchend', (e) => this.onCameraEnd(e), { passive: false });
        this.cameraArea.addEventListener('touchcancel', (e) => this.onCameraEnd(e), { passive: false });

        // Sprint button events
        this.sprintButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.sprintPressed = true;
            if (this.sprintButton) {
                this.sprintButton.style.background = 'rgba(0, 255, 0, 0.5)';
            }
        }, { passive: false });
        
        this.sprintButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.sprintPressed = false;
            if (this.sprintButton) {
                this.sprintButton.style.background = 'rgba(0, 255, 0, 0.3)';
            }
        }, { passive: false });
        
        this.sprintButton.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.sprintPressed = false;
            if (this.sprintButton) {
                this.sprintButton.style.background = 'rgba(0, 255, 0, 0.3)';
            }
        }, { passive: false });
    }

    private onJoystickStart(e: TouchEvent): void {
        e.preventDefault();
        if (this.joystickActive) return;
        
        const touch = e.touches[0];
        const rect = this.joystickArea!.getBoundingClientRect();
        this.joystickCenterX = rect.left + rect.width / 2;
        this.joystickCenterY = rect.top + rect.height / 2;
        
        this.joystickTouchId = touch.identifier;
        this.joystickActive = true;
        this.joystickCurrentX = touch.clientX;
        this.joystickCurrentY = touch.clientY;
        this.updateJoystickPosition(touch.clientX, touch.clientY);
    }

    private onJoystickMove(e: TouchEvent): void {
        e.preventDefault();
        if (!this.joystickActive || this.joystickTouchId === null) return;
        
        const touch = Array.from(e.touches).find(t => t.identifier === this.joystickTouchId);
        if (!touch) return;
        
        this.joystickCurrentX = touch.clientX;
        this.joystickCurrentY = touch.clientY;
        this.updateJoystickPosition(touch.clientX, touch.clientY);
    }

    private onJoystickEnd(e: TouchEvent): void {
        e.preventDefault();
        if (this.joystickTouchId === null) return;
        
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.joystickTouchId);
        if (touch) {
            this.joystickActive = false;
            this.joystickTouchId = null;
            this.joystickCurrentX = 0;
            this.joystickCurrentY = 0;
            this.updateJoystickPosition(this.joystickCenterX, this.joystickCenterY);
        }
    }

    private updateJoystickPosition(clientX: number, clientY: number): void {
        if (!this.joystickHandle) return;
        
        const deltaX = clientX - this.joystickCenterX;
        const deltaY = clientY - this.joystickCenterY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance > this.joystickRadius) {
            const angle = Math.atan2(deltaY, deltaX);
            const clampedX = this.joystickCenterX + Math.cos(angle) * this.joystickRadius;
            const clampedY = this.joystickCenterY + Math.sin(angle) * this.joystickRadius;
            this.joystickHandle.style.transform = `translate(calc(-50% + ${clampedX - this.joystickCenterX}px), calc(-50% + ${clampedY - this.joystickCenterY}px))`;
        } else {
            this.joystickHandle.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
        }
    }

    private onCameraStart(e: TouchEvent): void {
        e.preventDefault();
        if (this.cameraActive) return;
        
        const touch = e.touches[0];
        this.cameraTouchId = touch.identifier;
        this.cameraActive = true;
        this.cameraLastX = touch.clientX;
        this.cameraLastY = touch.clientY;
        this.cameraDeltaX = 0;
        this.cameraDeltaY = 0;
    }

    private onCameraMove(e: TouchEvent): void {
        e.preventDefault();
        if (!this.cameraActive || this.cameraTouchId === null) return;
        
        const touch = Array.from(e.touches).find(t => t.identifier === this.cameraTouchId);
        if (!touch) return;
        
        this.cameraDeltaX = (touch.clientX - this.cameraLastX) * this.cameraSensitivity;
        this.cameraDeltaY = (touch.clientY - this.cameraLastY) * this.cameraSensitivity;
        this.cameraLastX = touch.clientX;
        this.cameraLastY = touch.clientY;
    }

    private onCameraEnd(e: TouchEvent): void {
        e.preventDefault();
        if (this.cameraTouchId === null) return;
        
        const touch = Array.from(e.changedTouches).find(t => t.identifier === this.cameraTouchId);
        if (touch) {
            this.cameraActive = false;
            this.cameraTouchId = null;
            this.cameraDeltaX = 0;
            this.cameraDeltaY = 0;
        }
    }

    public getInput(): TouchInput {
        // Calculate movement from joystick position
        let moveX = 0;
        let moveZ = 0;
        
        if (this.joystickActive) {
            const deltaX = this.joystickCurrentX - this.joystickCenterX;
            const deltaY = this.joystickCurrentY - this.joystickCenterY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (distance > 5) { // Dead zone
                const normalizedDistance = Math.min(1, distance / this.joystickRadius);
                const angle = Math.atan2(deltaY, deltaX);
                
                // Convert to forward/backward and left/right
                moveX = Math.sin(angle) * normalizedDistance;
                moveZ = -Math.cos(angle) * normalizedDistance;
            }
        }
        
        // Get camera deltas and reset them
        const deltaX = this.cameraDeltaX;
        const deltaY = this.cameraDeltaY;
        this.cameraDeltaX = 0;
        this.cameraDeltaY = 0;
        
        return {
            moveX,
            moveZ,
            cameraDeltaX: deltaX,
            cameraDeltaY: deltaY,
            sprint: this.sprintPressed
        };
    }

    public enable(): void {
        if (this.joystickArea) this.joystickArea.style.display = 'block';
        if (this.cameraArea) this.cameraArea.style.display = 'block';
        if (this.sprintButton) {
            this.sprintButton.style.display = 'flex';
        }
    }

    public disable(): void {
        if (this.joystickArea) this.joystickArea.style.display = 'none';
        if (this.cameraArea) this.cameraArea.style.display = 'none';
        if (this.sprintButton) this.sprintButton.style.display = 'none';
        
        // Reset states
        this.joystickActive = false;
        this.cameraActive = false;
        this.sprintPressed = false;
        this.joystickTouchId = null;
        this.cameraTouchId = null;
        this.joystickCurrentX = 0;
        this.joystickCurrentY = 0;
        this.cameraDeltaX = 0;
        this.cameraDeltaY = 0;
        
        // Reset joystick position
        if (this.joystickHandle && this.joystickArea) {
            const rect = this.joystickArea.getBoundingClientRect();
            this.joystickCenterX = rect.left + rect.width / 2;
            this.joystickCenterY = rect.top + rect.height / 2;
            this.updateJoystickPosition(this.joystickCenterX, this.joystickCenterY);
        }
    }

    public dispose(): void {
        this.disable();
        if (this.joystickArea) {
            this.joystickArea.remove();
            this.joystickArea = null;
        }
        if (this.cameraArea) {
            this.cameraArea.remove();
            this.cameraArea = null;
        }
        if (this.sprintButton) {
            this.sprintButton.remove();
            this.sprintButton = null;
        }
    }
}

