import * as SQL from 'sql.js';

export interface SavedCharacter {
    id: number;
    name: string;
    data: string; // JSON string
    createdAt: string;
    updatedAt: string;
}

type SqlJsStatic = Awaited<ReturnType<typeof SQL.default>>;
type DatabaseInstance = InstanceType<SqlJsStatic['Database']>;

export class DatabaseManager {
    private db: DatabaseInstance | null = null;
    private initialized: boolean = false;

    private SQL: SqlJsStatic | null = null;

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            this.SQL = await SQL.default({
                locateFile: (file: string) => {
                    // Use CDN for sql.js wasm file
                    return `https://sql.js.org/dist/${file}`;
                }
            });

            // Try to load existing database from localStorage
            const savedDb = localStorage.getItem('characterBuilderDb');
            if (savedDb) {
                const buffer = Uint8Array.from(atob(savedDb), c => c.charCodeAt(0));
                this.db = new this.SQL.Database(buffer);
            } else {
                // Create new database
                this.db = new this.SQL.Database();
                this.createTables();
            }

            this.initialized = true;
            console.log('Database initialized');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }

    private createTables(): void {
        if (!this.db) return;

        this.db.run(`
            CREATE TABLE IF NOT EXISTS characters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                data TEXT NOT NULL,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            )
        `);

        this.saveDatabase();
    }

    private saveDatabase(): void {
        if (!this.db) return;

        try {
            const data = this.db.export();
            // Convert Uint8Array to base64 without using Buffer (which doesn't exist in browser)
            const base64 = btoa(String.fromCharCode(...data));
            localStorage.setItem('characterBuilderDb', base64);
        } catch (error) {
            console.error('Failed to save database:', error);
        }
    }

    async saveCharacter(name: string, data: string): Promise<number> {
        if (!this.db) {
            await this.initialize();
        }

        if (!this.db) throw new Error('Database not initialized');

        const now = new Date().toISOString();
        
        this.db.run(
            `INSERT INTO characters (name, data, createdAt, updatedAt) 
             VALUES (?, ?, ?, ?)`,
            [name, data, now, now]
        );

        this.saveDatabase();
        
        const result = this.db.exec('SELECT last_insert_rowid() as id');
        return result[0].values[0][0] as number;
    }

    async updateCharacter(id: number, name: string, data: string): Promise<void> {
        if (!this.db) {
            await this.initialize();
        }

        if (!this.db) throw new Error('Database not initialized');

        const now = new Date().toISOString();
        
        this.db.run(
            `UPDATE characters 
             SET name = ?, data = ?, updatedAt = ? 
             WHERE id = ?`,
            [name, data, now, id]
        );

        this.saveDatabase();
    }

    async getAllCharacters(): Promise<SavedCharacter[]> {
        if (!this.db) {
            await this.initialize();
        }

        if (!this.db) throw new Error('Database not initialized');

        const result = this.db.exec('SELECT * FROM characters ORDER BY updatedAt DESC');
        
        if (result.length === 0) return [];

        const columns = result[0].columns;
        const values = result[0].values;

        return values.map((row: any[]) => ({
            id: row[columns.indexOf('id')] as number,
            name: row[columns.indexOf('name')] as string,
            data: row[columns.indexOf('data')] as string,
            createdAt: row[columns.indexOf('createdAt')] as string,
            updatedAt: row[columns.indexOf('updatedAt')] as string
        }));
    }

    async getCharacter(id: number): Promise<SavedCharacter | null> {
        if (!this.db) {
            await this.initialize();
        }

        if (!this.db) throw new Error('Database not initialized');

        // Use prepared statement for parameterized query
        const stmt = this.db.prepare('SELECT * FROM characters WHERE id = ?');
        stmt.bind([id]);
        
        const result: SavedCharacter[] = [];
        while (stmt.step()) {
            const row = stmt.getAsObject();
            result.push({
                id: row.id as number,
                name: row.name as string,
                data: row.data as string,
                createdAt: row.createdAt as string,
                updatedAt: row.updatedAt as string
            });
        }
        
        stmt.free();
        
        return result.length > 0 ? result[0] : null;
    }

    async deleteCharacter(id: number): Promise<void> {
        if (!this.db) {
            await this.initialize();
        }

        if (!this.db) throw new Error('Database not initialized');

        this.db.run('DELETE FROM characters WHERE id = ?', [id]);
        this.saveDatabase();
    }

    async exportDatabase(): Promise<Uint8Array> {
        if (!this.db) {
            await this.initialize();
        }

        if (!this.db) throw new Error('Database not initialized');

        return this.db.export();
    }

    async importDatabase(data: Uint8Array): Promise<void> {
        if (!this.SQL) {
            await this.initialize();
        }

        if (!this.SQL) throw new Error('SQL.js not initialized');
        this.db = new this.SQL.Database(data);
        this.saveDatabase();
    }
}

