import { dbClient } from '../DatabaseClient';
import { DeviceBinding } from '../../types/domain';
import type { Transaction } from '@op-engineering/op-sqlite';

/**
 * DeviceBindingRepository
 *
 * Handles all CRUD operations on the `device_bindings` table.
 * A binding links a (user_id, device_id) pair and proves that the user's
 * enrollment happened on this specific physical device.
 */
export class DeviceBindingRepository {

    /**
     * Inserts a new device binding record.
     *
     * Fails if the (user_id, device_id) pair already exists because of the
     * UNIQUE INDEX idx_db_user_device.
     *
     * @param binding - The fully populated DeviceBinding object.
     * @param tx - Optional transaction object.
     */
    static async insert(binding: DeviceBinding, tx?: Transaction): Promise<void> {
        const runner = tx || dbClient.getDb();
        const sql = `
            INSERT INTO device_bindings (
                id, user_id, device_id, device_model, os_version, app_version,
                public_key, attestation_token, attestation_valid, bound_at,
                last_verified_at, is_active, revoked_at, revoke_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await runner.execute(sql, [
            binding.id,
            binding.user_id,
            binding.device_id,
            binding.device_model ?? null,
            binding.os_version ?? null,
            binding.app_version ?? null,
            binding.public_key ?? null,
            binding.attestation_token ?? null,
            binding.attestation_valid,
            binding.bound_at,
            binding.last_verified_at ?? null,
            binding.is_active,
            binding.revoked_at ?? null,
            binding.revoke_reason ?? null,
        ]);
    }

    /**
     * Looks up an active binding for a (user_id, device_id) pair.
     *
     * @param userId   - The user to query.
     * @param deviceId - The SHA-256 device fingerprint.
     * @returns The active DeviceBinding if found, otherwise null.
     */
    static async findActive(userId: string, deviceId: string): Promise<DeviceBinding | null> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `SELECT * FROM device_bindings
             WHERE user_id = ? AND device_id = ? AND is_active = 1
             LIMIT 1`,
            [userId, deviceId]
        );
        const rows = (result.rows ?? []) as unknown as DeviceBinding[];
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Looks up any active binding registered to a given device ID.
     *
     * Used during authentication before a userId is known, to find which
     * user is registered on this device.
     *
     * @param deviceId - The SHA-256 device fingerprint.
     * @returns The active DeviceBinding or null if this device is unregistered.
     */
    static async findByDeviceId(deviceId: string): Promise<DeviceBinding | null> {
        const db = dbClient.getDb();
        const result = await db.execute(
            `SELECT * FROM device_bindings WHERE device_id = ? AND is_active = 1 ORDER BY bound_at DESC LIMIT 1`,
            [deviceId]
        );
        const rows = (result.rows ?? []) as unknown as DeviceBinding[];
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Revokes all active bindings for a user on a specific device.
     *
     * @param userId       - The user whose binding should be revoked.
     * @param deviceId     - The device fingerprint.
     * @param reason       - Human-readable revocation reason stored in the row.
     * @param nowEpoch     - Current Unix epoch milliseconds for revoked_at.
     */
    static async revoke(
        userId: string,
        deviceId: string,
        reason: string,
        nowEpoch: number,
        tx?: Transaction
    ): Promise<void> {
        const runner = tx || dbClient.getDb();
        await runner.execute(
            `UPDATE device_bindings
             SET is_active = 0, revoked_at = ?, revoke_reason = ?
             WHERE user_id = ? AND device_id = ?`,
            [nowEpoch, reason, userId, deviceId]
        );
    }

    /**
     * Revokes all active bindings for any user on a specific device.
     * Ensures only one user can be actively bound to a physical device at a time.
     */
    static async revokeAllForDevice(
        deviceId: string,
        reason: string,
        nowEpoch: number,
        tx?: Transaction
    ): Promise<void> {
        const runner = tx || dbClient.getDb();
        await runner.execute(
            `UPDATE device_bindings
             SET is_active = 0, revoked_at = ?, revoke_reason = ?
             WHERE device_id = ? AND is_active = 1`,
            [nowEpoch, reason, deviceId]
        );
    }

    /**
     * Updates the last_verified_at timestamp after a successful auth.
     *
     * @param bindingId - The UUID of the binding record to update.
     * @param nowEpoch  - Current Unix epoch milliseconds.
     */
    static async updateLastVerified(bindingId: string, nowEpoch: number, tx?: Transaction): Promise<void> {
        const runner = tx || dbClient.getDb();
        await runner.execute(
            'UPDATE device_bindings SET last_verified_at = ? WHERE id = ?',
            [nowEpoch, bindingId]
        );
    }
}
