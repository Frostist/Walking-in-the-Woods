const ENEMY_UPDATE_INTERVAL = 50; // Update every 50ms (20 times per second)
const ATTACK_RANGE_MELEE = 1.5;
const ATTACK_RANGE_RANGED = 15;
const ATTACK_RANGE_MINIBOSS = 5;
const PROJECTILE_SPEED = 8;
const GRAVITY = -20;
export class EnemyManager {
    constructor(io, players, enemyConfigs, spawnPoints) {
        this.enemies = new Map();
        this.updateInterval = null;
        this.lastUpdate = Date.now();
        this.nextEnemyId = 0;
        this.projectiles = new Map();
        this.nextProjectileId = 0;
        this.io = io;
        this.players = players;
        this.enemyConfigs = enemyConfigs;
        this.spawnPoints = spawnPoints;
        this.startUpdateLoop();
    }
    startUpdateLoop() {
        this.updateInterval = setInterval(() => {
            const now = Date.now();
            const deltaTime = (now - this.lastUpdate) / 1000; // Convert to seconds
            this.lastUpdate = now;
            this.updateEnemies(deltaTime);
            this.updateProjectiles(deltaTime);
            // Broadcast enemy states to all clients
            const enemyStates = Array.from(this.enemies.values()).filter(e => !e.isDead);
            this.io.emit('enemiesUpdate', enemyStates);
            // Broadcast projectile states
            const projectileStates = Array.from(this.projectiles.values());
            this.io.emit('projectilesUpdate', projectileStates);
        }, ENEMY_UPDATE_INTERVAL);
    }
    updateEnemies(deltaTime) {
        const aliveEnemies = Array.from(this.enemies.values()).filter(e => !e.isDead);
        for (const enemy of aliveEnemies) {
            const config = this.enemyConfigs.get(enemy.type);
            if (!config)
                continue;
            // Find nearest player
            const nearestPlayer = this.findNearestPlayer(enemy.position);
            if (!nearestPlayer)
                continue;
            const dx = nearestPlayer.position.x - enemy.position.x;
            const dz = nearestPlayer.position.z - enemy.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            // Update cooldowns
            enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaTime);
            enemy.projectileCooldown = Math.max(0, enemy.projectileCooldown - deltaTime);
            // AI behavior based on type
            if (config.ai === 'melee' || config.ai === 'meleeChase') {
                this.updateMeleeEnemy(enemy, config, nearestPlayer, distance, deltaTime);
            }
            else if (config.ai === 'ranged' || config.ai === 'rangedKite') {
                this.updateRangedEnemy(enemy, config, nearestPlayer, distance, deltaTime);
            }
            else if (config.ai === 'miniboss') {
                this.updateMiniBoss(enemy, config, nearestPlayer, distance, deltaTime);
            }
            // Update position
            enemy.position.x += enemy.velocity.x * deltaTime;
            enemy.position.z += enemy.velocity.z * deltaTime;
            // Keep at ground level
            enemy.position.y = 0.8; // Enemy height offset
            // Update rotation to face player
            if (distance > 0.1) {
                enemy.rotationY = Math.atan2(dx, dz);
            }
            // Decay velocity
            enemy.velocity.x *= 0.7;
            enemy.velocity.z *= 0.7;
        }
    }
    updateMeleeEnemy(enemy, config, player, distance, deltaTime) {
        if (player.isDead)
            return;
        const dx = player.position.x - enemy.position.x;
        const dz = player.position.z - enemy.position.z;
        const dirX = dx / Math.max(distance, 0.1);
        const dirZ = dz / Math.max(distance, 0.1);
        // Chase player
        enemy.velocity.x = dirX * config.speed;
        enemy.velocity.z = dirZ * config.speed;
        // Attack if close
        if (distance < ATTACK_RANGE_MELEE && enemy.attackCooldown <= 0) {
            enemy.attackCooldown = 1.0;
            this.damagePlayer(player.id, config.dmg);
        }
    }
    updateRangedEnemy(enemy, config, player, distance, deltaTime) {
        if (player.isDead)
            return;
        const dx = player.position.x - enemy.position.x;
        const dz = player.position.z - enemy.position.z;
        const dirX = dx / Math.max(distance, 0.1);
        const dirZ = dz / Math.max(distance, 0.1);
        // Keep distance (8-12m)
        if (distance < 8) {
            // Move away
            enemy.velocity.x = -dirX * config.speed;
            enemy.velocity.z = -dirZ * config.speed;
        }
        else if (distance > 12) {
            // Move closer
            enemy.velocity.x = dirX * config.speed;
            enemy.velocity.z = dirZ * config.speed;
        }
        else {
            enemy.velocity.x = 0;
            enemy.velocity.z = 0;
        }
        // Fire projectile
        if (distance >= 8 && distance <= ATTACK_RANGE_RANGED &&
            enemy.projectileCooldown <= 0 && config.proj) {
            this.fireProjectile(enemy, player, config);
            enemy.projectileCooldown = config.proj.cooldown;
        }
    }
    updateMiniBoss(enemy, config, player, distance, deltaTime) {
        if (player.isDead)
            return;
        const dx = player.position.x - enemy.position.x;
        const dz = player.position.z - enemy.position.z;
        const dirX = dx / Math.max(distance, 0.1);
        const dirZ = dz / Math.max(distance, 0.1);
        // Slow chase
        enemy.velocity.x = dirX * config.speed;
        enemy.velocity.z = dirZ * config.speed;
        // Periodic ground slam
        if (enemy.attackCooldown <= 0 && distance < ATTACK_RANGE_MINIBOSS) {
            enemy.attackCooldown = 3.0;
            this.damagePlayer(player.id, config.dmg * 2);
        }
    }
    fireProjectile(enemy, target, config) {
        const dx = target.position.x - enemy.position.x;
        const dz = target.position.z - enemy.position.z;
        const dy = target.position.y - enemy.position.y;
        const distance = Math.sqrt(dx * dx + dz * dz + dy * dy);
        const dirX = dx / Math.max(distance, 0.1);
        const dirY = dy / Math.max(distance, 0.1);
        const dirZ = dz / Math.max(distance, 0.1);
        const projectileId = `proj_${this.nextProjectileId++}`;
        const projectile = {
            id: projectileId,
            position: {
                x: enemy.position.x,
                y: enemy.position.y + 1,
                z: enemy.position.z
            },
            velocity: {
                x: dirX * (config.proj?.speed || PROJECTILE_SPEED),
                y: dirY * (config.proj?.speed || PROJECTILE_SPEED),
                z: dirZ * (config.proj?.speed || PROJECTILE_SPEED)
            },
            ownerId: enemy.id,
            damage: config.dmg,
            lifetime: 5.0 // 5 seconds max lifetime
        };
        this.projectiles.set(projectileId, projectile);
    }
    updateProjectiles(deltaTime) {
        const projectilesToRemove = [];
        for (const [id, projectile] of this.projectiles.entries()) {
            // Update position
            projectile.position.x += projectile.velocity.x * deltaTime;
            projectile.position.y += projectile.velocity.y * deltaTime;
            projectile.position.z += projectile.velocity.z * deltaTime;
            // Apply gravity
            projectile.velocity.y += GRAVITY * deltaTime;
            // Check collision with players
            for (const [playerId, player] of this.players.entries()) {
                if (player.isDead)
                    continue;
                const dx = player.position.x - projectile.position.x;
                const dy = player.position.y - projectile.position.y;
                const dz = player.position.z - projectile.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (distance < 0.5) {
                    // Hit player
                    this.damagePlayer(playerId, projectile.damage);
                    projectilesToRemove.push(id);
                    break;
                }
            }
            // Remove if out of bounds or lifetime expired
            projectile.lifetime -= deltaTime;
            if (projectile.lifetime <= 0 ||
                Math.abs(projectile.position.x) > 50 ||
                Math.abs(projectile.position.z) > 50 ||
                projectile.position.y < -10) {
                projectilesToRemove.push(id);
            }
        }
        // Remove expired projectiles
        for (const id of projectilesToRemove) {
            this.projectiles.delete(id);
        }
    }
    findNearestPlayer(enemyPos) {
        let nearestPlayer = null;
        let nearestDistance = Infinity;
        for (const player of this.players.values()) {
            if (player.isDead)
                continue;
            const dx = player.position.x - enemyPos.x;
            const dz = player.position.z - enemyPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = player;
            }
        }
        return nearestPlayer;
    }
    damagePlayer(playerId, damage) {
        const player = this.players.get(playerId);
        if (!player || player.isDead)
            return;
        // Emit damage event to all clients
        this.io.emit('playerDamaged', {
            playerId,
            damage
        });
    }
    spawnEnemy(type, position) {
        const config = this.enemyConfigs.get(type);
        if (!config) {
            throw new Error(`Unknown enemy type: ${type}`);
        }
        const enemyId = `enemy_${this.nextEnemyId++}`;
        const enemy = {
            id: enemyId,
            type,
            position: { ...position, y: 0.8 },
            rotationY: 0,
            health: config.hp,
            maxHealth: config.hp,
            isDead: false,
            velocity: { x: 0, y: 0, z: 0 },
            attackCooldown: 0,
            projectileCooldown: 0
        };
        this.enemies.set(enemyId, enemy);
        // Broadcast spawn to all clients
        this.io.emit('enemySpawned', {
            id: enemyId,
            type,
            position: enemy.position,
            health: enemy.health,
            maxHealth: enemy.maxHealth
        });
        return enemyId;
    }
    damageEnemy(enemyId, damage, attackerId) {
        const enemy = this.enemies.get(enemyId);
        if (!enemy || enemy.isDead)
            return false;
        enemy.health = Math.max(0, enemy.health - damage);
        if (enemy.health <= 0) {
            enemy.isDead = true;
            // Broadcast death
            this.io.emit('enemyDied', {
                id: enemyId,
                killerId: attackerId
            });
            // Remove after a short delay
            setTimeout(() => {
                this.enemies.delete(enemyId);
            }, 1000);
            return true; // Enemy was killed
        }
        else {
            // Broadcast health update
            this.io.emit('enemyHealthUpdate', {
                id: enemyId,
                health: enemy.health,
                maxHealth: enemy.maxHealth
            });
            return false;
        }
    }
    getEnemyState(enemyId) {
        return this.enemies.get(enemyId);
    }
    getAllEnemies() {
        return Array.from(this.enemies.values()).filter(e => !e.isDead);
    }
    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.enemies.clear();
        this.projectiles.clear();
    }
}
