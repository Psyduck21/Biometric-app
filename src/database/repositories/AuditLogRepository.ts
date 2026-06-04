import { dbClient } from '../DatabaseClient';
import { AuditLog } from '../../types/domain';

/**
 * AuditLogRepository
 *
 * Append-only persistence for the `audit_logs` table.
 * Rows are never updated or deleted locally — they are synced to the cloud
 * and optionally purged from the device after a configurable retention window.
 */
export class AuditLogRepository {

    /**
     * Appends a new audit log entry.
     *
     * All fields except user_id, actor_id, entity_type, entity_id,
     * failure_reason, device_id, and metadata are required.
     *
     * @param log - The fully populated AuditLog object to persist.
     */
    static async insert(log: AuditLog): Promise<void> {
        const db = dbClient.getDb();
        const sql = `
            INSERT INTO audit_logs (
                id, user_id, actor_id, action, entity_type, entity_id,
                outcome, failure_reason, device_id, timestamp,
                metadata, sync_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(sql, [
            log.id,
            log.user_id ?? null,
            log.actor_id ?? null,
            log.action,
            log.entity_type ?? null,
            log.entity_id ?? null,
            log.outcome,
            log.failure_reason ?? null,
            log.device_id ?? null,
            log.timestamp,
            log.metadata ?? null,
            log.sync_status,
        ]);
    }

    /**
     * Returns the most recent audit log entries for a given user.
     *
     * @param userId - The user whose logs to retrieve.
     * @param limit  - Maximum number of entries to return (default 50).
     * @returns Array of AuditLog rows ordered newest-first.
     */
    static async getRecentForUser(userId: string, limit = 50): Promise<AuditLog[]> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `SELECT * FROM audit_logs
             WHERE user_id = ?
             ORDER BY timestamp DESC LIMIT ?`,
            [userId, limit]
        );
        return (result.rows ?? []) as unknown as AuditLog[];
    }

    static async getRecent(limit = 50): Promise<AuditLog[]> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `SELECT * FROM audit_logs
             ORDER BY timestamp DESC LIMIT ?`,
            [limit]
        );
        return (result.rows ?? []) as unknown as AuditLog[];
    }

    /**
     * Returns all audit entries that have not yet been synced to the server.
     *
     * @param limit - Maximum number of entries to return.
     * @returns Array of pending AuditLog rows.
     */
    static async getPendingSync(limit = 100): Promise<AuditLog[]> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `SELECT * FROM audit_logs
             WHERE sync_status = 'pending'
             ORDER BY timestamp ASC LIMIT ?`,
            [limit]
        );
        return (result.rows ?? []) as unknown as AuditLog[];
    }
}
