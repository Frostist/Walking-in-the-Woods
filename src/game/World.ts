import * as THREE from 'three';

export class World {
  public scene: THREE.Scene;
  public enemyMeshes: THREE.Object3D[] = [];
  public props: THREE.Object3D[] = [];
  public spawnPoints: Array<{ id: string; pos: THREE.Vector3; tags: string[]; cooldown: number }> = [];

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.fog = new THREE.FogExp2(0x0a0a0a, 0.02);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 1.2);
    this.scene.add(ambientLight);

    // Directional light (warm rim)
    const dirLight = new THREE.DirectionalLight(0xffaa44, 1.5);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = false;
    this.scene.add(dirLight);

    // Hemisphere light for ambient glow
    const hemiLight = new THREE.HemisphereLight(0x21c48d, 0x0a0a0a, 0.8);
    this.scene.add(hemiLight);

    this.createArena();
  }

  private createArena(): void {
    // Floor (50x50m)
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = false;
    this.scene.add(floor);

    // Low walls/rocks for cover
    const coverPositions = [
      new THREE.Vector3(-15, 0.5, 10),
      new THREE.Vector3(15, 0.5, -10),
      new THREE.Vector3(0, 0.5, -20),
      new THREE.Vector3(-10, 0.5, -15),
      new THREE.Vector3(10, 0.5, 15),
    ];

    coverPositions.forEach(pos => {
      const cover = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1, 3),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 })
      );
      cover.position.copy(pos);
      this.scene.add(cover);
      this.props.push(cover);
    });

    // Bioluminescent glow planes (fungal mood)
    const glowPositions = [
      new THREE.Vector3(-20, 0.1, 20),
      new THREE.Vector3(20, 0.1, -20),
      new THREE.Vector3(0, 0.1, 25),
    ];

    glowPositions.forEach(pos => {
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({
          color: 0x21c48d,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        })
      );
      glow.position.copy(pos);
      glow.rotation.x = -Math.PI / 2;
      this.scene.add(glow);
    });
  }

  addEnemy(mesh: THREE.Object3D): void {
    this.enemyMeshes.push(mesh);
    this.scene.add(mesh);
  }

  removeEnemy(mesh: THREE.Object3D): void {
    const index = this.enemyMeshes.indexOf(mesh);
    if (index > -1) {
      this.enemyMeshes.splice(index, 1);
      this.scene.remove(mesh);
    }
  }

  addSpawnPoint(id: string, pos: THREE.Vector3, tags: string[], cooldown: number = 12): void {
    this.spawnPoints.push({ id, pos, tags, cooldown });
  }
}

