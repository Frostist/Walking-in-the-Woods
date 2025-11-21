import { io, Socket } from 'socket.io-client';
import { eventBus } from '../app/EventBus';

export interface EnemyState {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  health: number;
  maxHealth: number;
  isDead: boolean;
  velocity: { x: number; y: number; z: number };
}

export interface ProjectileState {
  id: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  ownerId: string;
  damage: number;
}

export class NetworkManager {
  private socket: Socket | null = null;
  private connected: boolean = false;
  private serverUrl: string;

  constructor(serverUrl: string = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
  }

  connect(): void {
    if (this.socket) {
      this.disconnect();
    }

    this.socket = io(this.serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Connected to game server');
      this.connected = true;
      eventBus.emit('network/connected', {});
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from game server');
      this.connected = false;
      eventBus.emit('network/disconnected', {});
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      eventBus.emit('network/error', { error });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.socket?.connected === true;
  }

  // Player updates
  sendPlayerUpdate(position: { x: number; y: number; z: number }, rotationY: number): void {
    if (this.socket && this.connected) {
      this.socket.emit('playerUpdate', { position, rotationY });
    }
  }

  // Enemy damage
  sendEnemyDamage(enemyId: string, damage: number, element?: string): void {
    if (this.socket && this.connected) {
      this.socket.emit('enemyDamaged', { enemyId, damage, element });
    }
  }

  // Wave control
  sendStartWave(waveIndex: number): void {
    if (this.socket && this.connected) {
      this.socket.emit('startWave', { waveIndex });
    }
  }

  // Event listeners
  onEnemiesUpdate(callback: (enemies: EnemyState[]) => void): void {
    if (this.socket) {
      this.socket.on('enemiesUpdate', callback);
    }
  }

  onEnemySpawned(callback: (data: { id: string; type: string; position: { x: number; y: number; z: number }; health: number; maxHealth: number }) => void): void {
    if (this.socket) {
      this.socket.on('enemySpawned', callback);
    }
  }

  onEnemyDied(callback: (data: { id: string; killerId?: string }) => void): void {
    if (this.socket) {
      this.socket.on('enemyDied', callback);
    }
  }

  onEnemyHealthUpdate(callback: (data: { id: string; health: number; maxHealth: number }) => void): void {
    if (this.socket) {
      this.socket.on('enemyHealthUpdate', callback);
    }
  }

  onProjectilesUpdate(callback: (projectiles: ProjectileState[]) => void): void {
    if (this.socket) {
      this.socket.on('projectilesUpdate', callback);
    }
  }

  onGameStateUpdate(callback: (data: { state: string; wave?: number }) => void): void {
    if (this.socket) {
      this.socket.on('gameStateUpdate', callback);
    }
  }

  onWaveStarted(callback: (data: { wave: number }) => void): void {
    if (this.socket) {
      this.socket.on('waveStarted', callback);
    }
  }

  onEnemyKilled(callback: (data: { enemyId: string; killerId: string }) => void): void {
    if (this.socket) {
      this.socket.on('enemyKilled', callback);
    }
  }

  onPlayerDamaged(callback: (data: { playerId: string; damage: number }) => void): void {
    if (this.socket) {
      this.socket.on('playerDamaged', callback);
    }
  }

  // Remove all listeners
  removeAllListeners(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

