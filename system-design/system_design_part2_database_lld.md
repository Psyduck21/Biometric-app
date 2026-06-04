# Offline Facial Recognition System — Part 2: Database & LLD

---

## 7. Database Design (SQLite + SQLCipher)

### 7.1 Schema Overview

All tables stored in a single SQLCipher-encrypted `.db` file.  
Encryption key derived via PBKDF2 from device Keystore master key.

---

### Table: `users`

```sql
CREATE TABLE users (
  id               TEXT PRIMARY KEY,          -- UUID v4
  employee_id      TEXT UNIQUE NOT NULL,       -- HR system ID
  full_name        TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'employee', -- employee|supervisor|admin
  department       TEXT,
  status           TEXT NOT NULL DEFAULT 'active',   -- active|suspended|deleted
  enrolled_at      INTEGER NOT NULL,           -- Unix epoch ms
  updated_at       INTEGER NOT NULL,
  sync_status      TEXT NOT NULL DEFAULT 'pending',  -- pending|synced|failed
  metadata         TEXT                        -- JSON blob (extra fields)
);

CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_sync_status ON users(sync_status);
```

---

### Table: `face_templates`

```sql
CREATE TABLE face_templates (
  id               TEXT PRIMARY KEY,           -- UUID v4
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  embedding_cipher TEXT NOT NULL,              -- Base64(AES-256-GCM(embedding_bytes))
  embedding_iv     TEXT NOT NULL,              -- Base64(96-bit nonce)
  embedding_tag    TEXT NOT NULL,              -- Base64(128-bit GCM auth tag)
  quality_score    REAL NOT NULL,              -- 0.0–1.0 (pose, lighting, sharpness)
  capture_index    INTEGER NOT NULL,           -- 1–5 (sample number during enrollment)
  model_version    TEXT NOT NULL,              -- e.g. "mobilefacenet-v2-int8"
  created_at       INTEGER NOT NULL,
  is_active        INTEGER NOT NULL DEFAULT 1, -- 0=revoked
  sync_status      TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_ft_user_id ON face_templates(user_id);
CREATE INDEX idx_ft_active ON face_templates(user_id, is_active);
```

---

### Table: `attendance`

```sql
CREATE TABLE attendance (
  id               TEXT PRIMARY KEY,           -- UUID v4
  user_id          TEXT NOT NULL REFERENCES users(id),
  event_type       TEXT NOT NULL,              -- check_in|check_out|break_start|break_end
  timestamp        INTEGER NOT NULL,           -- Unix epoch ms (device clock)
  latitude         REAL,                       -- GPS lat (NULL if unavailable)
  longitude        REAL,                       -- GPS lon
  accuracy_meters  REAL,                       -- GPS accuracy
  geofence_id      TEXT,                       -- FK to configurations.geofence_id
  geofence_valid   INTEGER NOT NULL DEFAULT 0, -- 1=within geofence
  similarity_score REAL NOT NULL,              -- Face match score at auth time
  session_id       TEXT NOT NULL REFERENCES sessions(id),
  device_id        TEXT NOT NULL,
  sync_status      TEXT NOT NULL DEFAULT 'pending',
  synced_at        INTEGER,
  notes            TEXT                        -- JSON blob
);

CREATE INDEX idx_att_user_date ON attendance(user_id, timestamp);
CREATE INDEX idx_att_sync ON attendance(sync_status);
CREATE INDEX idx_att_session ON attendance(session_id);
CREATE UNIQUE INDEX idx_att_idempotency ON attendance(user_id, event_type, timestamp / 300000); -- 5-min dedup
```

---

### Table: `sync_queue`

```sql
CREATE TABLE sync_queue (
  id               TEXT PRIMARY KEY,           -- UUID v4
  entity_type      TEXT NOT NULL,              -- attendance|user|face_template|audit_log
  entity_id        TEXT NOT NULL,              -- FK to respective table
  operation        TEXT NOT NULL,              -- create|update|delete
  payload_cipher   TEXT NOT NULL,              -- AES-256-GCM encrypted JSON payload
  payload_iv       TEXT NOT NULL,
  payload_tag      TEXT NOT NULL,
  idempotency_key  TEXT UNIQUE NOT NULL,       -- SHA-256(entity_type+entity_id+operation)
  status           TEXT NOT NULL DEFAULT 'pending', -- pending|in_flight|synced|failed|dead
  priority         INTEGER NOT NULL DEFAULT 5, -- 1=highest, 10=lowest
  attempt_count    INTEGER NOT NULL DEFAULT 0,
  next_retry_at    INTEGER,                    -- Unix epoch ms
  last_error       TEXT,
  created_at       INTEGER NOT NULL,
  synced_at        INTEGER
);

CREATE INDEX idx_sq_status_priority ON sync_queue(status, priority, next_retry_at);
CREATE INDEX idx_sq_entity ON sync_queue(entity_type, entity_id);
```

---

### Table: `device_bindings`

```sql
CREATE TABLE device_bindings (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id),
  device_id           TEXT NOT NULL,           -- SHA-256 fingerprint
  device_model        TEXT,
  os_version          TEXT,
  app_version         TEXT,
  attestation_token   TEXT,                    -- SafetyNet/DeviceCheck JWT
  attestation_valid   INTEGER NOT NULL DEFAULT 0,
  bound_at            INTEGER NOT NULL,
  last_verified_at    INTEGER,
  is_active           INTEGER NOT NULL DEFAULT 1,
  revoked_at          INTEGER,
  revoke_reason       TEXT
);

CREATE UNIQUE INDEX idx_db_user_device ON device_bindings(user_id, device_id);
CREATE INDEX idx_db_device ON device_bindings(device_id, is_active);
```

---

### Table: `sessions`

```sql
CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,           -- UUID v4
  user_id          TEXT NOT NULL REFERENCES users(id),
  device_id        TEXT NOT NULL,
  nonce            TEXT UNIQUE NOT NULL,        -- 128-bit replay-prevention nonce
  challenge_type   TEXT NOT NULL,              -- blink|head_turn|smile
  challenge_passed INTEGER NOT NULL DEFAULT 0,
  similarity_score REAL NOT NULL,
  liveness_score   REAL NOT NULL,
  started_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,           -- started_at + 8h
  ended_at         INTEGER,
  status           TEXT NOT NULL DEFAULT 'active', -- active|expired|revoked
  ip_address       TEXT,                       -- populated on sync
  metadata         TEXT
);

CREATE INDEX idx_sess_user ON sessions(user_id, status);
CREATE INDEX idx_sess_nonce ON sessions(nonce);
CREATE INDEX idx_sess_expires ON sessions(expires_at);
```

---

### Table: `audit_logs`

```sql
CREATE TABLE audit_logs (
  id               TEXT PRIMARY KEY,
  user_id          TEXT,                        -- NULL for system events
  actor_id         TEXT,                        -- who performed action
  action           TEXT NOT NULL,               -- enroll|auth|auth_fail|sync|revoke|admin_*
  entity_type      TEXT,
  entity_id        TEXT,
  outcome          TEXT NOT NULL,               -- success|failure|blocked
  failure_reason   TEXT,
  device_id        TEXT,
  timestamp        INTEGER NOT NULL,
  metadata         TEXT,                        -- JSON: scores, errors, extra
  sync_status      TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX idx_al_user ON audit_logs(user_id, timestamp);
CREATE INDEX idx_al_action ON audit_logs(action, outcome);
CREATE INDEX idx_al_sync ON audit_logs(sync_status);
```

---

### Table: `configurations`

```sql
CREATE TABLE configurations (
  key              TEXT PRIMARY KEY,
  value            TEXT NOT NULL,              -- JSON or scalar
  value_type       TEXT NOT NULL,              -- string|number|boolean|json
  description      TEXT,
  is_encrypted     INTEGER NOT NULL DEFAULT 0,
  updated_at       INTEGER NOT NULL,
  updated_by       TEXT                        -- admin user_id or 'system'
);

-- Seed data (defaults)
INSERT INTO configurations VALUES
  ('similarity_threshold',    '0.65',    'number',  'Cosine similarity cutoff',      0, <now>, 'system'),
  ('liveness_threshold',      '0.85',    'number',  'Anti-spoofing score cutoff',    0, <now>, 'system'),
  ('max_enrollment_samples',  '5',       'number',  'Face samples per enrollment',   0, <now>, 'system'),
  ('session_ttl_hours',       '8',       'number',  'Session validity in hours',     0, <now>, 'system'),
  ('sync_batch_size',         '50',      'number',  'Records per sync batch',        0, <now>, 'system'),
  ('geofences',               '[...]',   'json',    'GeoJSON polygon array',         0, <now>, 'system'),
  ('max_auth_attempts',       '3',       'number',  'Lockout after N failures',      0, <now>, 'system'),
  ('lockout_duration_min',    '15',      'number',  'Lockout period in minutes',     0, <now>, 'system');
```

---

## 8. REST API Design

Base URL: `https://api.yourapp.com/v1`  
Auth: Bearer JWT (Cognito device token)  
All bodies: `application/json`, AES-256-GCM encrypted payload field

### 8.1 Authentication & Device

```
POST   /auth/device-token          Register device, get JWT
POST   /auth/refresh               Refresh JWT
DELETE /auth/device-token          Revoke device
GET    /auth/device/{deviceId}     Get device status
```

### 8.2 Enrollment

```
POST   /enrollment/users           Create user record
POST   /enrollment/face-templates  Upload encrypted face templates (batch)
GET    /enrollment/users/{id}      Get user enrollment status
PATCH  /enrollment/users/{id}      Update enrollment metadata
DELETE /enrollment/users/{id}      Soft-delete + revoke
```

### 8.3 Attendance Sync

```
POST   /attendance/sync            Upload attendance batch (max 50)
GET    /attendance/{userId}        Get attendance history
GET    /attendance/report          Date-range report (supervisor+)
```

### 8.4 Sync Queue

```
POST   /sync/batch                 Generic sync batch (multi-entity)
GET    /sync/status/{idempotencyKey} Check upload status
POST   /sync/ack                   Acknowledge successful receipt
```

### 8.5 Admin

```
GET    /admin/users                List all users (admin)
POST   /admin/users/{id}/suspend   Suspend user
POST   /admin/configurations       Push new config to devices
GET    /admin/audit-logs           Query audit logs
POST   /admin/revoke-device        Revoke device binding
```

### 8.6 Request/Response Format

```json
// POST /attendance/sync — Request
{
  "deviceId": "sha256-device-fingerprint",
  "batchId": "uuid-v4",
  "timestamp": 1717046400000,
  "signature": "HMAC-SHA256(batchId+timestamp, deviceKey)",
  "records": [
    {
      "idempotencyKey": "sha256-...",
      "payload": "base64(AES-256-GCM-ciphertext)",
      "iv": "base64-nonce",
      "tag": "base64-auth-tag"
    }
  ]
}

// Response
{
  "batchId": "uuid-v4",
  "accepted": ["idempotencyKey1", "idempotencyKey2"],
  "rejected": [
    { "idempotencyKey": "...", "reason": "duplicate" }
  ],
  "serverTimestamp": 1717046401234
}
```

---

## 9. Low-Level Design (LLD) — All Modules

### 9.1 Enrollment Module

**Responsibilities:** Orchestrate multi-sample face capture, liveness verification, embedding generation, encryption, storage, and sync queuing.

**Class:**
```typescript
class EnrollmentService {
  constructor(
    private cameraService: CameraService,
    private faceDetector: FaceDetectorService,
    private livenessService: LivenessService,
    private embeddingService: EmbeddingService,
    private cryptoService: CryptoService,
    private storageService: StorageService,
    private syncQueue: SyncQueueService
  ) {}

  async startEnrollment(userId: string): Promise<EnrollmentSession>
  async captureFrame(sessionId: string): Promise<CaptureResult>
  async runLivenessChallenge(sessionId: string, challenge: ChallengeType): Promise<boolean>
  async generateEmbedding(frame: AlignedFrame): Promise<Float32Array>
  async finalizeEnrollment(sessionId: string): Promise<EnrollmentResult>
  async validateEmbeddingConsistency(embeddings: Float32Array[]): Promise<boolean>
  private async encryptAndStore(userId: string, embeddings: Float32Array[]): Promise<void>
}

interface EnrollmentSession {
  sessionId: string;
  userId: string;
  capturedSamples: number;     // 0–5
  requiredSamples: number;     // 5
  currentChallenge: ChallengeType;
  status: 'capturing' | 'liveness' | 'processing' | 'complete' | 'failed';
  startedAt: number;
}

interface CaptureResult {
  frame: AlignedFrame;
  faceDetected: boolean;
  multipleFaces: boolean;
  qualityScore: number;
  livenessScore: number;
}
```

**Sequence:**
```
User → EnrollmentScreen
     → EnrollmentService.startEnrollment()
     → CameraService.startStream()
     → FaceDetectorService.detect() [loop until face found]
     → LivenessService.runChallenge(blink)
     → EmbeddingService.generate(alignedFrame) × 5
     → EnrollmentService.validateConsistency()
     → CryptoService.encrypt(embedding)
     → StorageService.saveFaceTemplate()
     → SyncQueueService.enqueue(face_template, create)
     → EnrollmentComplete event
```

---

### 9.2 Authentication Module

**Responsibilities:** Full auth pipeline from frame capture to session creation.

```typescript
class AuthenticationService {
  async authenticate(deviceId: string): Promise<AuthResult>
  async verifyDeviceBinding(userId: string, deviceId: string): Promise<boolean>
  async matchEmbedding(query: Float32Array, userId?: string): Promise<MatchResult>
  async createSession(userId: string, matchResult: MatchResult): Promise<Session>
  async handleAuthFailure(deviceId: string, reason: string): Promise<void>
  async checkLockout(deviceId: string): Promise<LockoutStatus>
  private async loadTemplates(userId?: string): Promise<EncryptedTemplate[]>
  private async decryptTemplates(templates: EncryptedTemplate[]): Promise<Float32Array[]>
}

interface AuthResult {
  success: boolean;
  userId?: string;
  sessionId?: string;
  similarityScore?: number;
  livenessScore?: number;
  failureReason?: 'no_face' | 'multi_face' | 'liveness_fail' | 'no_match' | 'device_mismatch' | 'locked';
  attemptsRemaining?: number;
}

interface MatchResult {
  matched: boolean;
  userId?: string;
  similarity: number;
  templateId?: string;
}
```

---

### 9.3 Face Detection Module

```typescript
class FaceDetectorService {
  private model: TFLiteModel; // BlazeFace

  async initialize(): Promise<void>
  async detectFaces(frame: CameraFrame): Promise<DetectionResult>
  async alignFace(frame: CameraFrame, bbox: BoundingBox): Promise<AlignedFrame>
  async extractLandmarks(frame: CameraFrame): Promise<Landmark[]>

  private applyAffineTransform(frame: CameraFrame, landmarks: Landmark[]): AlignedFrame
}

interface DetectionResult {
  faces: FaceDetection[];
  frameWidth: number;
  frameHeight: number;
  processingTimeMs: number;
}

interface FaceDetection {
  bbox: BoundingBox;       // { x, y, width, height }
  confidence: number;
  landmarks: Landmark[];   // 6 key points
}

interface AlignedFrame {
  pixels: Uint8Array;      // 112×112×3 RGB
  originalBbox: BoundingBox;
  alignmentScore: number;
}
```

---

### 9.4 Liveness Module

```typescript
class LivenessService {
  private faceMeshModel: TFLiteModel;      // MediaPipe Face Mesh
  private antiSpoofModel: TFLiteModel;     // Custom CNN

  async initialize(): Promise<void>
  async detectBlink(frames: CameraFrame[]): Promise<BlinkResult>
  async detectHeadTurn(frames: CameraFrame[]): Promise<HeadPoseResult>
  async detectSmile(frame: CameraFrame): Promise<SmileResult>
  async runChallenge(type: ChallengeType, timeoutMs: number): Promise<ChallengeResult>
  async computeAntiSpoofScore(frame: AlignedFrame): Promise<number>
  
  private computeEAR(landmarks: Landmark[], eye: 'left' | 'right'): number
  private estimateHeadPose(landmarks: Landmark[]): EulerAngles
  private computeSmileRatio(landmarks: Landmark[]): number
}

type ChallengeType = 'blink' | 'turn_left' | 'turn_right' | 'smile';

interface ChallengeResult {
  passed: boolean;
  challengeType: ChallengeType;
  durationMs: number;
  antiSpoofScore: number;
  earMin?: number;         // for blink
  yawMax?: number;         // for head turn
}
```

---

### 9.5 Attendance Module

```typescript
class AttendanceService {
  async recordAttendance(
    session: Session,
    eventType: AttendanceEventType,
    location: GPSCoordinates
  ): Promise<AttendanceRecord>

  async validateGeofence(location: GPSCoordinates, geofenceId: string): Promise<boolean>
  async getTodayAttendance(userId: string): Promise<AttendanceRecord[]>
  async getOfflineQueue(): Promise<AttendanceRecord[]>

  private haversineDistance(a: GPSCoordinates, b: GPSCoordinates): number // meters
  private isInsidePolygon(point: GPSCoordinates, polygon: GPSCoordinates[]): boolean
}

type AttendanceEventType = 'check_in' | 'check_out' | 'break_start' | 'break_end';
```

---

### 9.6 Location Module

```typescript
class LocationService {
  async requestPermissions(): Promise<boolean>
  async getCurrentPosition(accuracy: LocationAccuracy): Promise<GPSCoordinates>
  async startWatching(callback: (loc: GPSCoordinates) => void): Promise<void>
  async stopWatching(): Promise<void>
  async getLastKnownPosition(): Promise<GPSCoordinates | null>
  async isGPSEnabled(): Promise<boolean>
}

interface GPSCoordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy: number;      // meters
  timestamp: number;
}
```

---

### 9.7 Storage Module

```typescript
class StorageService {
  private db: SQLiteDatabase;

  async initialize(): Promise<void>
  async saveUser(user: User): Promise<void>
  async saveFaceTemplate(template: FaceTemplate): Promise<void>
  async getActiveTemplates(userId?: string): Promise<FaceTemplate[]>
  async saveAttendance(record: AttendanceRecord): Promise<void>
  async enqueueSyncItem(item: SyncQueueItem): Promise<void>
  async getPendingSyncItems(limit: number): Promise<SyncQueueItem[]>
  async markSynced(idempotencyKeys: string[]): Promise<void>
  async saveAuditLog(log: AuditLog): Promise<void>
  async getConfig(key: string): Promise<string | null>
  async setConfig(key: string, value: string): Promise<void>
  async runMigrations(): Promise<void>
  async vacuum(): Promise<void>
}
```

---

### 9.8 Security Module

```typescript
class CryptoService {
  // Key management
  async getMasterKey(): Promise<CryptoKey>       // from Keystore/Secure Enclave
  async getDEK(userId: string): Promise<CryptoKey>
  async rotateDEK(userId: string): Promise<void>

  // Encryption
  async encrypt(plaintext: ArrayBuffer, key: CryptoKey): Promise<EncryptedPayload>
  async decrypt(payload: EncryptedPayload, key: CryptoKey): Promise<ArrayBuffer>

  // Hashing & signing
  async hash(data: string): Promise<string>              // SHA-256
  async hmac(data: string, key: string): Promise<string> // HMAC-SHA256
  async generateNonce(): Promise<string>                 // 128-bit random

  // Device
  async getDeviceId(): Promise<string>
  async attestDevice(): Promise<string>                  // SafetyNet / DeviceCheck JWT
}

interface EncryptedPayload {
  ciphertext: string;  // Base64
  iv: string;          // Base64 (96-bit nonce)
  tag: string;         // Base64 (128-bit GCM tag)
}
```

---

### 9.9 Sync Module

```typescript
class SyncService {
  private isRunning = false;

  async startSyncLoop(): Promise<void>
  async syncBatch(): Promise<SyncResult>
  async processSyncItem(item: SyncQueueItem): Promise<boolean>
  async handleSyncFailure(item: SyncQueueItem, error: Error): Promise<void>
  async purgeCompletedItems(olderThanHours: number): Promise<number>
  async getQueueStats(): Promise<QueueStats>
  
  private calculateBackoff(attemptCount: number): number // exponential: 2^n * 1000 ms, max 1h
}

interface SyncResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}
```

---

### 9.10 Device Binding Module

```typescript
class DeviceBindingService {
  async bindDevice(userId: string): Promise<DeviceBinding>
  async verifyBinding(userId: string, deviceId: string): Promise<boolean>
  async revokeBinding(userId: string, deviceId: string): Promise<void>
  async getActiveBinding(deviceId: string): Promise<DeviceBinding | null>
  async refreshAttestation(bindingId: string): Promise<void>
  
  private generateDeviceId(): string // SHA-256(IMEI+AndroidId+BundleId)
}
```

---

### 9.11 Session Module

```typescript
class SessionService {
  async createSession(userId: string, authResult: AuthResult): Promise<Session>
  async getActiveSession(userId: string): Promise<Session | null>
  async invalidateSession(sessionId: string): Promise<void>
  async validateSession(sessionId: string): Promise<boolean>
  async cleanExpiredSessions(): Promise<number>
  
  private generateSessionToken(session: Session): string // HMAC-SHA256
}
```

---

### 9.12 Audit Module

```typescript
class AuditService {
  async log(entry: AuditEntry): Promise<void>
  async getRecentLogs(userId: string, limit: number): Promise<AuditLog[]>
  async searchLogs(filter: AuditFilter): Promise<AuditLog[]>
  async exportLogs(startDate: number, endDate: number): Promise<string> // CSV
}

interface AuditEntry {
  userId?: string;
  actorId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  outcome: 'success' | 'failure' | 'blocked';
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

type AuditAction = 
  | 'enroll' | 'enroll_fail'
  | 'auth' | 'auth_fail' | 'auth_locked'
  | 'sync' | 'sync_fail'
  | 'attendance_record'
  | 'device_bind' | 'device_revoke'
  | 'admin_suspend' | 'admin_config_update';
```

---

*→ Continue to Part 3: React Native Architecture, Folder Structure & Cloud Design*
