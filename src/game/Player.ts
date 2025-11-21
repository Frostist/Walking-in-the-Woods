import * as THREE from 'three';
import { Input } from '../core/Input';
import { Health } from '../core/Health';
import { Weapon, WeaponStats } from './Weapon';
import { World } from './World';
import { eventBus } from '../app/EventBus';

export class Player {
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  private health: Health;
  private weapon: Weapon;
  private world: World;
  private camera: THREE.Camera;
  private speed: number = 5; // m/s
  private dashSpeed: number = 8;
  private dashDuration: number = 0.35;
  private dashTimer: number = 0;
  private jumpVelocity: number = 0;
  private isGrounded: boolean = true;
  private gravity: number = -20;
  private capsuleHeight: number = 1.6;
  private capsuleRadius: number = 0.3;

  constructor(world: World, camera: THREE.Camera) {
    this.world = world;
    this.camera = camera;
    this.position = new THREE.Vector3(0, 1.6, 0);
    this.velocity = new THREE.Vector3();
    this.health = new Health(100, 50, 10, 3);
    
    const wandStats: WeaponStats = {
      dmg: 10,
      rpm: 300, // 5/s
      mag: 20,
      reload: 1.6,
      projectileSpeed: 100
    };
    this.weapon = new Weapon(wandStats);

    // Listen for death
    eventBus.on('player/dead', () => {
      // Handle death
    });
  }

  update(deltaTime: number): void {
    this.health.update(deltaTime);
    this.weapon.update(deltaTime);

    // Handle dash
    if (this.dashTimer > 0) {
      this.dashTimer -= deltaTime;
    }

    // Movement
    const moveDirection = new THREE.Vector3();
    if (Input.isKeyDown('w')) moveDirection.z -= 1;
    if (Input.isKeyDown('s')) moveDirection.z += 1;
    if (Input.isKeyDown('a')) moveDirection.x -= 1;
    if (Input.isKeyDown('d')) moveDirection.x += 1;

    moveDirection.normalize();

    // Apply camera rotation to movement
    // Get forward direction from camera (ignoring Y)
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();

    // Get right vector
    const right = new THREE.Vector3();
    right.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));
    right.normalize();

    // Calculate movement direction in world space
    const move = new THREE.Vector3();
    move.addScaledVector(cameraDirection, -moveDirection.z); // Forward/back
    move.addScaledVector(right, moveDirection.x); // Left/right
    if (move.length() > 0) {
      move.normalize();
    }

    // Dash
    if (Input.isKeyDown('shift') && this.dashTimer <= 0 && move.length() > 0) {
      this.dashTimer = this.dashDuration;
      this.velocity.copy(move.multiplyScalar(this.dashSpeed));
    } else if (this.dashTimer <= 0) {
      const currentSpeed = this.speed;
      this.velocity.lerp(move.multiplyScalar(currentSpeed), 0.3);
    }

    // Jump
    if (Input.isKeyDown(' ') && this.isGrounded) {
      this.jumpVelocity = 4.5; // sqrt(2 * g * height) for 1.2m jump
      this.isGrounded = false;
    }

    // Gravity
    this.jumpVelocity += this.gravity * deltaTime;
    this.position.y += this.jumpVelocity * deltaTime;

    // Ground collision
    if (this.position.y <= this.capsuleHeight / 2) {
      this.position.y = this.capsuleHeight / 2;
      this.jumpVelocity = 0;
      this.isGrounded = true;
    }

    // Apply velocity
    this.position.addScaledVector(this.velocity, deltaTime);

    // Simple capsule collision with props
    this.handleCollisions();

    // Camera position is updated by App.ts

    // Reload
    if (Input.isKeyDown('r')) {
      this.weapon.reload();
    }
  }

  private handleCollisions(): void {
    // Simple AABB collision with props
    const capsulePos = new THREE.Vector3(this.position.x, this.capsuleHeight / 2, this.position.z);
    
    for (const prop of this.world.props) {
      const box = new THREE.Box3().setFromObject(prop);
      const closestPoint = box.clampPoint(capsulePos, new THREE.Vector3());
      const distance = capsulePos.distanceTo(closestPoint);

      if (distance < this.capsuleRadius) {
        const push = capsulePos.clone().sub(closestPoint).normalize();
        this.position.addScaledVector(push, this.capsuleRadius - distance);
      }
    }
  }

  fire(): boolean {
    if (!this.weapon.canFire()) return false;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    
    if (this.weapon.fire(direction, this.world.scene, this.camera)) {
      return true;
    }
    return false;
  }

  getHealth(): Health {
    return this.health;
  }

  getWeapon(): Weapon {
    return this.weapon;
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  takeDamage(amount: number): void {
    this.health.takeDamage(amount);
  }
}

