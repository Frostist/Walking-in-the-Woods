import * as pg from 'pg';
const { Pool } = pg;
export class DatabaseManager {
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
    async initializeSchema() {
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
        }
        catch (error) {
            console.error('Error initializing database schema:', error);
            // Don't throw - allow server to continue even if DB setup fails
        }
    }
    /**
     * Record a kill in the database
     */
    async recordKill(playerId, killType, victimId) {
        try {
            await this.pool.query('INSERT INTO kills (player_id, kill_type, victim_id) VALUES ($1, $2, $3)', [playerId, killType, victimId || null]);
        }
        catch (error) {
            console.error('Error recording kill:', error);
            // Don't throw - allow game to continue even if DB write fails
        }
    }
    /**
     * Migrate kills from old player_id to new player_id
     * Used when a player reconnects and we need to consolidate their kills
     */
    async migrateKills(oldPlayerId, newPlayerId) {
        try {
            // Only migrate if the IDs are different
            if (oldPlayerId === newPlayerId) {
                return;
            }
            // Update all kills from old player_id to new player_id
            const result = await this.pool.query('UPDATE kills SET player_id = $1 WHERE player_id = $2', [newPlayerId, oldPlayerId]);
            if (result.rowCount && result.rowCount > 0) {
                console.log(`Migrated ${result.rowCount} kill(s) from player_id ${oldPlayerId} to ${newPlayerId}`);
            }
        }
        catch (error) {
            console.error('Error migrating kills:', error);
            // Don't throw - allow game to continue even if migration fails
        }
    }
    /**
     * Migrate all kills from any player_ids that have the same player_name to the target player_id
     * This consolidates kills when a player reconnects with a username
     */
    async migrateKillsByPlayerName(playerName, targetPlayerId) {
        try {
            // Find all player_ids that have this player_name (except the target)
            const result = await this.pool.query(`SELECT player_id FROM player_names 
                 WHERE player_name = $1 AND player_id != $2`, [playerName, targetPlayerId]);
            // Migrate kills from each found player_id to the target
            for (const row of result.rows) {
                const oldPlayerId = row.player_id;
                await this.migrateKills(oldPlayerId, targetPlayerId);
                // Optionally, we could delete the old player_name entry, but we'll keep it
                // in case there are other references. The leaderboard groups by name anyway.
            }
        }
        catch (error) {
            console.error('Error migrating kills by player name:', error);
            // Don't throw - allow game to continue even if migration fails
        }
    }
    /**
     * Get leaderboard with total kills (players + monsters combined)
     * Groups by player_name to prevent duplicates and ensure one entry per username
     */
    async getLeaderboard(limit = 10) {
        try {
            const result = await this.pool.query(`
                SELECT 
                    MAX(pn.player_id) as player_id,
                    pn.player_name,
                    COUNT(*) as total_kills,
                    COUNT(*) FILTER (WHERE k.kill_type = 'player') as player_kills,
                    COUNT(*) FILTER (WHERE k.kill_type = 'monster') as monster_kills
                FROM kills k
                INNER JOIN player_names pn ON k.player_id = pn.player_id
                WHERE pn.player_name IS NOT NULL
                GROUP BY pn.player_name
                ORDER BY total_kills DESC
                LIMIT $1
            `, [limit]);
            return result.rows.map((row) => ({
                player_id: row.player_id,
                player_name: row.player_name,
                total_kills: parseInt(row.total_kills),
                player_kills: parseInt(row.player_kills),
                monster_kills: parseInt(row.monster_kills)
            }));
        }
        catch (error) {
            console.error('Error fetching leaderboard:', error);
            return [];
        }
    }
    /**
     * Get kill count for a specific player
     */
    async getPlayerKills(playerId) {
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
        }
        catch (error) {
            console.error('Error fetching player kills:', error);
            return { total: 0, players: 0, monsters: 0 };
        }
    }
    /**
     * Check if a player name is available (not already taken)
     */
    async isNameAvailable(playerName) {
        try {
            const result = await this.pool.query('SELECT COUNT(*) as count FROM player_names WHERE LOWER(player_name) = LOWER($1)', [playerName]);
            return parseInt(result.rows[0].count) === 0;
        }
        catch (error) {
            console.error('Error checking name availability:', error);
            return false; // On error, assume name is not available to be safe
        }
    }
    /**
     * Register a player name for a player ID
     * Returns the actual name that was registered (may be modified if original was taken)
     * Throws error if name cannot be registered
     */
    async registerPlayerName(playerId, playerName) {
        try {
            // Check if this player already has a name registered
            const existingName = await this.pool.query('SELECT player_name FROM player_names WHERE player_id = $1', [playerId]);
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
            await this.pool.query('INSERT INTO player_names (player_id, player_name) VALUES ($1, $2) ON CONFLICT (player_id) DO UPDATE SET player_name = EXCLUDED.player_name, last_seen = CURRENT_TIMESTAMP', [playerId, finalName]);
            return finalName;
        }
        catch (error) {
            // If it's a unique constraint violation on player_name, try to find alternative
            if (error.code === '23505' && error.constraint === 'player_names_player_name_key') {
                // Name is taken, try variations
                let counter = 1;
                let finalName = `${playerName}${counter}`;
                let inserted = false;
                while (!inserted && counter < 1000) {
                    try {
                        await this.pool.query('INSERT INTO player_names (player_id, player_name) VALUES ($1, $2) ON CONFLICT (player_id) DO UPDATE SET player_name = EXCLUDED.player_name, last_seen = CURRENT_TIMESTAMP', [playerId, finalName]);
                        inserted = true;
                    }
                    catch (e) {
                        if (e.code === '23505') {
                            counter++;
                            finalName = `${playerName}${counter}`;
                        }
                        else {
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
    async getPlayerName(playerId) {
        try {
            const result = await this.pool.query('SELECT player_name FROM player_names WHERE player_id = $1', [playerId]);
            if (result.rows.length === 0) {
                return null;
            }
            return result.rows[0].player_name;
        }
        catch (error) {
            console.error('Error getting player name:', error);
            return null;
        }
    }
    /**
     * Get player ID by player name (username)
     */
    async getPlayerIdByName(playerName) {
        try {
            const result = await this.pool.query('SELECT player_id FROM player_names WHERE LOWER(player_name) = LOWER($1)', [playerName]);
            if (result.rows.length === 0) {
                return null;
            }
            return result.rows[0].player_id;
        }
        catch (error) {
            console.error('Error getting player ID by name:', error);
            return null;
        }
    }
    /**
     * Update last_seen timestamp for a player
     */
    async updatePlayerLastSeen(playerId) {
        try {
            await this.pool.query('UPDATE player_names SET last_seen = CURRENT_TIMESTAMP WHERE player_id = $1', [playerId]);
        }
        catch (error) {
            console.error('Error updating player last seen:', error);
            // Don't throw - not critical
        }
    }
    /**
     * Clear all data from the database (kills and player names)
     * WARNING: This will delete all records!
     */
    async clearDatabase() {
        try {
            // Delete all kills
            await this.pool.query('DELETE FROM kills');
            console.log('Cleared all kills from database');
            // Delete all player names
            await this.pool.query('DELETE FROM player_names');
            console.log('Cleared all player names from database');
            console.log('Database cleared successfully');
        }
        catch (error) {
            console.error('Error clearing database:', error);
            throw error;
        }
    }
    /**
     * Close database connection pool
     */
    async close() {
        await this.pool.end();
    }
}
