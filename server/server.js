import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { generateTrees, generateGrass } from './TreeGenerator.js';
import { MonsterManager } from './MonsterManager.js';
import { DatabaseManager } from './DatabaseManager.js';
const app = express();
const httpServer = createServer(app);
// Configure CORS for Express API endpoints
app.use(cors({
    origin: "*", // Allow all origins (or specify your client URL in production)
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
}));
const io = new Server(httpServer, {
    cors: {
        origin: "*", // In production, specify your client URL
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'], // Allow both transports for Railway compatibility
    allowEIO3: true // Allow Engine.IO v3 clients
});
// Status endpoint - shows server is online and player count
app.get('/', (req, res) => {
    const playerCount = players.size;
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Game Server Status</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
                }
                h1 {
                    margin: 0 0 1rem 0;
                    font-size: 2.5rem;
                }
                .status {
                    font-size: 1.5rem;
                    margin: 1rem 0;
                }
                .status-indicator {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    background: #4ade80;
                    border-radius: 50%;
                    margin-right: 8px;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .player-count {
                    font-size: 3rem;
                    font-weight: bold;
                    margin: 1rem 0;
                    color: #fbbf24;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Game Server</h1>
                <div class="status">
                    <span class="status-indicator"></span>
                    Online
                </div>
                <div class="player-count">${playerCount}</div>
                <div style="font-size: 1.2rem; margin-top: 0.5rem;">
                    ${playerCount === 1 ? 'player' : 'players'} connected
                </div>
            </div>
        </body>
        </html>
    `);
});
// Store connected players
const players = new Map();
// Track last damager for each player (for kill attribution)
const lastDamager = new Map(); // playerId -> attackerId
// Initialize database manager
const dbManager = new DatabaseManager();
const blocks = new Map();
// Helper function to get block key
function getBlockKey(x, y, z) {
    return `${x},${y},${z}`;
}
// Initialize monster manager
const monsterManager = new MonsterManager(io, players);
// Generate trees once on server startup - all clients will see the same trees
const TREE_COUNT = 80;
const TREE_SPREAD = 60;
const TREE_SEED = 12345; // Fixed seed for deterministic generation
const trees = generateTrees(TREE_COUNT, TREE_SPREAD, TREE_SEED);
// Generate grass once on server startup - all clients will see the same grass
const GRASS_COUNT = 200;
const TERRAIN_SIZE = 200;
const GRASS_SEED = 54321; // Different seed from trees for variety
const grass = generateGrass(GRASS_COUNT, TERRAIN_SIZE, GRASS_SEED);
// Game time synchronization - tracks elapsed time for day/night cycle
// This ensures all players see the same sun/moon position
const CYCLE_DURATION = 300000; // 5 minutes in milliseconds (matches client)
let gameStartTime = Date.now();
// Broadcast game time to all clients every second
setInterval(() => {
    const gameTime = Date.now() - gameStartTime;
    io.emit('gameTime', gameTime);
}, 1000);
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    // Initialize player state
    const playerState = {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        health: 5, // 5 hearts
        maxHealth: 5,
        isDead: false
    };
    players.set(socket.id, playerState);
    // Send current game time to newly connected player
    const currentGameTime = Date.now() - gameStartTime;
    socket.emit('gameTime', currentGameTime);
    // Send tree data to newly connected player
    socket.emit('trees', trees);
    // Send grass data to newly connected player
    socket.emit('grass', grass);
    // Send current blocks to newly connected player
    const allBlocks = Array.from(blocks.values());
    socket.emit('blocks', allBlocks);
    // Send current players to newly connected player
    const allPlayers = Array.from(players.values());
    socket.emit('players', allPlayers);
    // Send current monster state to newly connected player
    const monsterState = monsterManager.getMonsterState();
    socket.emit('monsterUpdate', {
        position: monsterState.position,
        rotationY: monsterState.rotationY,
        health: monsterState.health,
        maxHealth: monsterState.maxHealth
    });
    // Send monster alive status
    if (monsterState.isAlive) {
        socket.emit('monsterHealthUpdate', {
            health: monsterState.health,
            maxHealth: monsterState.maxHealth
        });
    }
    else {
        socket.emit('monsterDied');
    }
    // Notify other players about new player
    socket.broadcast.emit('playerJoined', playerState);
    // Handle player position updates
    socket.on('playerUpdate', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.position = data.position;
            player.rotationY = data.rotationY;
            // Broadcast update to all other players
            socket.broadcast.emit('playerUpdate', {
                id: socket.id,
                position: data.position,
                rotationY: data.rotationY
            });
        }
    });
    // Handle bullet shot events
    socket.on('bulletShot', (bulletData) => {
        // Broadcast bullet to all other players
        socket.broadcast.emit('bulletShot', bulletData);
    });
    // Handle player damage events
    socket.on('playerDamaged', (data) => {
        // Track who dealt the damage (for kill attribution)
        if (data.targetPlayerId !== socket.id) {
            // Only track if it's not self-damage
            lastDamager.set(data.targetPlayerId, socket.id);
        }
        // Update player health on server
        const wasAlive = !monsterManager.isPlayerDead(data.targetPlayerId);
        monsterManager.updatePlayerHealth(data.targetPlayerId, data.damage);
        const isNowDead = monsterManager.isPlayerDead(data.targetPlayerId);
        // If player just died, record the kill
        if (wasAlive && isNowDead) {
            const killerId = lastDamager.get(data.targetPlayerId);
            if (killerId && killerId !== data.targetPlayerId) {
                // Record player kill
                dbManager.recordKill(killerId, 'player', data.targetPlayerId);
                // Notify all clients about the kill
                io.emit('playerKilled', {
                    killerId: killerId,
                    victimId: data.targetPlayerId
                });
            }
            // Clear the last damager for this player
            lastDamager.delete(data.targetPlayerId);
        }
        // Broadcast damage event to all players (including the damaged player for synchronization)
        io.emit('playerDamaged', {
            playerId: data.targetPlayerId,
            damage: data.damage
        });
    });
    // Handle player respawn
    socket.on('playerRespawned', () => {
        monsterManager.respawnPlayer(socket.id);
    });
    // Handle monster damage events
    socket.on('monsterDamaged', (data) => {
        const wasAlive = monsterManager.isMonsterAlive();
        const killed = monsterManager.damageMonster(data.damage, socket.id);
        // If monster just died, record the kill
        if (wasAlive && killed) {
            // Record monster kill
            dbManager.recordKill(socket.id, 'monster');
            // Notify all clients about the kill
            io.emit('monsterKilled', {
                killerId: socket.id
            });
        }
    });
    // Handle block placement
    socket.on('blockPlaced', (blockData) => {
        const key = getBlockKey(blockData.x, blockData.y, blockData.z);
        // Check if block already exists (prevent duplicates)
        if (!blocks.has(key)) {
            blocks.set(key, blockData);
            // Broadcast to all other players
            socket.broadcast.emit('blockPlaced', blockData);
        }
    });
    // Handle block removal
    socket.on('blockRemoved', (blockData) => {
        const key = getBlockKey(blockData.x, blockData.y, blockData.z);
        if (blocks.has(key)) {
            blocks.delete(key);
            // Broadcast to all other players
            socket.broadcast.emit('blockRemoved', blockData);
        }
    });
    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        players.delete(socket.id);
        // Clean up attack cooldown for this player
        monsterManager.cleanupPlayerCooldown(socket.id);
        // Notify other players
        io.emit('playerLeft', socket.id);
    });
});
// Add JSON body parser middleware (must be before routes)
app.use(express.json());
// Leaderboard API endpoint
app.get('/api/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = await dbManager.getLeaderboard(limit);
        res.json(leaderboard);
    }
    catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});
// Player stats API endpoint
app.get('/api/player/:playerId/stats', async (req, res) => {
    try {
        const { playerId } = req.params;
        const stats = await dbManager.getPlayerKills(playerId);
        res.json(stats);
    }
    catch (error) {
        console.error('Error fetching player stats:', error);
        res.status(500).json({ error: 'Failed to fetch player stats' });
    }
});
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
