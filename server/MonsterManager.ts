import { Server } from 'socket.io';

// Player state interface (shared with server.ts)
export interface PlayerState {
    id: string;
    position: { x: number; y: number; z: number };
    rotationY: number;
    health: number;
    maxHealth: number;
    isDead: boolean;
}

// Block data interface
export interface BlockData {
    x: number;
    y: number;
    z: number;
    type: string;
}

// Monster state
interface MonsterState {
    position: { x: number; y: number; z: number };
    rotationY: number;
    health: number;
    maxHealth: number;
    isAlive: boolean;
}

// Constants
const MONSTER_MAX_HEALTH = 10;
const MONSTER_SPAWN_POSITION = { x: 20, y: 1.0, z: 20 };
const MONSTER_SPEED = 3.0; // Units per second
const MONSTER_UPDATE_INTERVAL = 50; // Update every 50ms (20 times per second)
const MONSTER_RESPAWN_TIME = 30000; // 30 seconds to respawn after death
const MONSTER_DAMAGE = 1; // Damage per attack
const MONSTER_ATTACK_RANGE = 2.0; // Distance at which monster can attack
const MONSTER_ATTACK_COOLDOWN = 1000; // 1 second between attacks (per player)

export class MonsterManager {
    private monster: MonsterState;
    private monsterAttackCooldowns: Map<string, number> = new Map();
    private lastMonsterDamager: string | null = null; // Track who last damaged the monster
    private io: Server;
    private players: Map<string, PlayerState>;
    private blocks: Map<string, BlockData>; // Reference to blocks for collision
    private updateInterval: NodeJS.Timeout | null = null;
    private lastMonsterUpdate: number = Date.now();

    constructor(io: Server, players: Map<string, PlayerState>, blocks: Map<string, BlockData>) {
        this.io = io;
        this.players = players;
        this.blocks = blocks;
        
        // Initialize monster state
        this.monster = {
            position: { ...MONSTER_SPAWN_POSITION },
            rotationY: 0,
            health: MONSTER_MAX_HEALTH,
            maxHealth: MONSTER_MAX_HEALTH,
            isAlive: true
        };

        // Start the monster update loop
        this.startUpdateLoop();
    }

    private startUpdateLoop(): void {
        this.updateInterval = setInterval(() => {
            const now = Date.now();
            const deltaTime = now - this.lastMonsterUpdate;
            this.lastMonsterUpdate = now;
            
            this.updateMonster(deltaTime);
            
            // Broadcast monster position to all clients (only if alive)
            if (this.monster.isAlive) {
                this.io.emit('monsterUpdate', {
                    position: this.monster.position,
                    rotationY: this.monster.rotationY,
                    health: this.monster.health,
                    maxHealth: this.monster.maxHealth
                });
            }
        }, MONSTER_UPDATE_INTERVAL);
    }

    private findNearestPlayer(): PlayerState | null {
        if (this.players.size === 0) {
            return null;
        }
        
        let nearestPlayer: PlayerState | null = null;
        let nearestDistance = Infinity;
        
        const playerArray = Array.from(this.players.values());
        for (let i = 0; i < playerArray.length; i++) {
            const player = playerArray[i];
            
            // Skip dead players
            if (player.isDead || player.health <= 0) {
                continue;
            }
            
            const dx = player.position.x - this.monster.position.x;
            const dz = player.position.z - this.monster.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        }
        
        return nearestPlayer;
    }
    
    /**
     * Update player health when they take damage
     */
    public updatePlayerHealth(playerId: string, damage: number): void {
        const player = this.players.get(playerId);
        if (player) {
            player.health = Math.max(0, player.health - damage);
            if (player.health <= 0) {
                player.isDead = true;
                player.health = 0;
                // Clean up attack cooldown for dead player
                this.monsterAttackCooldowns.delete(playerId);
            }
        }
    }
    
    /**
     * Reset player health when they respawn
     */
    public respawnPlayer(playerId: string): void {
        const player = this.players.get(playerId);
        if (player) {
            player.health = player.maxHealth;
            player.isDead = false;
        }
    }

    private updateMonster(deltaTime: number): void {
        // Don't update if monster is dead
        if (!this.monster.isAlive) {
            return;
        }
        
        const nearestPlayer = this.findNearestPlayer();
        
        if (!nearestPlayer) {
            return; // No players to follow
        }
        
        // Calculate direction to nearest player
        const dx = nearestPlayer.position.x - this.monster.position.x;
        const dz = nearestPlayer.position.z - this.monster.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        // Check if monster is close enough to attack
        if (distance <= MONSTER_ATTACK_RANGE) {
            const now = Date.now();
            const lastAttackTime = this.monsterAttackCooldowns.get(nearestPlayer.id) || 0;
            
            // Check if cooldown has expired
            if (now - lastAttackTime >= MONSTER_ATTACK_COOLDOWN) {
                // Attack the player
                this.monsterAttackCooldowns.set(nearestPlayer.id, now);
                
                // Update player health on server
                this.updatePlayerHealth(nearestPlayer.id, MONSTER_DAMAGE);
                
                // Broadcast damage to all clients
                this.io.emit('playerDamaged', {
                    playerId: nearestPlayer.id,
                    damage: MONSTER_DAMAGE
                });
            }
        }
        
        // Only move if player is far enough away
        if (distance > 0.1) {
            // Normalize direction
            const dirX = dx / distance;
            const dirZ = dz / distance;
            
            // Calculate new position
            const moveDistance = MONSTER_SPEED * (deltaTime / 1000);
            const newX = this.monster.position.x + dirX * moveDistance;
            const newZ = this.monster.position.z + dirZ * moveDistance;
            
            // Check collision with blocks
            const finalPos = this.checkBlockCollision(newX, newZ);
            
            // Update position
            this.monster.position.x = finalPos.x;
            this.monster.position.z = finalPos.z;
            
            // Update rotation to face player
            this.monster.rotationY = Math.atan2(dirX, dirZ);
        }
        
        // Keep monster at ground level
        this.monster.position.y = 1.0;
    }

    public damageMonster(damage: number, attackerId?: string): boolean {
        if (!this.monster.isAlive) {
            return false; // Already dead
        }
        
        // Track who dealt the damage
        if (attackerId) {
            this.lastMonsterDamager = attackerId;
        }
        
        this.monster.health = Math.max(0, this.monster.health - damage);
        
        if (this.monster.health <= 0) {
            this.monster.isAlive = false;
            this.monster.health = 0;
            
            // Broadcast monster death
            this.io.emit('monsterDied');
            
            // Schedule respawn
            setTimeout(() => {
                this.respawnMonster();
            }, MONSTER_RESPAWN_TIME);
            
            return true; // Monster was killed
        } else {
            // Broadcast health update
            this.io.emit('monsterHealthUpdate', {
                health: this.monster.health,
                maxHealth: this.monster.maxHealth
            });
            return false; // Monster still alive
        }
    }
    
    /**
     * Get the last player who damaged the monster (for kill attribution)
     */
    public getLastMonsterDamager(): string | null {
        return this.lastMonsterDamager;
    }
    
    /**
     * Clear the last monster damager (after recording kill)
     */
    public clearLastMonsterDamager(): void {
        this.lastMonsterDamager = null;
    }

    private respawnMonster(): void {
        this.monster.position = { ...MONSTER_SPAWN_POSITION };
        this.monster.rotationY = 0;
        this.monster.health = MONSTER_MAX_HEALTH;
        this.monster.isAlive = true;
        
        // Broadcast respawn
        this.io.emit('monsterRespawned', {
            position: this.monster.position,
            rotationY: this.monster.rotationY,
            health: this.monster.health,
            maxHealth: this.monster.maxHealth
        });
    }

    public getMonsterState() {
        return {
            position: { ...this.monster.position },
            rotationY: this.monster.rotationY,
            health: this.monster.health,
            maxHealth: this.monster.maxHealth,
            isAlive: this.monster.isAlive
        };
    }

    public cleanupPlayerCooldown(playerId: string): void {
        this.monsterAttackCooldowns.delete(playerId);
    }
    
    /**
     * Check if a player is dead
     */
    public isPlayerDead(playerId: string): boolean {
        const player = this.players.get(playerId);
        return player ? (player.isDead || player.health <= 0) : false;
    }
    
    /**
     * Check if monster is alive
     */
    public isMonsterAlive(): boolean {
        return this.monster.isAlive;
    }
    
    /**
     * Check collision with blocks and adjust monster position
     */
    private checkBlockCollision(newX: number, newZ: number): { x: number; z: number } {
        const blockSize = 1.0;
        const monsterRadius = 0.6; // Monster collision radius
        const monsterY = this.monster.position.y;
        const monsterHeight = 2.0; // Monster height
        
        // Check blocks in area around monster
        const checkRadius = monsterRadius + blockSize * 0.6;
        const minX = newX - checkRadius;
        const maxX = newX + checkRadius;
        const minZ = newZ - checkRadius;
        const maxZ = newZ + checkRadius;
        
        // Monster vertical bounds
        const monsterBottom = monsterY - monsterHeight/2;
        const monsterTop = monsterY + monsterHeight/2;
        
        let finalX = newX;
        let finalZ = newZ;
        
        // Iterate through all blocks and check if they're in the collision area
        // This approach handles any key format and ensures we check all blocks
        for (const [key, blockData] of this.blocks.entries()) {
            const blockX = blockData.x;
            const blockY = blockData.y;
            const blockZ = blockData.z;
            
            // Check if block is in horizontal range
            if (blockX < minX || blockX > maxX || blockZ < minZ || blockZ > maxZ) {
                continue;
            }
            
            // Check if block is in vertical range (monster can collide with it)
            const blockBottom = blockY - blockSize/2;
            const blockTop = blockY + blockSize/2;
            
            // Check if monster and block overlap vertically
            if (monsterTop < blockBottom || monsterBottom > blockTop) {
                continue; // No vertical overlap, skip this block
            }
            
            // Block is in collision range, check horizontal collision
            const blockMinX = blockX - blockSize/2;
            const blockMaxX = blockX + blockSize/2;
            const blockMinZ = blockZ - blockSize/2;
            const blockMaxZ = blockZ + blockSize/2;
            
            const monsterMinX = finalX - monsterRadius;
            const monsterMaxX = finalX + monsterRadius;
            const monsterMinZ = finalZ - monsterRadius;
            const monsterMaxZ = finalZ + monsterRadius;
            
            // Check if monster collides with block (horizontal collision only)
            if (monsterMaxX > blockMinX && monsterMinX < blockMaxX &&
                monsterMaxZ > blockMinZ && monsterMinZ < blockMaxZ) {
                
                // Push monster out of block
                const overlapX = Math.min(monsterMaxX - blockMinX, blockMaxX - monsterMinX);
                const overlapZ = Math.min(monsterMaxZ - blockMinZ, blockMaxZ - monsterMinZ);
                
                if (overlapX < overlapZ) {
                    // Push out in X direction
                    if (finalX > blockX) {
                        finalX = blockMaxX + monsterRadius;
                    } else {
                        finalX = blockMinX - monsterRadius;
                    }
                } else {
                    // Push out in Z direction
                    if (finalZ > blockZ) {
                        finalZ = blockMaxZ + monsterRadius;
                    } else {
                        finalZ = blockMinZ - monsterRadius;
                    }
                }
            }
        }
        
        return { x: finalX, z: finalZ };
    }

    public dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

