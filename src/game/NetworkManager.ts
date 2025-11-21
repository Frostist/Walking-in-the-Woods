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

export interface TreeData {
    x: number;
    z: number;
    rotationY: number;
    scale: number;
}

export interface GrassData {
    x: number;
    z: number;
    y: number;
    rotationY: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
}

export interface BulletData {
    id: string;
    shooterId: string;
    position: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
    timestamp: number;
}

export interface BlockData {
    x: number;
    y: number;
    z: number;
    type: string;
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
    private trees: TreeData[] = [];
    private treesReceived: boolean = false;
    private onTreesReceivedCallback: ((trees: TreeData[]) => void) | null = null;
    private grass: GrassData[] = [];
    private grassReceived: boolean = false;
    private onGrassReceivedCallback: ((grass: GrassData[]) => void) | null = null;
    private onBulletReceivedCallback: ((bullet: BulletData) => void) | null = null;
    private onPlayerDamagedCallback: ((playerId: string, damage: number) => void) | null = null;
    private onMonsterUpdateCallback: ((position: { x: number; y: number; z: number }, rotationY: number, health: number, maxHealth: number) => void) | null = null;
    private onMonsterDiedCallback: (() => void) | null = null;
    private onMonsterRespawnedCallback: ((position: { x: number; y: number; z: number }, rotationY: number, health: number, maxHealth: number) => void) | null = null;
    private onMonsterHealthUpdateCallback: ((health: number, maxHealth: number) => void) | null = null;
    private onBlockPlacedCallback: ((blockData: BlockData) => void) | null = null;
    private onBlockRemovedCallback: ((blockData: BlockData) => void) | null = null;
    private blocks: BlockData[] = [];
    private blocksReceived: boolean = false;
    private onBlocksReceivedCallback: ((blocks: BlockData[]) => void) | null = null;

    constructor(serverUrl: string = 'http://localhost:3001') {
        this.serverUrl = serverUrl;
    }

    public connect(): void {
        if (this.socket) {
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
            this.isConnected = true;
            this.connectionStatus = ConnectionStatus.CONNECTED;
            this.connectionAttempts = 0;
        });

        this.socket.on('disconnect', (reason: string) => {
            this.isConnected = false;
            if (reason === 'io server disconnect') {
                // Server disconnected us, don't try to reconnect
                this.connectionStatus = ConnectionStatus.DISCONNECTED;
            } else {
                // Network error, will try to reconnect
                this.connectionStatus = ConnectionStatus.RECONNECTING;
            }
        });

        this.socket.on('connect_error', () => {
            this.connectionStatus = ConnectionStatus.RECONNECTING;
        });

        this.socket.on('reconnect_attempt', () => {
            this.connectionStatus = ConnectionStatus.RECONNECTING;
        });

        this.socket.on('reconnect', () => {
            this.isConnected = true;
            this.connectionStatus = ConnectionStatus.CONNECTED;
        });

        this.socket.on('reconnect_failed', () => {
            this.connectionStatus = ConnectionStatus.DISCONNECTED;
        });

        // Receive initial list of players
        this.socket.on('players', (players: PlayerUpdate[]) => {
            players.forEach(player => {
                this.addRemotePlayer(player);
            });
        });

        // Handle new player joining
        this.socket.on('playerJoined', (player: PlayerUpdate) => {
            this.addRemotePlayer(player);
        });

        // Handle player updates
        this.socket.on('playerUpdate', (update: PlayerUpdate) => {
            this.updateRemotePlayer(update);
        });

        // Handle player leaving
        this.socket.on('playerLeft', (playerId: string) => {
            this.removeRemotePlayer(playerId);
        });

        // Handle game time synchronization from server
        this.socket.on('gameTime', (serverTime: number) => {
            this.serverGameTime = serverTime;
            this.lastServerTimeUpdate = performance.now();
        });

        // Handle tree data from server
        this.socket.on('trees', (treeData: TreeData[]) => {
            this.trees = treeData;
            this.treesReceived = true;
            if (this.onTreesReceivedCallback) {
                this.onTreesReceivedCallback(treeData);
            }
        });

        // Handle grass data from server
        this.socket.on('grass', (grassData: GrassData[]) => {
            this.grass = grassData;
            this.grassReceived = true;
            if (this.onGrassReceivedCallback) {
                this.onGrassReceivedCallback(grassData);
            }
        });

        // Handle bullet creation from other players
        this.socket.on('bulletShot', (bulletData: BulletData) => {
            if (this.onBulletReceivedCallback) {
                this.onBulletReceivedCallback(bulletData);
            }
        });

        // Handle player damage events
        this.socket.on('playerDamaged', (data: { playerId: string; damage: number }) => {
            if (this.onPlayerDamagedCallback) {
                this.onPlayerDamagedCallback(data.playerId, data.damage);
            }
        });

        // Handle monster position updates from server
        this.socket.on('monsterUpdate', (data: { position: { x: number; y: number; z: number }; rotationY: number; health: number; maxHealth: number }) => {
            if (this.onMonsterUpdateCallback) {
                this.onMonsterUpdateCallback(data.position, data.rotationY, data.health, data.maxHealth);
            }
        });

        // Handle monster death
        this.socket.on('monsterDied', () => {
            if (this.onMonsterDiedCallback) {
                this.onMonsterDiedCallback();
            }
        });

        // Handle monster respawn
        this.socket.on('monsterRespawned', (data: { position: { x: number; y: number; z: number }; rotationY: number; health: number; maxHealth: number }) => {
            if (this.onMonsterRespawnedCallback) {
                this.onMonsterRespawnedCallback(data.position, data.rotationY, data.health, data.maxHealth);
            }
        });

        // Handle monster health updates
        this.socket.on('monsterHealthUpdate', (data: { health: number; maxHealth: number }) => {
            if (this.onMonsterHealthUpdateCallback) {
                this.onMonsterHealthUpdateCallback(data.health, data.maxHealth);
            }
        });

        // Handle block placement from other players
        this.socket.on('blockPlaced', (blockData: BlockData) => {
            if (this.onBlockPlacedCallback) {
                this.onBlockPlacedCallback(blockData);
            }
        });

        // Handle block removal from other players
        this.socket.on('blockRemoved', (blockData: BlockData) => {
            if (this.onBlockRemovedCallback) {
                this.onBlockRemovedCallback(blockData);
            }
        });

        // Handle initial blocks from server
        this.socket.on('blocks', (blocksData: BlockData[]) => {
            this.blocks = blocksData;
            this.blocksReceived = true;
            if (this.onBlocksReceivedCallback) {
                this.onBlocksReceivedCallback(blocksData);
            }
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

    /**
     * Get tree data from server. Returns empty array if not received yet.
     */
    public getTrees(): TreeData[] {
        return this.trees;
    }

    /**
     * Check if tree data has been received from server.
     */
    public hasTrees(): boolean {
        return this.treesReceived;
    }

    /**
     * Set callback to be called when tree data is received from server.
     */
    public onTreesReceived(callback: (trees: TreeData[]) => void): void {
        this.onTreesReceivedCallback = callback;
        // If trees already received, call callback immediately
        if (this.treesReceived) {
            callback(this.trees);
        }
    }

    /**
     * Get grass data from server. Returns empty array if not received yet.
     */
    public getGrass(): GrassData[] {
        return this.grass;
    }

    /**
     * Check if grass data has been received from server.
     */
    public hasGrass(): boolean {
        return this.grassReceived;
    }

    /**
     * Set callback to be called when grass data is received from server.
     */
    public onGrassReceived(callback: (grass: GrassData[]) => void): void {
        this.onGrassReceivedCallback = callback;
        // If grass already received, call callback immediately
        if (this.grassReceived) {
            callback(this.grass);
        }
    }

    /**
     * Send bullet shot event to server
     */
    public sendBulletShot(position: THREE.Vector3, direction: THREE.Vector3): void {
        if (!this.socket || !this.isConnected || !this.socket.id) {
            return;
        }

        const bulletData: BulletData = {
            id: `${this.socket.id}-${Date.now()}-${Math.random()}`,
            shooterId: this.socket.id,
            position: {
                x: position.x,
                y: position.y,
                z: position.z
            },
            direction: {
                x: direction.x,
                y: direction.y,
                z: direction.z
            },
            timestamp: Date.now()
        };

        this.socket.emit('bulletShot', bulletData);
    }

    /**
     * Set callback to be called when a bullet is received from another player
     */
    public onBulletReceived(callback: (bullet: BulletData) => void): void {
        this.onBulletReceivedCallback = callback;
    }

    /**
     * Send player damage event to server
     */
    public sendPlayerDamaged(targetPlayerId: string, damage: number): void {
        if (!this.socket || !this.isConnected) {
            return;
        }

        this.socket.emit('playerDamaged', {
            targetPlayerId: targetPlayerId,
            damage: damage
        });
    }

    /**
     * Set callback to be called when a player takes damage
     */
    public onPlayerDamaged(callback: (playerId: string, damage: number) => void): void {
        this.onPlayerDamagedCallback = callback;
    }

    /**
     * Set callback to be called when monster position is updated from server
     */
    public onMonsterUpdate(callback: (position: { x: number; y: number; z: number }, rotationY: number, health: number, maxHealth: number) => void): void {
        this.onMonsterUpdateCallback = callback;
    }

    /**
     * Set callback to be called when monster dies
     */
    public onMonsterDied(callback: () => void): void {
        this.onMonsterDiedCallback = callback;
    }

    /**
     * Set callback to be called when monster respawns
     */
    public onMonsterRespawned(callback: (position: { x: number; y: number; z: number }, rotationY: number, health: number, maxHealth: number) => void): void {
        this.onMonsterRespawnedCallback = callback;
    }

    /**
     * Set callback to be called when monster health updates
     */
    public onMonsterHealthUpdate(callback: (health: number, maxHealth: number) => void): void {
        this.onMonsterHealthUpdateCallback = callback;
    }

    /**
     * Send monster damage event to server
     */
    public sendMonsterDamaged(damage: number): void {
        if (!this.socket || !this.isConnected) {
            return;
        }

        this.socket.emit('monsterDamaged', {
            damage: damage
        });
    }

    /**
     * Notify server that player has respawned
     */
    public sendPlayerRespawned(): void {
        if (!this.socket || !this.isConnected) {
            return;
        }

        this.socket.emit('playerRespawned');
    }

    /**
     * Send block placement to server
     */
    public sendBlockPlaced(blockData: BlockData): void {
        if (!this.socket || !this.isConnected) {
            return;
        }

        this.socket.emit('blockPlaced', blockData);
    }

    /**
     * Send block removal to server
     */
    public sendBlockRemoved(blockData: BlockData): void {
        if (!this.socket || !this.isConnected) {
            return;
        }

        this.socket.emit('blockRemoved', blockData);
    }

    /**
     * Set callback to be called when a block is placed by another player
     */
    public onBlockPlaced(callback: (blockData: BlockData) => void): void {
        this.onBlockPlacedCallback = callback;
    }

    /**
     * Set callback to be called when a block is removed by another player
     */
    public onBlockRemoved(callback: (blockData: BlockData) => void): void {
        this.onBlockRemovedCallback = callback;
    }

    /**
     * Get blocks data from server. Returns empty array if not received yet.
     */
    public getBlocks(): BlockData[] {
        return this.blocks;
    }

    /**
     * Check if blocks data has been received from server.
     */
    public hasBlocks(): boolean {
        return this.blocksReceived;
    }

    /**
     * Set callback to be called when blocks data is received from server.
     */
    public onBlocksReceived(callback: (blocks: BlockData[]) => void): void {
        this.onBlocksReceivedCallback = callback;
        // If blocks already received, call callback immediately
        if (this.blocksReceived) {
            callback(this.blocks);
        }
    }
}

