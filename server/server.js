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
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    // Initialize player state
    const playerState = {
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
