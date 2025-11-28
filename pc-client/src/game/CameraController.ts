import * as THREE from 'three';

export class CameraController {
    private camera: THREE.PerspectiveCamera;
    private domElement: HTMLElement;
    private isMouseDown: boolean = false;
    private mouseX: number = 0;
    private mouseY: number = 0;
    private targetRotationX: number = 0;
    private targetRotationY: number = 0;
    private rotationX: number = 0;
    private rotationY: number = 0;
    private distance: number = 10;
    private targetDistance: number = 10;

    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.domElement.addEventListener('mouseup', () => this.onMouseUp());
        this.domElement.addEventListener('wheel', (e) => this.onWheel(e));
    }

    private onMouseDown(event: MouseEvent): void {
        this.isMouseDown = true;
        this.mouseX = event.clientX;
        this.mouseY = event.clientY;
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isMouseDown) return;

        const deltaX = event.clientX - this.mouseX;
        const deltaY = event.clientY - this.mouseY;

        this.targetRotationY += deltaX * 0.01;
        this.targetRotationX += deltaY * 0.01;

        // Clamp vertical rotation
        this.targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.targetRotationX));

        this.mouseX = event.clientX;
        this.mouseY = event.clientY;
    }

    private onMouseUp(): void {
        this.isMouseDown = false;
    }

    private onWheel(event: WheelEvent): void {
        event.preventDefault();
        this.targetDistance += event.deltaY * 0.01;
        this.targetDistance = Math.max(3, Math.min(20, this.targetDistance));
    }

    public update(deltaTime: number): void {
        // Smooth rotation interpolation
        const lerpFactor = Math.min(1, deltaTime * 0.01);
        this.rotationX += (this.targetRotationX - this.rotationX) * lerpFactor;
        this.rotationY += (this.targetRotationY - this.rotationY) * lerpFactor;

        // Smooth distance interpolation
        this.distance += (this.targetDistance - this.distance) * lerpFactor;

        // Calculate camera position using spherical coordinates
        const x = Math.sin(this.rotationX) * Math.cos(this.rotationY) * this.distance;
        const y = Math.cos(this.rotationX) * this.distance;
        const z = Math.sin(this.rotationX) * Math.sin(this.rotationY) * this.distance;

        this.camera.position.set(x, y, z);
        this.camera.lookAt(0, 0, 0);
    }
}

