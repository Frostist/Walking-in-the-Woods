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
const players = new Map();
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
        rotationY: 0
    };
    players.set(socket.id, playerState);
    // Send current game time to newly connected player
    const currentGameTime = Date.now() - gameStartTime;
    socket.emit('gameTime', currentGameTime);
    // Send current players to newly connected player
    const allPlayers = Array.from(players.values());
    socket.emit('players', allPlayers);
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
