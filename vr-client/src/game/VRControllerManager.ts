import * as THREE from 'three';

export interface ControllerState {
    trigger: boolean;
    grip: boolean;
    thumbstick: { x: number; y: number };
    buttonA: boolean;
    buttonB: boolean;
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
}

export class VRControllerManager {
    private leftController: THREE.Group | null = null;
    private rightController: THREE.Group | null = null;
    private leftControllerState: ControllerState;
    private rightControllerState: ControllerState;
    private session: XRSession | null = null;
    private scene: THREE.Scene;
    private leftControllerMesh: THREE.Mesh | null = null;
    private rightControllerMesh: THREE.Mesh | null = null;
    private leftRay: THREE.Line | null = null;
    private rightRay: THREE.Line | null = null;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.leftControllerState = this.createDefaultState();
        this.rightControllerState = this.createDefaultState();
    }

    private createDefaultState(): ControllerState {
        return {
            trigger: false,
            grip: false,
            thumbstick: { x: 0, y: 0 },
            buttonA: false,
            buttonB: false,
            position: new THREE.Vector3(),
            rotation: new THREE.Quaternion()
        };
    }

    public setSession(session: XRSession): void {
        this.session = session;
        this.setupControllers();
    }

    private setupControllers(): void {
        if (!this.session) return;

        // Create controller groups
        this.leftController = new THREE.Group();
        this.rightController = new THREE.Group();
        this.scene.add(this.leftController);
        this.scene.add(this.rightController);

        // Create visual representation for controllers
        const controllerGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.15);
        const controllerMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });

        this.leftControllerMesh = new THREE.Mesh(controllerGeometry, controllerMaterial);
        this.rightControllerMesh = new THREE.Mesh(controllerGeometry, controllerMaterial);
        
        this.leftController.add(this.leftControllerMesh);
        this.rightController.add(this.rightControllerMesh);

        // Create raycast lines for pointing
        const rayGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);
        const rayMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
        
        this.leftRay = new THREE.Line(rayGeometry, rayMaterial);
        this.rightRay = new THREE.Line(rayGeometry, rayMaterial);
        
        this.leftController.add(this.leftRay);
        this.rightController.add(this.rightRay);
    }

    public update(frame: XRFrame, referenceSpace: XRReferenceSpace): void {
        if (!this.session) return;

        const inputSources = this.session.inputSources;

        for (const inputSource of inputSources) {
            if (!inputSource.gamepad) continue;

            const gamepad = inputSource.gamepad;
            const targetState = inputSource.handedness === 'left' 
                ? this.leftControllerState 
                : this.rightControllerState;
            const controllerGroup = inputSource.handedness === 'left'
                ? this.leftController
                : this.rightController;

            // Update button states
            targetState.trigger = gamepad.buttons[0]?.pressed || false; // Trigger
            targetState.grip = gamepad.buttons[1]?.pressed || false; // Grip
            targetState.buttonA = gamepad.buttons[4]?.pressed || false; // A button (right) / X button (left)
            targetState.buttonB = gamepad.buttons[5]?.pressed || false; // B button (right) / Y button (left)

            // Update thumbstick
            if (gamepad.axes.length >= 2) {
                targetState.thumbstick.x = gamepad.axes[0];
                targetState.thumbstick.y = gamepad.axes[1];
            }

            // Update controller pose
            const pose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
            if (pose && controllerGroup) {
                targetState.position.set(
                    pose.transform.position.x,
                    pose.transform.position.y,
                    pose.transform.position.z
                );
                targetState.rotation.set(
                    pose.transform.orientation.x,
                    pose.transform.orientation.y,
                    pose.transform.orientation.z,
                    pose.transform.orientation.w
                );

                // Update controller visual position
                controllerGroup.position.copy(targetState.position);
                controllerGroup.quaternion.copy(targetState.rotation);
            }
        }
    }

    public getLeftControllerState(): ControllerState {
        return this.leftControllerState;
    }

    public getRightControllerState(): ControllerState {
        return this.rightControllerState;
    }

    public getLeftController(): THREE.Group | null {
        return this.leftController;
    }

    public getRightController(): THREE.Group | null {
        return this.rightController;
    }

    public getLeftRay(): THREE.Raycaster {
        if (!this.leftController) {
            return new THREE.Raycaster();
        }
        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.leftController.quaternion);
        raycaster.set(this.leftController.position, direction);
        return raycaster;
    }

    public getRightRay(): THREE.Raycaster {
        if (!this.rightController) {
            return new THREE.Raycaster();
        }
        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.rightController.quaternion);
        raycaster.set(this.rightController.position, direction);
        return raycaster;
    }

    public dispose(): void {
        if (this.leftController) {
            this.scene.remove(this.leftController);
        }
        if (this.rightController) {
            this.scene.remove(this.rightController);
        }
        this.leftController = null;
        this.rightController = null;
        this.leftControllerMesh = null;
        this.rightControllerMesh = null;
        this.leftRay = null;
        this.rightRay = null;
        this.session = null;
    }
}

