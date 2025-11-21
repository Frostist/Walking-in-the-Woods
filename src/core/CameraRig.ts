import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export class CameraRig {
  public camera: THREE.PerspectiveCamera;
  public controls: PointerLockControls;
  private container: HTMLElement;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
    this.container = container;
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    this.controls = new PointerLockControls(this.camera, canvas);
    this.controls.pointerSpeed = 0.002;
    
    // Get the controls object (this is what rotates with mouse movement)
    const controlsObject = this.controls.getObject();
    
    // Ensure camera is a child of controls object (PointerLockControls should do this automatically,
    // but we verify and fix if needed)
    if (!controlsObject.children.includes(this.camera)) {
      console.warn('Camera is not a child of controls object - adding it manually');
      controlsObject.add(this.camera);
    }
    
    // Set camera position relative to controls object (eye height)
    this.camera.position.set(0, 1.6, 0);
    
    // Add event listeners for debugging
    this.controls.addEventListener('lock', () => {
      console.log('Pointer lock activated');
    });
    
    this.controls.addEventListener('unlock', () => {
      console.log('Pointer lock deactivated');
    });
    
    // Handle pointer lock errors
    document.addEventListener('pointerlockerror', () => {
      console.error('Pointer lock error - browser may not support it or permission denied');
    });

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }
  
  lock(): void {
    this.controls.lock();
  }
  
  unlock(): void {
    this.controls.unlock();
  }
  
  isLocked(): boolean {
    return this.controls.isLocked;
  }

  private onWindowResize(): void {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  update(_deltaTime: number): void {
    // PointerLockControls handles mouse movement automatically
    // No manual update needed - the controls handle rotation internally
    // when pointer lock is active
  }

  setPosition(position: THREE.Vector3): void {
    this.controls.getObject().position.copy(position);
  }

  getObject(): THREE.Object3D {
    return this.controls.getObject();
  }

  getDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    return direction;
  }
}

