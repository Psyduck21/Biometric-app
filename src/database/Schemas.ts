export const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    status TEXT NOT NULL DEFAULT 'active',
    enrolled_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS face_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    embedding_cipher TEXT NOT NULL,
    embedding_iv TEXT NOT NULL,
    embedding_tag TEXT NOT NULL,
    quality_score REAL NOT NULL,
    capture_index INTEGER NOT NULL,
    model_version TEXT NOT NULL,
    template_type TEXT NOT NULL DEFAULT 'master',
    created_at INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    event_type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    latitude REAL,
    longitude REAL,
    accuracy_meters REAL,
    geofence_id TEXT,
    geofence_valid INTEGER NOT NULL DEFAULT 0,
    similarity_score REAL NOT NULL,
    session_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_signature TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    synced_at INTEGER,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_cipher TEXT NOT NULL,
    payload_iv TEXT NOT NULL,
    payload_tag TEXT NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 5,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    synced_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS device_bindings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    device_id TEXT NOT NULL,
    device_model TEXT,
    os_version TEXT,
    app_version TEXT,
    public_key TEXT,
    key_algorithm TEXT NOT NULL DEFAULT 'ECDSA_P256',
    attestation_token TEXT,
    attestation_valid INTEGER NOT NULL DEFAULT 0,
    bound_at INTEGER NOT NULL,
    last_verified_at INTEGER,
    key_version TEXT NOT NULL DEFAULT 'v1',
    is_active INTEGER NOT NULL DEFAULT 1,
    revoked_at INTEGER,
    revoke_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    device_id TEXT NOT NULL,
    nonce TEXT UNIQUE NOT NULL,
    challenge_type TEXT NOT NULL,
    challenge_passed INTEGER NOT NULL DEFAULT 0,
    similarity_score REAL NOT NULL,
    liveness_score REAL NOT NULL,
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    ip_address TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    outcome TEXT NOT NULL,
    failure_reason TEXT,
    device_id TEXT,
    timestamp INTEGER NOT NULL,
    metadata TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS configurations (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL,
    description TEXT,
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    updated_by TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_face_templates_user_id ON face_templates(user_id);
  CREATE INDEX IF NOT EXISTS idx_face_templates_active ON face_templates(is_active);
  CREATE INDEX IF NOT EXISTS idx_attendance_user_timestamp ON attendance(user_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_attendance_sync_status ON attendance(sync_status);
  CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry ON sync_queue(status, next_retry_at, priority, created_at);
  CREATE INDEX IF NOT EXISTS idx_device_bindings_user_device ON device_bindings(user_id, device_id);
  CREATE INDEX IF NOT EXISTS idx_device_bindings_active ON device_bindings(is_active);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status, expires_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_sync_status ON audit_logs(sync_status);
`;
