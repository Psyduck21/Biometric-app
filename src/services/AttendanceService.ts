import { locationService } from './LocationService';
import { CryptoService } from './CryptoService';
import { auditService } from './AuditService';
import { deviceBindingService } from './DeviceBindingService';
import { AttendanceRepository } from '../database/repositories/AttendanceRepository';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { Session, AttendanceEventType, AttendanceRecord, SyncQueueItem } from '../types/domain';

export class AttendanceService {

    /**
     * Records an attendance event.
     * Grabs the current GPS location. If GPS fails or is outside the geofence,
     * the punch is still recorded but flagged as geofence_valid = 0 for supervisor review.
     * 
     * @param session - The active Session created by AuthenticationService.
     * @param eventType - 'check_in', 'check_out', etc.
     * @returns The generated AttendanceRecord.
     */
    async recordAttendance(
        session: Session,
        eventType: AttendanceEventType,
        notes?: string
    ): Promise<AttendanceRecord> {
        const now = Date.now();
        const deviceId = await deviceBindingService.getDeviceId();
        const recordId = CryptoService.uuid();

        // 1. Location & Geofence (Fallback behavior: flag for supervisor if invalid/missing)
        const location = await locationService.getCurrentPosition();
        let isGeofenceValid = 0 as 0 | 1;
        let geofenceId: string | undefined = undefined;

        if (location) {
            const validation = await locationService.validateGeofence(location);
            isGeofenceValid = validation.valid ? 1 : 0;
            geofenceId = validation.geofenceId;
        }

        const record: AttendanceRecord = {
            id: recordId,
            user_id: session.user_id,
            event_type: eventType,
            timestamp: now,
            latitude: location?.latitude,
            longitude: location?.longitude,
            accuracy_meters: location?.accuracy,
            geofence_id: geofenceId,
            geofence_valid: isGeofenceValid,
            similarity_score: session.similarity_score,
            session_id: session.id,
            device_id: deviceId,
            sync_status: 'pending',
            notes: notes || (isGeofenceValid === 0 ? 'Geofence invalid or GPS unavailable. Flagged for review.' : undefined)
        };

        // Cryptographically sign the core fields with the device's private key
        try {
            const privateKey = await CryptoService.getDevicePrivateKey();
            if (privateKey) {
                const payloadToSign = `${recordId}|${session.user_id}|${deviceId}|${now}`;
                record.device_signature = await CryptoService.signECDSA(CryptoService.canonicalAttendancePayload({ userId: session.user_id, eventType, timestamp: now, deviceId, sessionId: session.id, similarityScore: session.similarity_score }), privateKey);
            }
        } catch (e) {
            console.error('[AttendanceService] Failed to sign attendance record:', e);
        }

        // 2. Persist Record
        await AttendanceRepository.insert(record);

        // 3. Enqueue for Sync
        try {
            await this.enqueueSyncItem(record);
        } catch (error) {
            console.warn('[AttendanceService] Failed to enqueue sync item. It will be picked up later.', error);
        }

        // 4. Audit Log
        await auditService.log({
            user_id: session.user_id,
            action: 'attendance_record',
            entity_type: 'attendance',
            entity_id: recordId,
            outcome: 'success',
            metadata: JSON.stringify({ eventType, geofenceValid: isGeofenceValid })
        });

        return record;
    }

    /**
     * Wraps the attendance record in an encrypted SyncQueueItem and saves it.
     */
    private async enqueueSyncItem(record: AttendanceRecord): Promise<void> {
        const masterKey = await CryptoService.getMasterKey();
        if (!masterKey) throw new Error('Master key not found for sync queue encryption.');

        const payloadJson = JSON.stringify(record);
        const { cipher, iv, tag } = await CryptoService.encrypt(payloadJson, masterKey);
        
        const idempotencyKey = CryptoService.uuid();
        const now = Date.now();
        const syncId = CryptoService.uuid();

        const syncItem: SyncQueueItem = {
            id: syncId,
            entity_type: 'attendance',
            entity_id: record.id,
            operation: 'create',
            payload_cipher: cipher,
            payload_iv: iv,
            payload_tag: tag,
            idempotency_key: idempotencyKey,
            status: 'pending',
            priority: 2, // High priority for attendance
            attempt_count: 0,
            created_at: now
        };

        await SyncQueueRepository.insert(syncItem);
    }
}

export const attendanceService = new AttendanceService();
