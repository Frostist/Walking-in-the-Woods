import * as THREE from 'three';
import { World } from './World';
import { Player } from './Player';

export interface EnemyConfig {
  hp: number;
  dmg: number;
  speed: number;
  cost: number;
  ai: string;
  proj?: { speed: number; cooldown: number };
  abilities?: string[];
}

export class Enemy {
  public mesh: THREE.Mesh;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  private config: EnemyConfig;
  private hp: number;
  private maxHP: number;
  private attackCooldown: number = 0;
  private projectileCooldown: number = 0;
  private world: World;
  private player: Player;
  private isDead: boolean = false;

  constructor(
    config: EnemyConfig,
    position: THREE.Vector3,
    world: World,
    player: Player
  ) {
    this.config = config;
    this.maxHP = config.hp;
    this.hp = config.hp;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.world = world;
    this.player = player;

    // Create mesh based on enemy type
    this.mesh = this.createMesh(config.ai);
    this.mesh.position.copy(position);
    world.addEnemy(this.mesh);
  }

  private createMesh(aiType: string): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    let material: THREE.MeshStandardMaterial;

    if (aiType === 'miniboss') {
      // Use cylinder for mini-boss (capsule approximation)
      geometry = new THREE.CylinderGeometry(1, 1, 2, 8);
      material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
    } else if (aiType === 'ranged') {
      geometry = new THREE.BoxGeometry(0.8, 1.6, 0.8);
      material = new THREE.MeshStandardMaterial({ color: 0x6a1b9a, roughness: 0.8 });
    } else {
      // melee (sporeling) - use cylinder as capsule approximation
      geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8);
      material = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 });
    }

    return new THREE.Mesh(geometry, material);
  }

  update(deltaTime: number): void {
    if (this.isDead) return;

    this.attackCooldown -= deltaTime;
    this.projectileCooldown -= deltaTime;

    const playerPos = this.player.getPosition();
    const toPlayer = playerPos.clone().sub(this.position);
    const distance = toPlayer.length();

    // AI behavior
    if (this.config.ai === 'melee' || this.config.ai === 'meleeChase') {
      this.updateMelee(deltaTime, toPlayer, distance);
    } else if (this.config.ai === 'ranged' || this.config.ai === 'rangedKite') {
      this.updateRanged(deltaTime, toPlayer, distance);
    } else if (this.config.ai === 'miniboss') {
      this.updateMiniBoss(deltaTime, toPlayer, distance);
    }

    // Update position
    this.position.addScaledVector(this.velocity, deltaTime);
    this.mesh.position.copy(this.position);

    // Face player
    if (distance > 0.1) {
      this.mesh.lookAt(playerPos);
    }
  }

  private updateMelee(_deltaTime: number, toPlayer: THREE.Vector3, distance: number): void {
    toPlayer.y = 0;
    toPlayer.normalize();

    // Chase player
    this.velocity.lerp(toPlayer.multiplyScalar(this.config.speed), 0.3);

    // Attack if close
    if (distance < 1.5 && this.attackCooldown <= 0) {
      this.player.takeDamage(this.config.dmg);
      this.attackCooldown = 1.0;
    }
  }

  private updateRanged(_deltaTime: number, toPlayer: THREE.Vector3, distance: number): void {
    toPlayer.y = 0;
    toPlayer.normalize();

    // Keep distance (8-12m)
    if (distance < 8) {
      // Move away
      this.velocity.lerp(toPlayer.multiplyScalar(-this.config.speed), 0.3);
    } else if (distance > 12) {
      // Move closer
      this.velocity.lerp(toPlayer.multiplyScalar(this.config.speed), 0.3);
    } else {
      this.velocity.lerp(new THREE.Vector3(), 0.5);
    }

    // Fire projectile
    if (distance >= 8 && distance <= 15 && this.projectileCooldown <= 0 && this.config.proj) {
      this.fireProjectile(toPlayer);
      this.projectileCooldown = this.config.proj.cooldown;
    }
  }

  private updateMiniBoss(_deltaTime: number, toPlayer: THREE.Vector3, distance: number): void {
    toPlayer.y = 0;
    toPlayer.normalize();

    // Slow chase
    this.velocity.lerp(toPlayer.multiplyScalar(this.config.speed), 0.2);

    // Periodic ground slam
    if (this.attackCooldown <= 0 && distance < 5) {
      // Ground slam attack
      this.player.takeDamage(this.config.dmg * 2);
      this.attackCooldown = 3.0;
    }
  }

  private fireProjectile(direction: THREE.Vector3): void {
    // Create projectile mesh
    const projGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const projMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const projectile = new THREE.Mesh(projGeometry, projMaterial);
    projectile.position.copy(this.position);
    projectile.position.y += 1;

    const projVelocity = direction.clone().multiplyScalar(this.config.proj!.speed);
    
    // Simple projectile movement (would be better in a ProjectileManager)
    const updateProjectile = () => {
      projectile.position.addScaledVector(projVelocity, 0.016);
      
      const distToPlayer = projectile.position.distanceTo(this.player.getPosition());
      if (distToPlayer < 0.5) {
        this.player.takeDamage(this.config.dmg);
        this.world.scene.remove(projectile);
        projGeometry.dispose();
        projMaterial.dispose();
        return;
      }

      if (projectile.position.length() > 50) {
        this.world.scene.remove(projectile);
        projGeometry.dispose();
        projMaterial.dispose();
        return;
      }

      requestAnimationFrame(updateProjectile);
    };
    updateProjectile();
  }

  takeDamage(amount: number, _element?: string): void {
    this.hp -= amount;

    // Visual feedback
    if (this.hp <= 0) {
      this.die();
    }
  }

  private die(): void {
    this.isDead = true;
    this.world.removeEnemy(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  getHP(): number {
    return this.hp;
  }

  getMaxHP(): number {
    return this.maxHP;
  }

  getCost(): number {
    return this.config.cost;
  }

  isDeadNow(): boolean {
    return this.isDead;
  }
}

