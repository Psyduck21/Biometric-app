import { dbClient } from '../DatabaseClient';
import { AttendanceRecord } from '../../types/domain';

/**
 * AttendanceRepository
 *
 * Handles persistence for the `attendance` table.
 */
export class AttendanceRepository {

    /**
     * Inserts a new attendance record.
     * The `idx_att_idempotency` constraint prevents duplicates (user_id, event_type, 5-min window).
     *
     * @param record - The populated AttendanceRecord to save.
     */
    static async insert(record: AttendanceRecord): Promise<void> {
        const db = dbClient.getDb();
        const sql = `
            INSERT INTO attendance (
                id, user_id, event_type, timestamp,
                latitude, longitude, accuracy_meters,
                geofence_id, geofence_valid, similarity_score,
                session_id, device_id, device_signature, sync_status,
                synced_at, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(sql, [
            record.id,
            record.user_id,
            record.event_type,
            record.timestamp,
            record.latitude ?? null,
            record.longitude ?? null,
            record.accuracy_meters ?? null,
            record.geofence_id ?? null,
            record.geofence_valid,
            record.similarity_score,
            record.session_id,
            record.device_id,
            record.device_signature ?? null,
            record.sync_status,
            record.synced_at ?? null,
            record.notes ?? null,
        ]);
    }

    /**
     * Retrieves attendance records for a user for the current day.
     * Uses device local time to define "today" (midnight to midnight).
     *
     * @param userId - The user to query.
     * @returns Array of AttendanceRecords, newest first.
     */
    static async getTodayAttendance(userId: string): Promise<AttendanceRecord[]> {
        const db = dbClient.getDb();
        
        // Calculate the epoch timestamp for midnight today (local time)
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;

        const sql = `
            SELECT * FROM attendance
            WHERE user_id = ? AND timestamp BETWEEN ? AND ?
            ORDER BY timestamp DESC
        `;
        
        const result = await db.execute(sql, [userId, startOfDay, endOfDay]);
        return (result.rows ?? []) as unknown as AttendanceRecord[];
    }

    /**
     * Retrieves attendance records for a user within a specific date range.
     *
     * @param userId - The user to query.
     * @param startTs - Epoch timestamp (ms) for the start of the range.
     * @param endTs - Epoch timestamp (ms) for the end of the range.
     * @returns Array of AttendanceRecords, newest first.
     */
    static async getAttendanceByDateRange(userId: string, startTs: number, endTs: number): Promise<AttendanceRecord[]> {
        const db = dbClient.getDb();
        const sql = `
            SELECT * FROM attendance
            WHERE user_id = ? AND timestamp BETWEEN ? AND ?
            ORDER BY timestamp DESC
        `;
        const result = await db.execute(sql, [userId, startTs, endTs]);
        return (result.rows ?? []) as unknown as AttendanceRecord[];
    }

    /**
     * Efficiently bulk-inserts or replaces historical records pulled from Supabase.
     * Uses OR REPLACE to overwrite existing records with updated cloud sync statuses.
     *
     * @param records - Array of AttendanceRecord items from the cloud.
     */
    static async upsertBatch(records: AttendanceRecord[]): Promise<void> {
        if (records.length === 0) return;
        const db = dbClient.getDb();
        
        const sql = `
            INSERT OR REPLACE INTO attendance (
                id, user_id, event_type, timestamp,
                latitude, longitude, accuracy_meters,
                geofence_id, geofence_valid, similarity_score,
                session_id, device_id, device_signature, sync_status,
                synced_at, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const batchArgs = records.map(record => [
            record.id,
            record.user_id,
            record.event_type,
            record.timestamp,
            record.latitude ?? null,
            record.longitude ?? null,
            record.accuracy_meters ?? null,
            record.geofence_id ?? null,
            record.geofence_valid,
            record.similarity_score,
            record.session_id,
            record.device_id,
            record.device_signature ?? null,
            record.sync_status,
            record.synced_at ?? null,
            record.notes ?? null,
        ]);
        
        await db.executeBatch([[sql, batchArgs]]);
    }
}
