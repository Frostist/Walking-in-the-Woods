import { Server } from 'socket.io';

// Player state interface
export interface PlayerState {
    id: string;
    position: { x: number; y: number; z: number };
    rotationY: number;
    health: number;
    maxHealth: number;
    isDead: boolean;
    name?: string;
}

// Night monster state
interface NightMonsterState {
    id: string;
    position: { x: number; y: number; z: number };
    rotationY: number;
    health: number;
    maxHealth: number;
    isAlive: boolean;
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

export class NightMonsterManager {
    private monsters: Map<string, NightMonsterState> = new Map();
    private monsterAttackCooldowns: Map<string, Map<string, number>> = new Map(); // monsterId -> playerId -> lastAttackTime
    private io: Server;
    private players: Map<string, PlayerState>;
    private updateInterval: NodeJS.Timeout | null = null;
    private lastMonsterUpdate: number = Date.now();
    private isNight: boolean = false;
    private lastDayNightCheck: number = Date.now();
    private nextMonsterId: number = 0;

    constructor(io: Server, players: Map<string, PlayerState>) {
        this.io = io;
        this.players = players;
        this.startUpdateLoop();
    }

    private startUpdateLoop(): void {
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

    private checkDayNightCycle(currentTime: number): void {
        const CYCLE_DURATION = 300000; // 5 minutes
        const cycleProgress = (currentTime % CYCLE_DURATION) / CYCLE_DURATION;
        
        // Calculate sun position
        const sunAngle = (cycleProgress * Math.PI * 2) - Math.PI / 2;
        const sunY = Math.sin(sunAngle) * 150; // Same radius as client
        const sunHeightNormalized = Math.max(0, Math.min(1, (sunY + 10) / 20));
        
        // Day when sun is above 0.3 normalized height
        const wasNight = this.isNight;
        this.isNight = sunHeightNormalized <= 0.3;
        
        // If transitioning from day to night, spawn monsters
        if (!wasNight && this.isNight) {
            this.spawnNightMonsters();
        }
        
        // If transitioning from night to day, kill all monsters
        if (wasNight && !this.isNight) {
            this.killAllMonsters();
        }
    }

    private spawnNightMonsters(): void {
        // Spawn a random number of monsters between MIN and MAX
        const spawnCount = Math.floor(Math.random() * (MAX_NIGHT_MONSTERS - MIN_NIGHT_MONSTERS + 1)) + MIN_NIGHT_MONSTERS;
        
        for (let i = 0; i < spawnCount; i++) {
            // Distribute monsters around a circle with some randomness
            const angle = (Math.PI * 2 * i) / spawnCount + (Math.random() - 0.5) * 0.5; // Add some randomness to angle
            const distance = 15 + Math.random() * (NIGHT_MONSTER_SPAWN_RADIUS - 15);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            
            const monsterId = `night_monster_${this.nextMonsterId++}`;
            const monster: NightMonsterState = {
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

    private killAllMonsters(): void {
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
    }

    private findNearestPlayer(monsterPos: { x: number; y: number; z: number }): PlayerState | null {
        if (this.players.size === 0) {
            return null;
        }
        
        let nearestPlayer: PlayerState | null = null;
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

    private updateMonsters(deltaTime: number): void {
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
            if (distance <= NIGHT_MONSTER_ATTACK_RANGE) {
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
                
                monster.position.x += dirX * moveDistance;
                monster.position.z += dirZ * moveDistance;
                monster.rotationY = Math.atan2(dirX, dirZ);
            }
            
            // Keep at ground level
            monster.position.y = 1.0;
        }
    }

    public damageMonster(monsterId: string, damage: number): boolean {
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
        } else {
            // Broadcast health update
            this.io.emit('nightMonsterHealthUpdate', {
                id: monsterId,
                health: monster.health,
                maxHealth: monster.maxHealth
            });
            return false;
        }
    }

    public getAllNightMonsters(): NightMonsterState[] {
        return Array.from(this.monsters.values()).filter(m => m.isAlive);
    }

    public dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

