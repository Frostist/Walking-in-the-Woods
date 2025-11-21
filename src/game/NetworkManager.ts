import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';

export interface PlayerUpdate {
    id: string;
    position: { x: number; y: number; z: number };
    rotationY: number;
}

export interface RemotePlayerData {
    id: string;
    position: THREE.Vector3;
    rotationY: number;
    lastUpdateTime: number;
}

export class NetworkManager {
    private socket: Socket | null = null;
    private isConnected: boolean = false;
    private remotePlayers: Map<string, RemotePlayerData> = new Map();
    private updateInterval: number = 33; // ~30fps (33ms)
    private lastUpdateTime: number = 0;
    private serverUrl: string;

    constructor(serverUrl: string = 'http://localhost:3001') {
        this.serverUrl = serverUrl;
    }

    public connect(): void {
        if (this.socket) {
            console.warn('Already connected to server');
            return;
        }

        this.socket = io(this.serverUrl);

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
        });

        // Receive initial list of players
        this.socket.on('players', (players: PlayerUpdate[]) => {
            console.log(`Received ${players.length} existing players`);
            players.forEach(player => {
                this.addRemotePlayer(player);
            });
        });

        // Handle new player joining
        this.socket.on('playerJoined', (player: PlayerUpdate) => {
            console.log(`Player joined: ${player.id}`);
            this.addRemotePlayer(player);
        });

        // Handle player updates
        this.socket.on('playerUpdate', (update: PlayerUpdate) => {
            this.updateRemotePlayer(update);
        });

        // Handle player leaving
        this.socket.on('playerLeft', (playerId: string) => {
            console.log(`Player left: ${playerId}`);
            this.removeRemotePlayer(playerId);
        });
    }

    public disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.remotePlayers.clear();
        }
    }

    public sendPlayerUpdate(position: THREE.Vector3, rotationY: number): void {
        if (!this.socket || !this.isConnected) {
            return;
        }

        const now = performance.now();
        // Throttle updates to ~30fps
        if (now - this.lastUpdateTime < this.updateInterval) {
            return;
        }
        this.lastUpdateTime = now;

        this.socket.emit('playerUpdate', {
            position: {
                x: position.x,
                y: position.y,
                z: position.z
            },
            rotationY: rotationY
        });
    }

    private addRemotePlayer(player: PlayerUpdate): void {
        const remotePlayer: RemotePlayerData = {
            id: player.id,
            position: new THREE.Vector3(player.position.x, player.position.y, player.position.z),
            rotationY: player.rotationY,
            lastUpdateTime: performance.now()
        };
        this.remotePlayers.set(player.id, remotePlayer);
    }

    private updateRemotePlayer(update: PlayerUpdate): void {
        const remotePlayer = this.remotePlayers.get(update.id);
        if (remotePlayer) {
            remotePlayer.position.set(update.position.x, update.position.y, update.position.z);
            remotePlayer.rotationY = update.rotationY;
            remotePlayer.lastUpdateTime = performance.now();
        }
    }

    private removeRemotePlayer(playerId: string): void {
        this.remotePlayers.delete(playerId);
    }

    public getRemotePlayers(): Map<string, RemotePlayerData> {
        return this.remotePlayers;
    }

    public isConnectedToServer(): boolean {
        return this.isConnected;
    }

    public getPlayerId(): string | null {
        return this.socket?.id || null;
    }
}

