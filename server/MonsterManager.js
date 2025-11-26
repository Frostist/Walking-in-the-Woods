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
    constructor(io, players, blocks, gameStartTime = Date.now()) {
        this.monsterAttackCooldowns = new Map();
        this.lastMonsterDamager = null; // Track who last damaged the monster
        this.updateInterval = null;
        this.lastMonsterUpdate = Date.now();
        this.isNight = false;
        this.lastDayNightCheck = Date.now();
        this.gameStartTime = Date.now();
        this.blockHits = new Map(); // Track hits per block (blockKey -> hitCount)
        this.BLOCKS_TO_BREAK = 4; // Number of hits needed to break a block
        this.io = io;
        this.players = players;
        this.blocks = blocks;
        this.gameStartTime = gameStartTime;
        // Initialize monster state (but don't spawn until night)
        this.monster = {
            position: { ...MONSTER_SPAWN_POSITION },
            rotationY: 0,
            health: MONSTER_MAX_HEALTH,
            maxHealth: MONSTER_MAX_HEALTH,
            isAlive: false // Start dead, will spawn at night
        };
        // Start the monster update loop
        this.startUpdateLoop();
    }
    startUpdateLoop() {
        this.updateInterval = setInterval(() => {
            const now = Date.now();
            const deltaTime = now - this.lastMonsterUpdate;
            this.lastMonsterUpdate = now;
            // Check day/night cycle every second
            if (now - this.lastDayNightCheck >= 1000) {
                this.checkDayNightCycle(now);
                this.lastDayNightCheck = now;
            }
            // Only update monster if it's night
            if (this.isNight) {
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
            }
        }, MONSTER_UPDATE_INTERVAL);
    }
    checkDayNightCycle(currentTime) {
        const CYCLE_DURATION = 300000; // 5 minutes
        const gameTime = currentTime - this.gameStartTime;
        const cycleProgress = (gameTime % CYCLE_DURATION) / CYCLE_DURATION;
        // Calculate sun position
        const sunAngle = (cycleProgress * Math.PI * 2) - Math.PI / 2;
        const sunY = Math.sin(sunAngle) * 150; // Same radius as client
        const sunHeightNormalized = Math.max(0, Math.min(1, (sunY + 10) / 20));
        // Day when sun is above 0.3 normalized height
        const wasNight = this.isNight;
        this.isNight = sunHeightNormalized <= 0.3;
        // If transitioning from day to night, spawn monster
        if (!wasNight && this.isNight) {
            this.spawnMonster();
        }
        // If transitioning from night to day, kill monster
        if (wasNight && !this.isNight) {
            this.killMonster();
        }
    }
    spawnMonster() {
        this.monster.position = { ...MONSTER_SPAWN_POSITION };
        this.monster.rotationY = 0;
        this.monster.health = MONSTER_MAX_HEALTH;
        this.monster.isAlive = true;
        // Broadcast spawn
        this.io.emit('monsterRespawned', {
            position: this.monster.position,
            rotationY: this.monster.rotationY,
            health: this.monster.health,
            maxHealth: this.monster.maxHealth
        });
    }
    killMonster() {
        if (this.monster.isAlive) {
            this.monster.isAlive = false;
            this.monster.health = 0;
            // Broadcast death
            this.io.emit('monsterDied');
        }
    }
    findNearestPlayer() {
        if (this.players.size === 0) {
            return null;
        }
        let nearestPlayer = null;
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
    updatePlayerHealth(playerId, damage) {
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
    respawnPlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            player.health = player.maxHealth;
            player.isDead = false;
        }
    }
    updateMonster(deltaTime) {
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
            // Use smooth direct movement (simplified from pathfinding)
            const dirX = dx / distance;
            const dirZ = dz / distance;
            // Calculate new position
            const moveDistance = MONSTER_SPEED * (deltaTime / 1000);
            const newX = this.monster.position.x + dirX * moveDistance;
            const newZ = this.monster.position.z + dirZ * moveDistance;
            // Check collision with blocks and handle breaking
            const finalPos = this.checkBlockCollisionAndBreak(newX, newZ);
            // Update position
            this.monster.position.x = finalPos.x;
            this.monster.position.z = finalPos.z;
            // Update rotation to face movement direction
            this.monster.rotationY = Math.atan2(dirX, dirZ);
        }
        // Keep monster at ground level
        this.monster.position.y = 1.0;
    }
    damageMonster(damage, attackerId) {
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
        }
        else {
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
    getLastMonsterDamager() {
        return this.lastMonsterDamager;
    }
    /**
     * Clear the last monster damager (after recording kill)
     */
    clearLastMonsterDamager() {
        this.lastMonsterDamager = null;
    }
    respawnMonster() {
        // Only respawn if it's night
        if (this.isNight) {
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
    }
    getMonsterState() {
        return {
            position: { ...this.monster.position },
            rotationY: this.monster.rotationY,
            health: this.monster.health,
            maxHealth: this.monster.maxHealth,
            isAlive: this.monster.isAlive
        };
    }
    cleanupPlayerCooldown(playerId) {
        this.monsterAttackCooldowns.delete(playerId);
    }
    /**
     * Check if a player is dead
     */
    isPlayerDead(playerId) {
        const player = this.players.get(playerId);
        return player ? (player.isDead || player.health <= 0) : false;
    }
    /**
     * Check if monster is alive
     */
    isMonsterAlive() {
        return this.monster.isAlive;
    }
    /**
     * Check collision with blocks, handle breaking, and adjust monster position
     */
    checkBlockCollisionAndBreak(newX, newZ) {
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
        const monsterBottom = monsterY - monsterHeight / 2;
        const monsterTop = monsterY + monsterHeight / 2;
        let finalX = newX;
        let finalZ = newZ;
        // Iterate through all blocks and check if they're in the collision area
        for (const [key, blockData] of Array.from(this.blocks.entries())) {
            const blockX = blockData.x;
            const blockY = blockData.y;
            const blockZ = blockData.z;
            // Check if block is in horizontal range
            if (blockX < minX || blockX > maxX || blockZ < minZ || blockZ > maxZ) {
                continue;
            }
            // Check if block is in vertical range (monster can collide with it)
            const blockBottom = blockY - blockSize / 2;
            const blockTop = blockY + blockSize / 2;
            // Check if monster and block overlap vertically
            if (monsterTop < blockBottom || monsterBottom > blockTop) {
                continue; // No vertical overlap, skip this block
            }
            // Block is in collision range, check horizontal collision
            const blockMinX = blockX - blockSize / 2;
            const blockMaxX = blockX + blockSize / 2;
            const blockMinZ = blockZ - blockSize / 2;
            const blockMaxZ = blockZ + blockSize / 2;
            const monsterMinX = finalX - monsterRadius;
            const monsterMaxX = finalX + monsterRadius;
            const monsterMinZ = finalZ - monsterRadius;
            const monsterMaxZ = finalZ + monsterRadius;
            // Check if monster collides with block (horizontal collision only)
            if (monsterMaxX > blockMinX && monsterMinX < blockMaxX &&
                monsterMaxZ > blockMinZ && monsterMinZ < blockMaxZ) {
                // Hit the block - increment hit count
                const currentHits = this.blockHits.get(key) || 0;
                const newHits = currentHits + 1;
                this.blockHits.set(key, newHits);
                // If block has been hit enough times, break it
                if (newHits >= this.BLOCKS_TO_BREAK) {
                    // Remove block from server
                    this.blocks.delete(key);
                    this.blockHits.delete(key);
                    // Broadcast block removal to all clients
                    this.io.emit('blockRemoved', blockData);
                    console.log(`Monster broke block at (${blockX}, ${blockY}, ${blockZ})`);
                    // Continue movement through the broken block
                    continue;
                }
                // Block not broken yet, push monster out
                const overlapX = Math.min(monsterMaxX - blockMinX, blockMaxX - monsterMinX);
                const overlapZ = Math.min(monsterMaxZ - blockMinZ, blockMaxZ - monsterMinZ);
                if (overlapX < overlapZ) {
                    // Push out in X direction
                    if (finalX > blockX) {
                        finalX = blockMaxX + monsterRadius;
                    }
                    else {
                        finalX = blockMinX - monsterRadius;
                    }
                }
                else {
                    // Push out in Z direction
                    if (finalZ > blockZ) {
                        finalZ = blockMaxZ + monsterRadius;
                    }
                    else {
                        finalZ = blockMinZ - monsterRadius;
                    }
                }
            }
        }
        return { x: finalX, z: finalZ };
    }
    dispose() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}
