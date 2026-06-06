import { dbClient } from '../DatabaseClient';

/**
 * ConfigRepository
 *
 * Reads and writes runtime configuration values from the `configurations` table.
 *
 * Default values are seeded by MigrationRunner at first launch. Values may
 * be overridden by server-pushed config updates (Sprint 5 SyncService).
 *
 * Key constants:
 *   - similarity_threshold     (number)  default 0.65
 *   - liveness_threshold       (number)  default 0.85
 *   - max_enrollment_samples   (number)  default 5
 *   - session_ttl_hours        (number)  default 8
 *   - sync_batch_size          (number)  default 50
 *   - max_auth_attempts        (number)  default 3
 *   - lockout_duration_min     (number)  default 15
 */
export class ConfigRepository {

    /**
     * Returns the raw string value for a config key, or the provided
     * fallback if the key does not exist in the database.
     *
     * @param key      - The configuration key (e.g., 'similarity_threshold').
     * @param fallback - Value to return if the key is not found.
     * @returns The stored value as a string, or the fallback.
     */
    static async getString(key: string, fallback: string): Promise<string> {
        try {
            const db = dbClient.getDb();
            const result = await db.execute(
                'SELECT value FROM configurations WHERE key = ?',
                [key]
            );
            const rows = result.rows as { value: string }[] | undefined;
            if (rows && rows.length > 0) {
                return rows[0].value;
            }
        } catch {
            // DB not yet initialized at app startup — return fallback
        }
        return fallback;
    }

    /**
     * Returns a config value as a parsed number.
     * Returns the fallback if the key is missing or the value is not numeric.
     *
     * @param key      - The configuration key.
     * @param fallback - Default numeric value.
     * @returns The stored value parsed as a float.
     */
    static async getNumber(key: string, fallback: number): Promise<number> {
        const raw = await ConfigRepository.getString(key, String(fallback));
        const parsed = parseFloat(raw);
        return isNaN(parsed) ? fallback : parsed;
    }
    /**
     * Returns a config value as a boolean.
     */
    static async getBoolean(key: string, fallback: boolean = false): Promise<boolean> {
        const raw = await ConfigRepository.getString(key, String(fallback));
        return raw === 'true' || raw === '1';
    }

    /**
     * Upserts a configuration key-value pair as number.
     */
    static async setNumber(key: string, value: number, updatedBy = 'system'): Promise<void> {
        await ConfigRepository.set(key, String(value), updatedBy);
    }

    /**
     * Upserts a configuration key-value pair as boolean.
     */
    static async setBoolean(key: string, value: boolean, updatedBy = 'system'): Promise<void> {
        await ConfigRepository.set(key, String(value), updatedBy);
    }
    /**
     * Upserts a configuration key-value pair.
     *
     * @param key       - The configuration key to set.
     * @param value     - The new value (will be stored as a string).
     * @param updatedBy - Identifier of who made the change ('system', admin userId, etc.).
     */
    static async set(key: string, value: string, updatedBy = 'system'): Promise<void> {
        const db = dbClient.getDb();
        await db.execute(
            `INSERT INTO configurations (key, value, value_type, updated_at, updated_by)
             VALUES (?, ?, 'string', ?, ?)
             ON CONFLICT(key) DO UPDATE
             SET value = excluded.value, updated_at = excluded.updated_at,
                 updated_by = excluded.updated_by`,
            [key, value, Date.now(), updatedBy]
        );
    }

    static async getAll(): Promise<{
        key: string;
        value: string;
        value_type: string;
        description?: string | null;
        is_encrypted: 0 | 1;
        updated_at: number;
        updated_by?: string | null;
    }[]> {
        const db = dbClient.getDb();
        const result = await db.execute(
            'SELECT * FROM configurations ORDER BY key ASC'
        );
        return (result.rows ?? []) as {
            key: string;
            value: string;
            value_type: string;
            description?: string | null;
            is_encrypted: 0 | 1;
            updated_at: number;
            updated_by?: string | null;
        }[];
    }
}
