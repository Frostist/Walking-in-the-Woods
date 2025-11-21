import * as pg from 'pg';
const { Pool } = pg;

export interface KillRecord {
    id: number;
    player_id: string;
    kill_type: 'player' | 'monster';
    victim_id?: string; // For player kills, the ID of the killed player
    timestamp: Date;
}

export interface LeaderboardEntry {
    player_id: string;
    total_kills: number;
    player_kills: number;
    monster_kills: number;
}

export class DatabaseManager {
    private pool: pg.Pool;

    constructor() {
        // Get database connection string from environment variable
        const connectionString = process.env.DATABASE_URL || 
            `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'game'}`;
        
        this.pool = new Pool({
            connectionString: connectionString,
            ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
        });

        // Initialize database schema
        this.initializeSchema();
    }

    private async initializeSchema(): Promise<void> {
        try {
            // Create kills table if it doesn't exist
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS kills (
                    id SERIAL PRIMARY KEY,
                    player_id VARCHAR(255) NOT NULL,
                    kill_type VARCHAR(20) NOT NULL CHECK (kill_type IN ('player', 'monster')),
                    victim_id VARCHAR(255),
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create index on player_id for faster leaderboard queries
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_kills_player_id ON kills(player_id)
            `);

            // Create index on timestamp for time-based queries
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_kills_timestamp ON kills(timestamp)
            `);

            console.log('Database schema initialized successfully');
        } catch (error) {
            console.error('Error initializing database schema:', error);
            // Don't throw - allow server to continue even if DB setup fails
        }
    }

    /**
     * Record a kill in the database
     */
    public async recordKill(playerId: string, killType: 'player' | 'monster', victimId?: string): Promise<void> {
        try {
            await this.pool.query(
                'INSERT INTO kills (player_id, kill_type, victim_id) VALUES ($1, $2, $3)',
                [playerId, killType, victimId || null]
            );
        } catch (error) {
            console.error('Error recording kill:', error);
            // Don't throw - allow game to continue even if DB write fails
        }
    }

    /**
     * Get leaderboard with total kills (players + monsters combined)
     */
    public async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
        try {
            const result = await this.pool.query(`
                SELECT 
                    player_id,
                    COUNT(*) as total_kills,
                    COUNT(*) FILTER (WHERE kill_type = 'player') as player_kills,
                    COUNT(*) FILTER (WHERE kill_type = 'monster') as monster_kills
                FROM kills
                GROUP BY player_id
                ORDER BY total_kills DESC
                LIMIT $1
            `, [limit]);

            return result.rows.map((row: any) => ({
                player_id: row.player_id,
                total_kills: parseInt(row.total_kills),
                player_kills: parseInt(row.player_kills),
                monster_kills: parseInt(row.monster_kills)
            }));
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            return [];
        }
    }

    /**
     * Get kill count for a specific player
     */
    public async getPlayerKills(playerId: string): Promise<{ total: number; players: number; monsters: number }> {
        try {
            const result = await this.pool.query(`
                SELECT 
                    COUNT(*) as total_kills,
                    COUNT(*) FILTER (WHERE kill_type = 'player') as player_kills,
                    COUNT(*) FILTER (WHERE kill_type = 'monster') as monster_kills
                FROM kills
                WHERE player_id = $1
            `, [playerId]);

            if (result.rows.length === 0) {
                return { total: 0, players: 0, monsters: 0 };
            }

            const row = result.rows[0];
            return {
                total: parseInt(row.total_kills),
                players: parseInt(row.player_kills),
                monsters: parseInt(row.monster_kills)
            };
        } catch (error) {
            console.error('Error fetching player kills:', error);
            return { total: 0, players: 0, monsters: 0 };
        }
    }

    /**
     * Close database connection pool
     */
    public async close(): Promise<void> {
        await this.pool.end();
    }
}

