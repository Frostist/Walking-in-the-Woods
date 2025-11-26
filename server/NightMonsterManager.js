// Helper function to get block key
function getBlockKey(x, y, z) {
    return `${x},${y},${z}`;
}
// Constants
const NIGHT_MONSTER_MAX_HEALTH = 5;
const NIGHT_MONSTER_SPEED = 2.5;
const NIGHT_MONSTER_UPDATE_INTERVAL = 50; // Update every 50ms
const NIGHT_MONSTER_DAMAGE = 1;
const NIGHT_MONSTER_ATTACK_RANGE = 2.0;
const NIGHT_MONSTER_ATTACK_COOLDOWN = 1000;
const MAX_NIGHT_MONSTERS = 10; // Maximum number of night monsters at once
const MIN_NIGHT_MONSTERS = 1; // Minimum number of night monsters to spawn
const NIGHT_MONSTER_SPAWN_RADIUS = 30; // Spawn within this radius of origin
// Safe spawn zone constants (must match client-side values)
const SPAWN_ZONE_CENTER = { x: 0, z: 0 };
const SPAWN_ZONE_RADIUS = 8;
export class NightMonsterManager {
    constructor(io, players, blocks, gameStartTime = Date.now()) {
        this.monsters = new Map();
        this.monsterAttackCooldowns = new Map(); // monsterId -> playerId -> lastAttackTime
        this.updateInterval = null;
        this.lastMonsterUpdate = Date.now();
        this.isNight = false;
        this.lastDayNightCheck = Date.now();
        this.nextMonsterId = 0;
        this.blockHits = new Map(); // Track hits per block (blockKey -> hitCount)
        this.BLOCKS_TO_BREAK = 4; // Number of hits needed to break a block
        this.gameStartTime = Date.now();
        this.playerSpawnProtection = new Map(); // Track spawn protection per player
        this.io = io;
        this.players = players;
        this.blocks = blocks;
        this.gameStartTime = gameStartTime;
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
            // Only update monsters if it's night
            if (this.isNight) {
                this.updateMonsters(deltaTime);
                // Broadcast all monster positions
                const monstersArray = Array.from(this.monsters.values())
                    .filter(m => m.isAlive)
                    .map(m => ({
                    id: m.id,
                    position: m.position,
                    rotationY: m.rotationY,
                    health: m.health,
                    maxHealth: m.maxHealth
                }));
                if (monstersArray.length > 0) {
                    this.io.emit('nightMonstersUpdate', monstersArray);
                }
            }
        }, NIGHT_MONSTER_UPDATE_INTERVAL);
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
        // If transitioning from day to night, spawn monsters
        if (!wasNight && this.isNight) {
            console.log(`🌙 Day → Night transition detected (sunHeight: ${sunHeightNormalized.toFixed(3)})`);
            this.spawnNightMonsters();
        }
        // If transitioning from night to day, kill all monsters
        if (wasNight && !this.isNight) {
            console.log(`☀️ Night → Day transition detected (sunHeight: ${sunHeightNormalized.toFixed(3)})`);
            this.killAllMonsters();
        }
    }
    spawnNightMonsters() {
        console.log('🌙 Night falls! Spawning night monsters...');
        // Spawn a random number of monsters between MIN and MAX
        const spawnCount = Math.floor(Math.random() * (MAX_NIGHT_MONSTERS - MIN_NIGHT_MONSTERS + 1)) + MIN_NIGHT_MONSTERS;
        for (let i = 0; i < spawnCount; i++) {
            // Distribute monsters around a circle with some randomness
            const angle = (Math.PI * 2 * i) / spawnCount + (Math.random() - 0.5) * 0.5; // Add some randomness to angle
            const distance = 15 + Math.random() * (NIGHT_MONSTER_SPAWN_RADIUS - 15);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const monsterId = `night_monster_${this.nextMonsterId++}`;
            const monster = {
                id: monsterId,
                position: { x, y: 1.0, z },
                rotationY: 0,
                health: NIGHT_MONSTER_MAX_HEALTH,
                maxHealth: NIGHT_MONSTER_MAX_HEALTH,
                isAlive: true
            };
            this.monsters.set(monsterId, monster);
            this.monsterAttackCooldowns.set(monsterId, new Map());
        }
        // Broadcast spawn to all clients
        const monstersArray = Array.from(this.monsters.values())
            .filter(m => m.isAlive)
            .map(m => ({
            id: m.id,
            position: m.position,
            rotationY: m.rotationY,
            health: m.health,
            maxHealth: m.maxHealth
        }));
        this.io.emit('nightMonstersSpawned', monstersArray);
    }
    killAllMonsters() {
        const monsterCount = this.monsters.size;
        if (monsterCount === 0) {
            console.log('☀️ Sunrise: No night monsters to kill');
            return;
        }
        console.log(`☀️ Sunrise! Killing ${monsterCount} night monsters`);
        // Kill all monsters
        for (const monster of this.monsters.values()) {
            monster.isAlive = false;
            monster.health = 0;
        }
        // Broadcast death to all clients
        const monsterIds = Array.from(this.monsters.keys());
        this.io.emit('nightMonstersDied', monsterIds);
        // Clear monsters (they'll respawn next night)
        this.monsters.clear();
        this.monsterAttackCooldowns.clear();
        this.blockHits.clear();
        console.log(`☀️ Night monsters despawned. Event sent to all clients.`);
    }
    /**
     * Check if a position is inside the spawn zone
     */
    isInSpawnZone(x, z) {
        const dx = x - SPAWN_ZONE_CENTER.x;
        const dz = z - SPAWN_ZONE_CENTER.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance <= SPAWN_ZONE_RADIUS;
    }
    /**
     * Check if a player has spawn protection
     */
    hasSpawnProtection(playerId) {
        return this.playerSpawnProtection.get(playerId) === true;
    }
    /**
     * Update spawn protection for all players
     * Players lose protection when they leave the spawn zone
     */
    updateSpawnProtection() {
        for (const player of this.players.values()) {
            const hasProtection = this.playerSpawnProtection.get(player.id);
            // If player has protection and is outside the zone, remove protection
            if (hasProtection && !this.isInSpawnZone(player.position.x, player.position.z)) {
                this.playerSpawnProtection.set(player.id, false);
            }
        }
    }
    /**
     * Grant spawn protection to a player (called on join or respawn)
     */
    grantSpawnProtection(playerId) {
        this.playerSpawnProtection.set(playerId, true);
    }
    /**
     * Remove spawn protection tracking for a player (called on disconnect)
     */
    removeSpawnProtection(playerId) {
        this.playerSpawnProtection.delete(playerId);
    }
    findNearestPlayer(monsterPos) {
        if (this.players.size === 0) {
            return null;
        }
        let nearestPlayer = null;
        let nearestDistance = Infinity;
        for (const player of this.players.values()) {
            if (player.isDead || player.health <= 0) {
                continue;
            }
            const dx = player.position.x - monsterPos.x;
            const dz = player.position.z - monsterPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        }
        return nearestPlayer;
    }
    updateMonsters(deltaTime) {
        // Update spawn protection for all players
        this.updateSpawnProtection();
        for (const monster of this.monsters.values()) {
            if (!monster.isAlive) {
                continue;
            }
            const nearestPlayer = this.findNearestPlayer(monster.position);
            if (!nearestPlayer) {
                continue;
            }
            // Calculate direction to nearest player
            const dx = nearestPlayer.position.x - monster.position.x;
            const dz = nearestPlayer.position.z - monster.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            // Check if monster is close enough to attack
            // Only attack if player doesn't have spawn protection
            if (distance <= NIGHT_MONSTER_ATTACK_RANGE && !this.hasSpawnProtection(nearestPlayer.id)) {
                const now = Date.now();
                const cooldowns = this.monsterAttackCooldowns.get(monster.id);
                if (cooldowns) {
                    const lastAttackTime = cooldowns.get(nearestPlayer.id) || 0;
                    if (now - lastAttackTime >= NIGHT_MONSTER_ATTACK_COOLDOWN) {
                        cooldowns.set(nearestPlayer.id, now);
                        // Update player health
                        nearestPlayer.health = Math.max(0, nearestPlayer.health - NIGHT_MONSTER_DAMAGE);
                        if (nearestPlayer.health <= 0) {
                            nearestPlayer.isDead = true;
                            nearestPlayer.health = 0;
                        }
                        // Broadcast damage
                        this.io.emit('playerDamaged', {
                            playerId: nearestPlayer.id,
                            damage: NIGHT_MONSTER_DAMAGE
                        });
                    }
                }
            }
            // Move towards player
            if (distance > 0.1) {
                const moveDistance = NIGHT_MONSTER_SPEED * (deltaTime / 1000);
                const dirX = dx / distance;
                const dirZ = dz / distance;
                const newX = monster.position.x + dirX * moveDistance;
                const newZ = monster.position.z + dirZ * moveDistance;
                // Check collision with blocks and handle breaking
                const finalPos = this.checkBlockCollisionAndBreak(monster, newX, newZ);
                monster.position.x = finalPos.x;
                monster.position.z = finalPos.z;
                monster.rotationY = Math.atan2(dirX, dirZ);
            }
            // Keep at ground level
            monster.position.y = 1.0;
        }
    }
    /**
     * Check collision with blocks, handle breaking, and adjust monster position
     */
    checkBlockCollisionAndBreak(monster, newX, newZ) {
        const blockSize = 1.0;
        const monsterRadius = 0.5; // Night monster collision radius (smaller than big monster)
        const monsterY = monster.position.y;
        const monsterHeight = 1.5; // Night monster height
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
                    console.log(`Night monster broke block at (${blockX}, ${blockY}, ${blockZ})`);
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
    damageMonster(monsterId, damage) {
        const monster = this.monsters.get(monsterId);
        if (!monster || !monster.isAlive) {
            return false;
        }
        monster.health = Math.max(0, monster.health - damage);
        if (monster.health <= 0) {
            monster.isAlive = false;
            monster.health = 0;
            // Broadcast death
            this.io.emit('nightMonsterDied', monsterId);
            return true;
        }
        else {
            // Broadcast health update
            this.io.emit('nightMonsterHealthUpdate', {
                id: monsterId,
                health: monster.health,
                maxHealth: monster.maxHealth
            });
            return false;
        }
    }
    getAllNightMonsters() {
        return Array.from(this.monsters.values()).filter(m => m.isAlive);
    }
    dispose() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}
