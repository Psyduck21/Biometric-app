import { dbClient } from '../DatabaseClient';
import { Session } from '../../types/domain';

/**
 * SessionRepository
 *
 * Handles all CRUD operations on the `sessions` table.
 * Session TTL is enforced at the service layer (SessionService); this
 * repository only provides the raw persistence primitives.
 */
export class SessionRepository {

    /**
     * Persists a newly created session row.
     *
     * @param session - The fully populated Session object.
     * @throws If the nonce UNIQUE constraint is violated (replay attempt).
     */
    static async insert(session: Session): Promise<void> {
        const db = dbClient.getDb();
        const sql = `
            INSERT INTO sessions (
                id, user_id, device_id, nonce, challenge_type,
                challenge_passed, similarity_score, liveness_score,
                started_at, expires_at, ended_at, status,
                ip_address, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(sql, [
            session.id,
            session.user_id,
            session.device_id,
            session.nonce,
            session.challenge_type,
            session.challenge_passed,
            session.similarity_score,
            session.liveness_score,
            session.started_at,
            session.expires_at,
            session.ended_at ?? null,
            session.status,
            session.ip_address ?? null,
            session.metadata ?? null,
        ]);
    }

    /**
     * Returns the most recent active session for a user on the current device.
     *
     * Checks that status = 'active' and expires_at > now to avoid returning
     * stale sessions that have not been cleaned up yet.
     *
     * @param userId   - The user to query.
     * @param nowEpoch - Current time in Unix epoch milliseconds.
     * @returns The active Session, or null if none exists.
     */
    static async getActive(userId: string, nowEpoch: number): Promise<Session | null> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `SELECT * FROM sessions
             WHERE user_id = ? AND status = 'active' AND expires_at > ?
             ORDER BY started_at DESC LIMIT 1`,
            [userId, nowEpoch]
        );
        const rows = (result.rows ?? []) as unknown as Session[];
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Returns a session by its primary key id.
     *
     * @param sessionId - The UUID of the session.
     * @returns The Session row, or null if not found.
     */
    static async getById(sessionId: string): Promise<Session | null> {
        const db = dbClient.getDb();
        const result = await db.execute(
            'SELECT * FROM sessions WHERE id = ?',
            [sessionId]
        );
        const rows = (result.rows ?? []) as unknown as Session[];
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Marks a session as expired or revoked.
     *
     * @param sessionId - The UUID of the session to terminate.
     * @param status    - The terminal status to set ('expired' or 'revoked').
     * @param nowEpoch  - Current time to record as ended_at.
     */
    static async terminate(
        sessionId: string,
        status: 'expired' | 'revoked',
        nowEpoch: number
    ): Promise<void> {
        const db = dbClient.getDb();
        await db.execute(
            'UPDATE sessions SET status = ?, ended_at = ? WHERE id = ?',
            [status, nowEpoch, sessionId]
        );
    }

    /**
     * Bulk-expires all sessions whose expires_at timestamp is in the past.
     *
     * Called periodically by SessionService to keep the table tidy.
     *
     * @param nowEpoch - Current time in Unix epoch milliseconds.
     * @returns The number of sessions that were expired.
     */
    static async expireStale(nowEpoch: number): Promise<number> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `UPDATE sessions SET status = 'expired', ended_at = ?
             WHERE status = 'active' AND expires_at <= ?`,
            [nowEpoch, nowEpoch]
        );
        return result.rowsAffected ?? 0;
    }
}
