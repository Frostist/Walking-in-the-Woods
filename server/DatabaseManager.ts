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
    player_name: string | null;
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

            // Create player_names table if it doesn't exist
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS player_names (
                    id SERIAL PRIMARY KEY,
                    player_id VARCHAR(255) NOT NULL UNIQUE,
                    player_name VARCHAR(20) NOT NULL UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create index on player_name for faster lookups
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_player_names_name ON player_names(player_name)
            `);

            // Create index on player_id for faster lookups
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_player_names_player_id ON player_names(player_id)
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
                    k.player_id,
                    COALESCE(pn.player_name, k.player_id) as player_name,
                    COUNT(*) as total_kills,
                    COUNT(*) FILTER (WHERE k.kill_type = 'player') as player_kills,
                    COUNT(*) FILTER (WHERE k.kill_type = 'monster') as monster_kills
                FROM kills k
                LEFT JOIN player_names pn ON k.player_id = pn.player_id
                GROUP BY k.player_id, pn.player_name
                ORDER BY total_kills DESC
                LIMIT $1
            `, [limit]);

            return result.rows.map((row: any) => ({
                player_id: row.player_id,
                player_name: row.player_name,
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
     * Check if a player name is available (not already taken)
     */
    public async isNameAvailable(playerName: string): Promise<boolean> {
        try {
            const result = await this.pool.query(
                'SELECT COUNT(*) as count FROM player_names WHERE LOWER(player_name) = LOWER($1)',
                [playerName]
            );
            return parseInt(result.rows[0].count) === 0;
        } catch (error) {
            console.error('Error checking name availability:', error);
            return false; // On error, assume name is not available to be safe
        }
    }

    /**
     * Register a player name for a player ID
     * Returns the actual name that was registered (may be modified if original was taken)
     * Throws error if name cannot be registered
     */
    public async registerPlayerName(playerId: string, playerName: string): Promise<string> {
        try {
            // Check if this player already has a name registered
            const existingName = await this.pool.query(
                'SELECT player_name FROM player_names WHERE player_id = $1',
                [playerId]
            );

            if (existingName.rows.length > 0) {
                // Player already has a name, return it
                return existingName.rows[0].player_name;
            }

            // Check if the requested name is available
            let finalName = playerName;
            let nameAvailable = await this.isNameAvailable(finalName);
            
            // If name is taken, try to find an available variation
            if (!nameAvailable) {
                let counter = 1;
                while (!nameAvailable && counter < 1000) {
                    finalName = `${playerName}${counter}`;
                    nameAvailable = await this.isNameAvailable(finalName);
                    counter++;
                }
                
                if (!nameAvailable) {
                    throw new Error('Unable to find available name variation');
                }
            }

            // Register the name
            await this.pool.query(
                'INSERT INTO player_names (player_id, player_name) VALUES ($1, $2) ON CONFLICT (player_id) DO UPDATE SET player_name = EXCLUDED.player_name, last_seen = CURRENT_TIMESTAMP',
                [playerId, finalName]
            );

            return finalName;
        } catch (error: any) {
            // If it's a unique constraint violation on player_name, try to find alternative
            if (error.code === '23505' && error.constraint === 'player_names_player_name_key') {
                // Name is taken, try variations
                let counter = 1;
                let finalName = `${playerName}${counter}`;
                let inserted = false;
                
                while (!inserted && counter < 1000) {
                    try {
                        await this.pool.query(
                            'INSERT INTO player_names (player_id, player_name) VALUES ($1, $2) ON CONFLICT (player_id) DO UPDATE SET player_name = EXCLUDED.player_name, last_seen = CURRENT_TIMESTAMP',
                            [playerId, finalName]
                        );
                        inserted = true;
                    } catch (e: any) {
                        if (e.code === '23505') {
                            counter++;
                            finalName = `${playerName}${counter}`;
                        } else {
                            throw e;
                        }
                    }
                }
                
                if (inserted) {
                    return finalName;
                }
            }
            
            console.error('Error registering player name:', error);
            throw error;
        }
    }

    /**
     * Get player name by player ID
     */
    public async getPlayerName(playerId: string): Promise<string | null> {
        try {
            const result = await this.pool.query(
                'SELECT player_name FROM player_names WHERE player_id = $1',
                [playerId]
            );
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0].player_name;
        } catch (error) {
            console.error('Error getting player name:', error);
            return null;
        }
    }

    /**
     * Update last_seen timestamp for a player
     */
    public async updatePlayerLastSeen(playerId: string): Promise<void> {
        try {
            await this.pool.query(
                'UPDATE player_names SET last_seen = CURRENT_TIMESTAMP WHERE player_id = $1',
                [playerId]
            );
        } catch (error) {
            console.error('Error updating player last seen:', error);
            // Don't throw - not critical
        }
    }

    /**
     * Clear all data from the database (kills and player names)
     * WARNING: This will delete all records!
     */
    public async clearDatabase(): Promise<void> {
        try {
            // Delete all kills
            await this.pool.query('DELETE FROM kills');
            console.log('Cleared all kills from database');
            
            // Delete all player names
            await this.pool.query('DELETE FROM player_names');
            console.log('Cleared all player names from database');
            
            console.log('Database cleared successfully');
        } catch (error) {
            console.error('Error clearing database:', error);
            throw error;
        }
    }

    /**
     * Close database connection pool
     */
    public async close(): Promise<void> {
        await this.pool.end();
    }
}

