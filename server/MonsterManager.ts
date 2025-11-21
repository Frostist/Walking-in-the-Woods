import { Server } from 'socket.io';

// Player state interface (shared with server.ts)
export interface PlayerState {
    id: string;
    position: { x: number; y: number; z: number };
    rotationY: number;
    health: number;
    maxHealth: number;
    isDead: boolean;
    name?: string;
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
            // Use pathfinding to find the best direction to move
            const moveDirection = this.findPathToPlayer(nearestPlayer.position);
            
            // Calculate new position
            const moveDistance = MONSTER_SPEED * (deltaTime / 1000);
            const newX = this.monster.position.x + moveDirection.x * moveDistance;
            const newZ = this.monster.position.z + moveDirection.z * moveDistance;
            
            // Check collision with blocks (safety check)
            const finalPos = this.checkBlockCollision(newX, newZ);
            
            // Update position
            this.monster.position.x = finalPos.x;
            this.monster.position.z = finalPos.z;
            
            // Update rotation to face movement direction
            this.monster.rotationY = Math.atan2(moveDirection.x, moveDirection.z);
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
     * Find path to player using pathfinding logic
     * Returns a normalized direction vector to move in
     */
    private findPathToPlayer(targetPos: { x: number; y: number; z: number }): { x: number; z: number } {
        const monsterPos = this.monster.position;
        const dx = targetPos.x - monsterPos.x;
        const dz = targetPos.z - monsterPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 0.1) {
            return { x: 0, z: 0 };
        }
        
        // Normalize direction
        const dirX = dx / distance;
        const dirZ = dz / distance;
        
        // Check if direct path is clear
        const moveDistance = MONSTER_SPEED * 0.05; // Check a bit ahead
        const checkX = monsterPos.x + dirX * moveDistance;
        const checkZ = monsterPos.z + dirZ * moveDistance;
        
        if (this.isPathClear(monsterPos.x, monsterPos.z, checkX, checkZ)) {
            // Direct path is clear, move towards player
            return { x: dirX, z: dirZ };
        }
        
        // Direct path is blocked, try to find a way around
        return this.findAlternativePath(targetPos);
    }
    
    /**
     * Check if a path is clear of obstacles
     */
    private isPathClear(startX: number, startZ: number, endX: number, endZ: number): boolean {
        const blockSize = 1.0;
        const monsterRadius = 0.6;
        const monsterY = this.monster.position.y;
        const monsterHeight = 2.0;
        
        // Sample points along the path
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const checkX = startX + (endX - startX) * t;
            const checkZ = startZ + (endZ - startZ) * t;
            
            // Check if this position would collide with any block
            const checkRadius = monsterRadius + blockSize * 0.6;
            const minX = checkX - checkRadius;
            const maxX = checkX + checkRadius;
            const minZ = checkZ - checkRadius;
            const maxZ = checkZ + checkRadius;
            
            const monsterBottom = monsterY - monsterHeight/2;
            const monsterTop = monsterY + monsterHeight/2;
            
            // Check all blocks
            for (const [key, blockData] of Array.from(this.blocks.entries())) {
                const blockX = blockData.x;
                const blockY = blockData.y;
                const blockZ = blockData.z;
                
                // Check if block is in horizontal range
                if (blockX < minX || blockX > maxX || blockZ < minZ || blockZ > maxZ) {
                    continue;
                }
                
                // Check if block is in vertical range
                const blockBottom = blockY - blockSize/2;
                const blockTop = blockY + blockSize/2;
                
                if (monsterTop < blockBottom || monsterBottom > blockTop) {
                    continue;
                }
                
                // Check horizontal collision
                const blockMinX = blockX - blockSize/2;
                const blockMaxX = blockX + blockSize/2;
                const blockMinZ = blockZ - blockSize/2;
                const blockMaxZ = blockZ + blockSize/2;
                
                const monsterMinX = checkX - monsterRadius;
                const monsterMaxX = checkX + monsterRadius;
                const monsterMinZ = checkZ - monsterRadius;
                const monsterMaxZ = checkZ + monsterRadius;
                
                if (monsterMaxX > blockMinX && monsterMinX < blockMaxX &&
                    monsterMaxZ > blockMinZ && monsterMinZ < blockMaxZ) {
                    return false; // Path is blocked
                }
            }
        }
        
        return true; // Path is clear
    }
    
    /**
     * Find alternative path when direct path is blocked
     * Uses steering behavior to navigate around obstacles
     */
    private findAlternativePath(targetPos: { x: number; y: number; z: number }): { x: number; z: number } {
        const monsterPos = this.monster.position;
        const dx = targetPos.x - monsterPos.x;
        const dz = targetPos.z - monsterPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < 0.1) {
            return { x: 0, z: 0 };
        }
        
        // Normalize direction to target
        const dirX = dx / distance;
        const dirZ = dz / distance;
        
        // Try perpendicular directions (left and right)
        const perpendicularLeft = { x: -dirZ, z: dirX };
        const perpendicularRight = { x: dirZ, z: -dirX };
        
        const moveDistance = MONSTER_SPEED * 0.05;
        const checkDistance = 2.0; // How far ahead to check
        
        // Try left
        const leftX = monsterPos.x + perpendicularLeft.x * checkDistance;
        const leftZ = monsterPos.z + perpendicularLeft.z * checkDistance;
        const leftCheckX = leftX + dirX * moveDistance;
        const leftCheckZ = leftZ + dirZ * moveDistance;
        
        // Try right
        const rightX = monsterPos.x + perpendicularRight.x * checkDistance;
        const rightZ = monsterPos.z + perpendicularRight.z * checkDistance;
        const rightCheckX = rightX + dirX * moveDistance;
        const rightCheckZ = rightZ + dirZ * moveDistance;
        
        // Check which direction is better
        const leftClear = this.isPathClear(monsterPos.x, monsterPos.z, leftCheckX, leftCheckZ);
        const rightClear = this.isPathClear(monsterPos.x, monsterPos.z, rightCheckX, rightCheckZ);
        
        // Calculate scores for each direction (prefer direction that gets closer to target)
        let leftScore = 0;
        let rightScore = 0;
        
        if (leftClear) {
            const leftToTarget = Math.sqrt(
                Math.pow(targetPos.x - leftCheckX, 2) + 
                Math.pow(targetPos.z - leftCheckZ, 2)
            );
            leftScore = distance - leftToTarget; // Positive if getting closer
        }
        
        if (rightClear) {
            const rightToTarget = Math.sqrt(
                Math.pow(targetPos.x - rightCheckX, 2) + 
                Math.pow(targetPos.z - rightCheckZ, 2)
            );
            rightScore = distance - rightToTarget; // Positive if getting closer
        }
        
        // Choose best direction
        if (leftScore > rightScore && leftScore > 0) {
            // Blend perpendicular and forward movement
            const blend = 0.7; // More weight on perpendicular
            return {
                x: (perpendicularLeft.x * blend + dirX * (1 - blend)),
                z: (perpendicularLeft.z * blend + dirZ * (1 - blend))
            };
        } else if (rightScore > 0) {
            // Blend perpendicular and forward movement
            const blend = 0.7; // More weight on perpendicular
            return {
                x: (perpendicularRight.x * blend + dirX * (1 - blend)),
                z: (perpendicularRight.z * blend + dirZ * (1 - blend))
            };
        }
        
        // If both are blocked, try to move away from obstacles
        // Find the direction with least obstacles
        const obstacleAvoidance = this.getObstacleAvoidanceDirection();
        if (obstacleAvoidance) {
            return obstacleAvoidance;
        }
        
        // Fallback: try to move perpendicular to find an opening
        return perpendicularRight;
    }
    
    /**
     * Get direction to avoid nearby obstacles
     */
    private getObstacleAvoidanceDirection(): { x: number; z: number } | null {
        const monsterPos = this.monster.position;
        const blockSize = 1.0;
        const monsterRadius = 0.6;
        const checkRadius = 3.0; // Check obstacles within this radius
        
        let avoidX = 0;
        let avoidZ = 0;
        let obstacleCount = 0;
        
        // Find nearby obstacles and calculate avoidance vector
        for (const [key, blockData] of Array.from(this.blocks.entries())) {
            const blockX = blockData.x;
            const blockY = blockData.y;
            const blockZ = blockData.z;
            
            const dx = blockX - monsterPos.x;
            const dz = blockZ - monsterPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > checkRadius || distance < 0.1) {
                continue;
            }
            
            // Check vertical overlap
            const monsterY = this.monster.position.y;
            const monsterHeight = 2.0;
            const blockBottom = blockY - blockSize/2;
            const blockTop = blockY + blockSize/2;
            const monsterBottom = monsterY - monsterHeight/2;
            const monsterTop = monsterY + monsterHeight/2;
            
            if (monsterTop < blockBottom || monsterBottom > blockTop) {
                continue;
            }
            
            // Calculate avoidance direction (away from obstacle)
            const avoidDirX = -dx / distance;
            const avoidDirZ = -dz / distance;
            const weight = 1.0 / (distance + 0.1); // Closer obstacles have more weight
            
            avoidX += avoidDirX * weight;
            avoidZ += avoidDirZ * weight;
            obstacleCount++;
        }
        
        if (obstacleCount === 0) {
            return null;
        }
        
        // Normalize avoidance direction
        const length = Math.sqrt(avoidX * avoidX + avoidZ * avoidZ);
        if (length > 0.1) {
            return { x: avoidX / length, z: avoidZ / length };
        }
        
        return null;
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
        for (const [key, blockData] of Array.from(this.blocks.entries())) {
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

