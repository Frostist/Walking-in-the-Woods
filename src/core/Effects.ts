import * as THREE from 'three';

export class Effects {
  private scene: THREE.Scene;
  private fogEnabled: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  createHitFlash(position: THREE.Vector3, color: number = 0xff0000): void {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
    );
    flash.position.copy(position);
    this.scene.add(flash);

    const fadeOut = () => {
      const material = flash.material as THREE.MeshBasicMaterial;
      material.opacity -= 0.1;
      if (material.opacity <= 0) {
        this.scene.remove(flash);
        flash.geometry.dispose();
        material.dispose();
      } else {
        requestAnimationFrame(fadeOut);
      }
    };
    requestAnimationFrame(fadeOut);
  }

  toggleFog(enabled: boolean): void {
    this.fogEnabled = enabled;
    if (enabled) {
      this.scene.fog = new THREE.FogExp2(0x000000, 0.05);
    } else {
      this.scene.fog = null;
    }
  }

  isFogEnabled(): boolean {
    return this.fogEnabled;
  }

  createMuzzleFlash(position: THREE.Vector3, _direction: THREE.Vector3): void {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 1 })
    );
    flash.position.copy(position);
    this.scene.add(flash);

    setTimeout(() => {
      this.scene.remove(flash);
      flash.geometry.dispose();
      (flash.material as THREE.Material).dispose();
    }, 50);
  }
}

