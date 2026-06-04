import { AuditLogRepository } from '../database/repositories/AuditLogRepository';
import { CryptoService } from './CryptoService';
import { AuditLog } from '../types/domain';

/**
 * AuditService
 *
 * Thin orchestration layer over AuditLogRepository that handles:
 *   - UUID generation for each log entry
 *   - Timestamp injection
 *   - Device ID association
 *   - Typed action enforcement
 *
 * Every security-relevant event in the system routes through this service
 * to ensure a tamper-evident local audit trail that will be synced to the
 * cloud (Sprint 5) for compliance review.
 *
 * Reference: system_design_part2_database_lld.md, Section 9.12
 */
export class AuditService {

    /**
     * Records a single audit event.
     *
     * Generates a unique id and timestamps the entry automatically.
     * The entry is always persisted with sync_status = 'pending' so the
     * SyncService will upload it to the cloud on the next sync cycle.
     *
     * @param entry - The audit entry to record. id and timestamp are injected.
     */
    async log(entry: Omit<AuditLog, 'id' | 'timestamp' | 'sync_status'>): Promise<void> {
        const id        = CryptoService.uuid();
        const timestamp = Date.now();

        const fullEntry: AuditLog = {
            ...entry,
            id,
            timestamp,
            sync_status: 'pending',
        };

        try {
            await AuditLogRepository.insert(fullEntry);
        } catch (error) {
            // Audit logging must never crash the main flow. Log to console and continue.
            console.warn('[AuditService] Failed to write audit log:', error);
        }
    }

    /**
     * Returns the N most recent audit entries for a given user.
     *
     * @param userId - The user to query.
     * @param limit  - Maximum entries to return (default 50).
     * @returns Array of AuditLog rows ordered newest-first.
     */
    async getRecentForUser(userId: string, limit = 50): Promise<AuditLog[]> {
        return AuditLogRepository.getRecentForUser(userId, limit);
    }
}

export const auditService = new AuditService();
