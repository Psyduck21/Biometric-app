import { dbClient } from '../DatabaseClient';
import { SyncQueueItem } from '../../types/domain';
import type { Transaction } from '@op-engineering/op-sqlite';

/**
 * SyncQueueRepository
 *
 * Manages the outbound sync queue stored in the `sync_queue` table.
 * Items are inserted here by enrollment and attendance services and
 * consumed by SyncService when network connectivity is available.
 *
 * Priority values: 1 = highest (auth events), 5 = default, 10 = lowest.
 * Retry strategy: exponential backoff managed at the service layer.
 */
export class SyncQueueRepository {

    /**
     * Inserts a new sync queue item.
     *
     * The idempotency_key UNIQUE constraint prevents duplicate sync submissions
     * for the same entity+operation combination.
     *
     * @param item - The fully populated SyncQueueItem to enqueue.
     * @param tx - Optional transaction object.
     */
    static async insert(item: SyncQueueItem, tx?: Transaction): Promise<void> {
        const runner = tx || dbClient.getDb();
        const sql = `
            INSERT INTO sync_queue (
                id, entity_type, entity_id, operation,
                payload_cipher, payload_iv, payload_tag,
                idempotency_key, status, priority,
                attempt_count, next_retry_at, last_error,
                created_at, synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await runner.execute(sql, [
            item.id,
            item.entity_type,
            item.entity_id,
            item.operation,
            item.payload_cipher,
            item.payload_iv,
            item.payload_tag,
            item.idempotency_key,
            item.status,
            item.priority,
            item.attempt_count,
            item.next_retry_at ?? null,
            item.last_error ?? null,
            item.created_at,
            item.synced_at ?? null,
        ]);
    }

    /**
     * Returns items that are ready to be synced, ordered by priority then
     * creation time. Items with next_retry_at in the future are excluded.
     *
     * @param limit    - Maximum batch size. Corresponds to the sync_batch_size config.
     * @param nowEpoch - Current Unix epoch milliseconds used for retry gate.
     * @returns Array of SyncQueueItem objects ready for upload.
     */
    static async getPending(limit: number, nowEpoch: number): Promise<SyncQueueItem[]> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `SELECT * FROM sync_queue
             WHERE status IN ('pending', 'failed')
               AND (next_retry_at IS NULL OR next_retry_at <= ?)
             ORDER BY priority ASC, created_at ASC
             LIMIT ?`,
            [nowEpoch, limit]
        );
        return (result.rows ?? []) as unknown as SyncQueueItem[];
    }

    /**
     * Marks multiple items as successfully synced using their idempotency keys.
     *
     * @param idempotencyKeys - Array of idempotency keys returned by the server.
     * @param nowEpoch        - Current Unix epoch milliseconds for synced_at.
     */
    static async markSynced(idempotencyKeys: string[], nowEpoch: number): Promise<void> {
        if (idempotencyKeys.length === 0) return;
        const db = dbClient.getDb();
        const placeholders = idempotencyKeys.map(() => '?').join(', ');
        await db.execute(
            `UPDATE sync_queue
             SET status = 'synced', synced_at = ?
             WHERE idempotency_key IN (${placeholders})`,
            [nowEpoch, ...idempotencyKeys]
        );
    }

    /**
     * Records a failed sync attempt, incrementing attempt_count and
     * setting the next_retry_at to the computed backoff timestamp.
     *
     * @param id            - The UUID of the sync queue item.
     * @param errorMessage  - The error message to record.
     * @param nextRetryAt   - Unix epoch ms when this item should next be retried.
     * @param isDead        - If true, marks the item as 'dead' (max retries exceeded).
     */
    static async recordFailure(
        id: string,
        errorMessage: string,
        nextRetryAt: number,
        isDead: boolean
    ): Promise<void> {
        const db = dbClient.getDb();
        const newStatus = isDead ? 'dead' : 'failed';
        await db.execute(
            `UPDATE sync_queue
             SET status = ?, last_error = ?, next_retry_at = ?,
                 attempt_count = attempt_count + 1
             WHERE id = ?`,
            [newStatus, errorMessage, nextRetryAt, id]
        );
    }

    /**
     * Deletes all synced items older than the given epoch timestamp.
     *
     * Called by SyncService as a housekeeping step after a successful sync.
     *
     * @param olderThanEpoch - Items synced_at before this value will be deleted.
     * @returns Number of rows deleted.
     */
    static async purgeSynced(olderThanEpoch: number): Promise<number> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < ?`,
            [olderThanEpoch]
        );
        return result.rowsAffected ?? 0;
    }
}
