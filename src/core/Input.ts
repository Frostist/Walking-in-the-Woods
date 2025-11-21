import * as THREE from 'three';

export class Input {
  private static keys: Set<string> = new Set();
  private static mouseButtons: Set<number> = new Set();
  private static mouseDelta: THREE.Vector2 = new THREE.Vector2();
  private static mousePosition: THREE.Vector2 = new THREE.Vector2();
  private static isPointerLocked = false;
  private static pointerLockCallback: (() => void) | null = null;
  private static pointerUnlockCallback: (() => void) | null = null;

  static init(canvas: HTMLCanvasElement, lockCallback?: () => void, unlockCallback?: () => void): void {
    Input.pointerLockCallback = lockCallback || null;
    Input.pointerUnlockCallback = unlockCallback || null;
    
    // Keyboard
    window.addEventListener('keydown', (e) => {
      Input.keys.add(e.key.toLowerCase());
      if (e.key === 'Escape') {
        Input.releasePointerLock();
      }
    });

    window.addEventListener('keyup', (e) => {
      Input.keys.delete(e.key.toLowerCase());
    });

    // Mouse
    canvas.addEventListener('mousedown', (e) => {
      Input.mouseButtons.add(e.button);
      // Don't handle pointer lock here - let PointerLockControls handle it
    });

    canvas.addEventListener('mouseup', (e) => {
      Input.mouseButtons.delete(e.button);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (Input.isPointerLocked) {
        Input.mouseDelta.set(e.movementX, e.movementY);
      }
      Input.mousePosition.set(e.clientX, e.clientY);
    });

    // Pointer lock change
    document.addEventListener('pointerlockchange', () => {
      Input.isPointerLocked = document.pointerLockElement === canvas;
      if (!Input.isPointerLocked) {
        Input.mouseDelta.set(0, 0);
        if (Input.pointerUnlockCallback) {
          Input.pointerUnlockCallback();
        }
      } else {
        if (Input.pointerLockCallback) {
          Input.pointerLockCallback();
        }
      }
    });
  }

  static requestPointerLock(canvas: HTMLCanvasElement): void {
    canvas.requestPointerLock();
  }

  static releasePointerLock(): void {
    document.exitPointerLock();
  }

  static isKeyDown(key: string): boolean {
    return Input.keys.has(key.toLowerCase());
  }

  static isMouseDown(button: number): boolean {
    return Input.mouseButtons.has(button);
  }

  static getMouseDelta(): THREE.Vector2 {
    const delta = Input.mouseDelta.clone();
    Input.mouseDelta.set(0, 0);
    return delta;
  }

  static getMousePosition(): THREE.Vector2 {
    return Input.mousePosition.clone();
  }

  static isPointerLockActive(): boolean {
    return Input.isPointerLocked;
  }
}

