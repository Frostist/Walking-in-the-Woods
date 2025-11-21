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

export enum ConnectionStatus {
    DISCONNECTED = 'disconnected',  // Red - Not connected at all
    CONNECTING = 'connecting',        // Yellow - Trying to connect
    CONNECTED = 'connected',         // Green - Successfully connected
    RECONNECTING = 'reconnecting'    // Yellow - Lost connection, trying to reconnect
}

export class NetworkManager {
    private socket: Socket | null = null;
    private isConnected: boolean = false;
    private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
    private remotePlayers: Map<string, RemotePlayerData> = new Map();
    private updateInterval: number = 33; // ~30fps (33ms)
    private lastUpdateTime: number = 0;
    private serverUrl: string;
    private connectionAttempts: number = 0;
    private serverGameTime: number = 0; // Server-synchronized game time in milliseconds
    private lastServerTimeUpdate: number = 0; // Local timestamp when we last received server time

    constructor(serverUrl: string = 'http://localhost:3001') {
        this.serverUrl = serverUrl;
        console.log('NetworkManager initialized with server URL:', serverUrl);
    }

    public connect(): void {
        if (this.socket) {
            console.warn('Already connected to server');
            return;
        }

        this.connectionStatus = ConnectionStatus.CONNECTING;
        this.connectionAttempts++;
        this.socket = io(this.serverUrl, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
            upgrade: true, // Allow transport upgrades
            rememberUpgrade: true // Remember successful transport upgrades
        });

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.connectionStatus = ConnectionStatus.CONNECTED;
            this.connectionAttempts = 0;
        });

        this.socket.on('disconnect', (reason: string) => {
            console.log('Disconnected from server:', reason);
            this.isConnected = false;
            if (reason === 'io server disconnect') {
                // Server disconnected us, don't try to reconnect
                this.connectionStatus = ConnectionStatus.DISCONNECTED;
            } else {
                // Network error, will try to reconnect
                this.connectionStatus = ConnectionStatus.RECONNECTING;
            }
        });

        this.socket.on('connect_error', (error: Error) => {
            console.error('Connection error:', error);
            console.error('Attempting to connect to:', this.serverUrl);
            this.connectionStatus = ConnectionStatus.RECONNECTING;
        });

        this.socket.on('reconnect_attempt', () => {
            console.log('Attempting to reconnect...');
            this.connectionStatus = ConnectionStatus.RECONNECTING;
        });

        this.socket.on('reconnect', () => {
            console.log('Reconnected to server');
            this.isConnected = true;
            this.connectionStatus = ConnectionStatus.CONNECTED;
        });

        this.socket.on('reconnect_failed', () => {
            console.error('Failed to reconnect');
            this.connectionStatus = ConnectionStatus.DISCONNECTED;
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

        // Handle game time synchronization from server
        this.socket.on('gameTime', (serverTime: number) => {
            this.serverGameTime = serverTime;
            this.lastServerTimeUpdate = performance.now();
        });
    }

    public disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.connectionStatus = ConnectionStatus.DISCONNECTED;
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

    public getConnectionStatus(): ConnectionStatus {
        return this.connectionStatus;
    }

    public getPlayerId(): string | null {
        return this.socket?.id || null;
    }

    /**
     * Get the current synchronized game time from the server.
     * If we haven't received a server update yet, returns 0.
     * Otherwise, extrapolates the current time based on the last server update.
     */
    public getServerGameTime(): number {
        if (this.serverGameTime === 0 || this.lastServerTimeUpdate === 0) {
            return 0; // Haven't received server time yet
        }
        
        // Extrapolate current time based on elapsed time since last server update
        const timeSinceLastUpdate = performance.now() - this.lastServerTimeUpdate;
        return this.serverGameTime + timeSinceLastUpdate;
    }
}

