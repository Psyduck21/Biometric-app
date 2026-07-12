/**
 * Extended domain types added in Sprint 3.
 *
 * These types mirror the SQLite schema defined in Schemas.ts and are used
 * by all repository and service layers.
 */

import { BoundingBox, AlignedFrame, EulerAngles } from './models';

export type { BoundingBox, AlignedFrame, EulerAngles };

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

/**
 * A registered user in the system. Mirrors the `users` table.
 */
export interface User {
    id: string;
    employee_id: string;
    full_name: string;
    role: 'employee' | 'supervisor' | 'admin';
    department?: string;
    status: 'active' | 'suspended' | 'deleted';
    enrolled_at: number;
    updated_at: number;
    sync_status: 'pending' | 'synced' | 'failed';
    metadata?: string;
}

// ---------------------------------------------------------------------------
// Face Template
// ---------------------------------------------------------------------------

/**
 * An encrypted face embedding stored for a user. Mirrors `face_templates`.
 *
 * The raw embedding (512-dim Float32Array) is never stored in plaintext;
 * it is AES-256-CBC encrypted before insertion and decrypted on demand.
 */
export interface FaceTemplate {
    id: string;
    user_id: string;
    embedding_cipher: string;
    embedding_iv: string;
    embedding_tag: string;
    quality_score: number;
    capture_index: number;
    model_version: string;
    template_type: 'master' | 'adaptive';
    created_at: number;
    is_active: 0 | 1;
    sync_status: 'pending' | 'synced' | 'failed';
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * An active authentication session. Expires after 8 hours.
 * Mirrors the `sessions` table.
 */
export interface Session {
    id: string;
    user_id: string;
    device_id: string;
    nonce: string;
    challenge_type: string;
    challenge_passed: 0 | 1;
    similarity_score: number;
    liveness_score: number;
    started_at: number;
    expires_at: number;
    ended_at?: number;
    status: 'active' | 'expired' | 'revoked';
    ip_address?: string;
    metadata?: string;
}

// ---------------------------------------------------------------------------
// Device Binding
// ---------------------------------------------------------------------------

/**
 * Associates a user to a specific device. Mirrors `device_bindings`.
 *
 * device_id is a SHA-256 hash of stable device identifiers.
 * attestation_token is reserved for SafetyNet/DeviceCheck JWT (Sprint 5).
 */
export interface DeviceBinding {
    id: string;
    user_id: string;
    device_id: string;
    device_model?: string;
    os_version?: string;
    app_version?: string;
    public_key?: string;
    attestation_token?: string;
    attestation_valid: 0 | 1;
    bound_at: number;
    last_verified_at?: number;
    is_active: 0 | 1;
    revoked_at?: number;
    revoke_reason?: string;
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

/**
 * An immutable audit event. Mirrors `audit_logs`.
 */
export interface AuditLog {
    id: string;
    user_id?: string;
    actor_id?: string;
    action: AuditAction;
    entity_type?: string;
    entity_id?: string;
    outcome: 'success' | 'failure' | 'blocked';
    failure_reason?: string;
    device_id?: string;
    timestamp: number;
    metadata?: string;
    sync_status: 'pending' | 'synced' | 'failed';
}

export type AuditAction =
    | 'enroll'
    | 'enroll_fail'
    | 'enrollment_cloud_fallback'
    | 'auth'
    | 'auth_fail'
    | 'auth_locked'
    | 'sync'
    | 'sync_fail'
    | 'attendance_record'
    | 'device_bind'
    | 'device_revoke'
    | 'admin_suspend'
    | 'admin_config_update'
    | 'identity_takeover_attempt'
    | 'security_check'
    | 'security_fail';

// ---------------------------------------------------------------------------
// Sync Queue
// ---------------------------------------------------------------------------

/**
 * A pending outbound sync item. Mirrors `sync_queue`.
 *
 * The payload is AES-256-CBC encrypted before storage so that the
 * raw entity data is never persisted in plaintext in the queue.
 */
export interface SyncQueueItem {
    id: string;
    entity_type: 'attendance' | 'user' | 'face_template' | 'audit_log' | 'device_binding';
    entity_id: string;
    operation: 'create' | 'update' | 'delete';
    payload_cipher: string;
    payload_iv: string;
    payload_tag: string;
    idempotency_key: string;
    status: 'pending' | 'in_flight' | 'synced' | 'failed' | 'dead';
    priority: number;
    attempt_count: number;
    next_retry_at?: number;
    last_error?: string;
    created_at: number;
    synced_at?: number;
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

/**
 * Result of the multi-signal security gate run before any enrollment or auth.
 */
export interface SecurityReport {
    isRooted: boolean;
    isDebuggerAttached: boolean;
    isEmulator: boolean;
    isOfflineLocked?: boolean;
    isSafe: boolean;
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

/**
 * An in-progress enrollment session managed entirely in memory.
 * It is not persisted until finalizeEnrollment() succeeds.
 */
export interface EnrollmentSession {
    sessionId: string;
    userId: string;
    capturedSamples: number;
    requiredSamples: number;
    samples: EnrollmentSample[];
    status: 'capturing' | 'processing' | 'complete' | 'failed';
    startedAt: number;
    currentChallenge?: string;
}

/**
 * A single captured sample during enrollment — the aligned face frame
 * and the embedding generated from it.
 */
export interface EnrollmentSample {
    alignedFrame: AlignedFrame;
    embedding: Float32Array;
    qualityScore: number;
    captureIndex: number;
}

/**
 * The outcome returned by EnrollmentService.finalizeEnrollment().
 */
export interface EnrollmentResult {
    success: boolean;
    userId?: string;
    templateIds?: string[];
    failureReason?: 'inconsistent_face' | 'quality_insufficient' | 'storage_error' | 'security_fail' | 'identity_mismatch';
    consistencyScore?: number;
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

/**
 * The current lockout status for a device.
 */
export interface LockoutStatus {
    isLocked: boolean;
    attemptsRemaining: number;
    lockedUntil?: number;
    retryInMs?: number;
}

// ---------------------------------------------------------------------------
// Location & Attendance (Sprint 4)
// ---------------------------------------------------------------------------

export type LocationAccuracy = 'high' | 'balanced' | 'low';

export interface GPSCoordinates {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy: number; // meters
    timestamp: number;
    isMocked?: boolean;
}

export type AttendanceEventType = 'check_in' | 'check_out' | 'break_start' | 'break_end';

/**
 * An attendance punch. Mirrors `attendance`.
 */
export interface AttendanceRecord {
    id: string;
    user_id: string;
    event_type: AttendanceEventType;
    timestamp: number;
    latitude?: number;
    longitude?: number;
    accuracy_meters?: number;
    geofence_id?: string;
    geofence_valid: 0 | 1;
    is_location_mocked: 0 | 1;
    similarity_score: number;
    session_id: string;
    device_id: string;
    device_signature?: string;
    sync_status: 'pending' | 'synced' | 'failed';
    synced_at?: number;
    notes?: string;
}
