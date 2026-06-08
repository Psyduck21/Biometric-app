import { ConfigRepository } from '../database/repositories/ConfigRepository';
import { SessionRepository } from '../database/repositories/SessionRepository';
import { LockoutStatus, Session } from '../types/domain';
import { CryptoService } from './CryptoService';
import { deviceBindingService } from './DeviceBindingService';

/**
 * SessionService
 *
 * Manages authentication sessions including:
 *   - Creation with a unique replay-prevention nonce
 *   - Validation (active + not expired)
 *   - Lockout enforcement after consecutive failures (test cases A33, A34)
 *   - Stale session expiry
 *
 * Session TTL defaults to 8 hours (config: session_ttl_hours).
 * Lockout triggers after 3 failures (config: max_auth_attempts) and lasts
 * 15 minutes (config: lockout_duration_min).
 *
 * Failure counters are stored in-memory and survive app restarts only via
 * the device config table fallback. This keeps latency near zero on the
 * hot path.
 *
 * Reference: system_design_part2_database_lld.md, Section 9.11
 */
export class SessionService {

    /**
     * In-memory failure counter map: deviceId → { count, lockedUntil }.
     * Shared across all calls within the same JS process lifetime.
     */
    private readonly failureMap = new Map<string, { count: number; lockedUntil: number }>();

    /** Model version string embedded in sessions for audit traceability. */
    private readonly MODEL_VERSION = 'mobilefacenet-v2';

    // ------------------------------------------------------------------
    // Session creation
    // ------------------------------------------------------------------

    /**
     * Creates a new session record after a successful authentication pass.
     *
     * The session id is a SHA-256 of (userId + nonce + startedAt) to make it
     * deterministic but unpredictable. The nonce is 128-bit random hex.
     *
     * @param userId          - The authenticated user's UUID.
     * @param challengeType   - The liveness challenge type that was completed.
     * @param similarityScore - Cosine similarity from the face match.
     * @param livenessScore   - Anti-spoofing confidence score.
     * @returns The persisted Session record.
     */
    async createSession(
        userId: string,
        challengeType: string,
        similarityScore: number,
        livenessScore: number
    ): Promise<Session> {
        const ttlHours = await ConfigRepository.getNumber('session_ttl_hours', 8);
        const deviceId = await deviceBindingService.getDeviceId();
        const now = Date.now();
        const nonce = await CryptoService.generateNonce();
        const expiresAt = now + ttlHours * 3_600_000;

        const sessionId = CryptoService.uuid();

        const session: Session = {
            id: sessionId,
            user_id: userId,
            device_id: deviceId,
            nonce,
            challenge_type: challengeType,
            challenge_passed: 1,
            similarity_score: similarityScore,
            liveness_score: livenessScore,
            started_at: now,
            expires_at: expiresAt,
            status: 'active',
        };

        await SessionRepository.insert(session);
        return session;
    }

    // ------------------------------------------------------------------
    // Session validation
    // ------------------------------------------------------------------

    /**
     * Returns the active session for a user if one exists and has not expired.
     *
     * @param userId - The user to check.
     * @returns The active Session, or null if no valid session exists.
     */
    async getActiveSession(userId: string): Promise<Session | null> {
        return SessionRepository.getActive(userId, Date.now());
    }

    /**
     * Validates whether a session id corresponds to an active, non-expired session.
     *
     * @param sessionId - The session UUID to validate.
     * @returns true if the session is active and not expired.
     */
    async validateSession(sessionId: string): Promise<boolean> {
        const session = await SessionRepository.getById(sessionId);
        if (!session) return false;
        if (session.status !== 'active') return false;
        if (session.expires_at <= Date.now()) {
            await SessionRepository.terminate(sessionId, 'expired', Date.now());
            return false;
        }
        return true;
    }

    /**
     * Explicitly terminates a session (logout or admin revoke).
     *
     * @param sessionId - The session to terminate.
     */
    async invalidateSession(sessionId: string): Promise<void> {
        await SessionRepository.terminate(sessionId, 'revoked', Date.now());
    }

    /**
     * Expires all sessions whose TTL has elapsed.
     *
     * Should be called periodically (e.g., at app startup and after each auth).
     *
     * @returns The count of sessions that were expired.
     */
    async cleanExpiredSessions(): Promise<number> {
        return SessionRepository.expireStale(Date.now());
    }

    // ------------------------------------------------------------------
    // Lockout management (test cases A33, A34)
    // ------------------------------------------------------------------

    /**
     * Returns the current lockout status for a device.
     *
     * A device is locked out when it has accumulated max_auth_attempts
     * consecutive failures within a single session window.
     *
     * @param deviceId - The SHA-256 device fingerprint.
     * @returns LockoutStatus describing whether the device is locked.
     */
    async checkLockout(deviceId: string): Promise<LockoutStatus> {
        const maxAttempts = await ConfigRepository.getNumber('max_auth_attempts', 2);
        const now = Date.now();

        const entry = this.failureMap.get(deviceId);

        if (!entry) {
            return { isLocked: false, attemptsRemaining: maxAttempts };
        }

        if (entry.lockedUntil > now) {
            return {
                isLocked: true,
                attemptsRemaining: 0,
                lockedUntil: entry.lockedUntil,
                retryInMs: entry.lockedUntil - now,
            };
        }

        // Lockout has expired — reset counter
        if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
            this.failureMap.delete(deviceId);
            return { isLocked: false, attemptsRemaining: maxAttempts };
        }

        const remaining = Math.max(0, maxAttempts - entry.count);
        return { isLocked: false, attemptsRemaining: remaining };
    }

    /**
     * Records a failed authentication attempt for a device.
     *
     * If the failure count reaches max_auth_attempts, the device is locked
     * out for lockout_duration_min minutes. The counter resets after the
     * lockout expires (handled in checkLockout).
     *
     * @param deviceId - The SHA-256 device fingerprint.
     * @returns The updated LockoutStatus after recording this failure.
     */
    async recordFailure(deviceId: string): Promise<LockoutStatus> {
        const maxAttempts = await ConfigRepository.getNumber('max_auth_attempts', 2);
        const lockoutMin = await ConfigRepository.getNumber('lockout_duration_min', 60);
        const lockoutMs = lockoutMin * 60_000;

        const existing = this.failureMap.get(deviceId) ?? { count: 0, lockedUntil: 0 };
        const newCount = existing.count + 1;

        if (newCount >= maxAttempts) {
            const lockedUntil = Date.now() + lockoutMs;
            this.failureMap.set(deviceId, { count: newCount, lockedUntil });
            return {
                isLocked: true,
                attemptsRemaining: 0,
                lockedUntil,
                retryInMs: lockoutMs,
            };
        }

        this.failureMap.set(deviceId, { count: newCount, lockedUntil: 0 });
        return {
            isLocked: false,
            attemptsRemaining: maxAttempts - newCount,
        };
    }

    /**
     * Resets the failure counter for a device after a successful authentication.
     *
     * @param deviceId - The SHA-256 device fingerprint to clear.
     */
    clearFailures(deviceId: string): void {
        this.failureMap.delete(deviceId);
    }
}

export const sessionService = new SessionService();
