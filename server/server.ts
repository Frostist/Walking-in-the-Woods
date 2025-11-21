import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // In production, specify your client URL
        methods: ["GET", "POST"]
    }
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
interface PlayerState {
    id: string;
    position: { x: number; y: number; z: number };
    rotationY: number;
}

const players: Map<string, PlayerState> = new Map();

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Initialize player state
    const playerState: PlayerState = {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0
    };
    players.set(socket.id, playerState);
    
    // Send current players to newly connected player
    const allPlayers = Array.from(players.values());
    socket.emit('players', allPlayers);
    
    // Notify other players about new player
    socket.broadcast.emit('playerJoined', playerState);
    
    // Handle player position updates
    socket.on('playerUpdate', (data: { position: { x: number; y: number; z: number }; rotationY: number }) => {
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
    
    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        players.delete(socket.id);
        
        // Notify other players
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

