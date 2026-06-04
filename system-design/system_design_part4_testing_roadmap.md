# Offline Facial Recognition System — Part 4: Testing & Roadmap

---

## 12. Testing Strategy

### 12.1 Test Matrix

| Category | Count | Tool |
|---|---|---|
| Authentication test cases | 50 | Jest + Detox |
| Enrollment test cases | 30 | Jest + Detox |
| Synchronization test cases | 30 | Jest + Supertest |
| Security / Spoofing tests | 20+ | Manual + Appium |
| Performance tests | 10+ | Detox + Perf profiler |
| Offline tests | 10+ | Detox (airplane mode) |

---

### 12.2 Authentication Test Cases (50)

#### Positive Cases (15)

| # | Test Case | Input | Expected |
|---|---|---|---|
| A01 | Successful auth — enrolled user, good lighting | Enrolled face, liveness pass | Session created, attendance logged |
| A02 | Auth within similarity threshold (0.65) | sim=0.66, liveness pass | Success |
| A03 | Auth with glasses | Same user wearing glasses | Success (threshold adjusted) |
| A04 | Auth with minor beard growth | Enrolled clean-shaven | Success if sim>0.65 |
| A05 | Auth in low light (≥50 lux) | Face with lower quality | Success if quality_score>0.4 |
| A06 | Auth after enrollment on same device | Fresh enrollment, same session | Success |
| A07 | Auth time ≤ 1000ms end-to-end | Perf benchmark | Total pipeline < 1000ms |
| A08 | Multiple auths in sequence (5×) | Same user, 5 logins | All succeed, all attendance recorded |
| A09 | Auth with blink challenge | Blink detected EAR<0.25 | Challenge passed |
| A10 | Auth with head-turn challenge | Yaw>15° left then right | Challenge passed |
| A11 | Auth with smile challenge | Lip ratio>0.35 | Challenge passed |
| A12 | Session persists for 8 hours | Auth at T, check at T+7h | Session still active |
| A13 | Session expires at 8 hours | Auth at T, check at T+9h | Session expired |
| A14 | Auth while offline (no network) | Airplane mode on | Success (fully offline) |
| A15 | Auth after OS restart | App cold start | Success (DB persisted) |

#### Negative Cases — Biometric (15)

| # | Test Case | Input | Expected |
|---|---|---|---|
| A16 | Unknown face | Unenrolled person | Auth fail: no_match |
| A17 | Below-threshold similarity | sim=0.50 | Auth fail: no_match |
| A18 | No face detected | Empty frame | Auth fail: no_face |
| A19 | Multiple faces | 2 people in frame | Auth fail: multi_face |
| A20 | Blurry image (motion blur) | Low quality frame | Auth fail: quality |
| A21 | Partially occluded face (50%) | Hand covering face | Auth fail: detection |
| A22 | Very dark environment (<20 lux) | Night conditions | Auth fail: low_quality |
| A23 | Profile face (>45° angle) | Extreme head turn | Auth fail: alignment |
| A24 | Identical twins (if enrolled separately) | Twin of enrolled user | Should fail (≤0.65 threshold) |
| A25 | Old face photo from different angle | Rotated photo | Fail: anti-spoof |
| A26 | Face with heavy makeup | Different makeup | Depends on sim score |
| A27 | Reconstructed 3D mask | Physical 3D print | Anti-spoof blocks |
| A28 | Digital photo displayed on screen | Screen spoof attempt | Liveness/anti-spoof blocks |
| A29 | Video replay of genuine user | Recorded video | Anti-spoof + blink detection blocks |
| A30 | Deepfake video | Synthetic face | Texture analysis blocks |

#### Negative Cases — Security (10)

| # | Test Case | Input | Expected |
|---|---|---|---|
| A31 | Wrong device (cross-device auth) | Enrolled device A, attempt on B | Fail: device_mismatch |
| A32 | Revoked user | Suspended user account | Fail: user_suspended |
| A33 | Lockout after 3 failures | 3× failed attempts | Lockout for 15 min |
| A34 | Auth during lockout | Attempt while locked | Fail: locked, retry_in_Xmin |
| A35 | Tampered SQLite DB | DB file manually edited | Fail: tamper_detected |
| A36 | Rooted device | Root present | Fail: root_detected |
| A37 | Jailbroken device (iOS) | Jailbreak present | Fail: jailbreak_detected |
| A38 | Replay attack (reused nonce) | Same session token reused | Fail: replay_detected |
| A39 | Expired session reuse | Token older than 8h | Fail: session_expired |
| A40 | Forged device ID | Manipulated deviceId | Fail: binding_invalid |

#### Edge Cases (10)

| # | Test Case | Input | Expected |
|---|---|---|---|
| A41 | Auth immediately after enrollment | < 5 seconds | Success |
| A42 | Auth with 5 stored templates | All 5 match checked | Success if any sim>0.65 |
| A43 | Clock skew > 30s | Device clock manipulated | Fail: timestamp_invalid |
| A44 | Very high similarity (sim=0.99) | Perfect match | Success |
| A45 | Simultaneous auth from same user | Race condition | Only first succeeds |
| A46 | Auth while sync in progress | Background sync running | No conflict, success |
| A47 | App backgrounded mid-auth | Camera interrupted | Session reset, restart |
| A48 | Camera permission denied | No camera access | Error: permission_denied |
| A49 | GPS unavailable during auth | GPS off | Auth succeeds; attendance saved without GPS |
| A50 | Auth with corrupted face template | DB corruption | Fail: template_invalid, re-enroll prompt |

---

### 12.3 Enrollment Test Cases (30)

#### Positive Cases (10)

| # | Test Case | Expected |
|---|---|---|
| E01 | Successful enrollment (5 samples, all challenges) | user + 5 templates created, queued for sync |
| E02 | Enrollment in low light (≥50 lux) | Success if quality>0.4 |
| E03 | Enrollment with glasses | Success |
| E04 | Embedding consistency check (all 5 samples mutual sim>0.85) | Accept enrollment |
| E05 | Device binding created on enrollment | DeviceBinding record created |
| E06 | Audit log entry created | AuditLog: action=enroll, outcome=success |
| E07 | Sync queue populated after enrollment | SyncQueue: user + templates, status=pending |
| E08 | Enrollment survives app restart mid-flow | Resume from last captured sample |
| E09 | Second enrollment after first revocation | New templates replace old ones |
| E10 | Admin-initiated enrollment | Admin creates user, operator captures face |

#### Negative Cases (12)

| # | Test Case | Expected |
|---|---|---|
| E11 | No face detected during capture | Retry prompt, no sample saved |
| E12 | Multiple faces during capture | Reject frame, prompt user |
| E13 | Liveness challenge timeout (30s) | Fail: liveness_timeout |
| E14 | Low quality score (<0.4) for all frames | Fail: quality_insufficient |
| E15 | Inconsistent embeddings (sim<0.85) | Fail: inconsistent_face |
| E16 | Duplicate employee_id enrollment | Fail: user_exists |
| E17 | Enrollment on rooted device | Fail: root_detected |
| E18 | Camera closed mid-enrollment | Session invalidated, restart required |
| E19 | Storage full during enrollment | Fail: storage_full |
| E20 | Network unavailable → still enrolls | Success (offline enrollment works) |
| E21 | Enrollment with photo (anti-spoof) | Fail: spoof_detected |
| E22 | Enrollment of minor (age heuristic <18) | Flag for review (configurable) |

#### Edge Cases (8)

| # | Test Case | Expected |
|---|---|---|
| E23 | Capture exactly 5 samples (no more) | Only 5 stored |
| E24 | Re-enrollment of existing user | Old templates marked inactive |
| E25 | Concurrent enrollment attempts | Only first succeeds |
| E26 | Enrollment with expired admin session | Fail: session_expired |
| E27 | All 5 samples taken in < 30 seconds | All quality-checked, accepted |
| E28 | Enrollment with face at 30° angle | Alignment corrects, success |
| E29 | DEK generated and stored in Keystore | Verify Keystore entry exists |
| E30 | Embeddings encrypted in DB | Verify ciphertext ≠ raw embedding |

---

### 12.4 Synchronization Test Cases (30)

#### Positive Cases (10)

| # | Test Case | Expected |
|---|---|---|
| S01 | Sync attendance records when network returns | All pending records uploaded, marked synced |
| S02 | Sync enrollment records | User + templates uploaded |
| S03 | Idempotent sync (same record uploaded twice) | Server deduplicates by idempotencyKey |
| S04 | Batch sync (50 records) | Single API call, all accepted |
| S05 | Sync with partial success (45/50) | 45 marked synced, 5 retried |
| S06 | Auto-sync on network reconnect | NetInfo event triggers sync within 5s |
| S07 | Purge synced records after 24h | Old records deleted |
| S08 | Audit log synced to cloud | AuditLogs uploaded |
| S09 | Config update pulled from server | Local configs updated |
| S10 | Multi-device sync (same user, 2 devices) | Server merges without conflict |

#### Negative Cases (12)

| # | Test Case | Expected |
|---|---|---|
| S11 | Server returns 500 | Item marked RETRY, backoff applied |
| S12 | Server returns 401 | Refresh JWT, retry |
| S13 | Server returns 409 (conflict) | Conflict resolver runs; local archived |
| S14 | Network drops during sync | Partial upload rolled back; retry pending |
| S15 | Corrupted payload → server rejects | Item marked dead after 5 retries |
| S16 | Sync with expired device token | Re-authenticate device, retry sync |
| S17 | Invalid signature on payload | Server rejects; audit log entry |
| S18 | Clock skew > 30s during sync | Server rejects timestamp; log error |
| S19 | Max retries (5) exceeded | Item status = dead, admin alert |
| S20 | Sync blocked by firewall | Retry with exponential backoff |
| S21 | Sync interrupted by app kill | Items remain PENDING, retry on next launch |
| S22 | Duplicate batch submission | Server idempotency → only processed once |

#### Edge Cases (8)

| # | Test Case | Expected |
|---|---|---|
| S23 | Empty sync queue | No API call made |
| S24 | Sync with 0 bytes payload | Rejected with validation error |
| S25 | Sync 1,000 records (stress) | Batched into 20×50 calls, all succeed |
| S26 | Sync while auth in progress | Sync queue pauses, resumes after auth |
| S27 | First sync after 30 days offline | All 30 days records uploaded |
| S28 | Sync with revoked user | Server rejects; local audit logs |
| S29 | Config sync pushes threshold change | Local similarity_threshold updated |
| S30 | Dead-letter review by admin | Admin API returns dead queue items |

---

### 12.5 Performance Benchmarks

| Metric | Target | Test Method |
|---|---|---|
| Face detection (BlazeFace) | < 10 ms/frame | TFLite benchmark tool |
| Face mesh (MediaPipe) | < 20 ms/frame | TFLite benchmark tool |
| Embedding generation (MobileFaceNet) | < 50 ms | Benchmark on Snapdragon 720G |
| Anti-spoof inference | < 30 ms | Benchmark |
| End-to-end auth pipeline | < 1000 ms | Detox performance test |
| DB write (attendance) | < 5 ms | SQLite benchmark |
| Cosine similarity (1000 templates) | < 10 ms | JS benchmark |
| Sync batch (50 records) | < 5 seconds | Integration test |

---

## 13. UML Sequence Diagrams

### 13.1 Enrollment Flow

```
Operator   EnrollmentScreen   EnrollmentService   SecurityCheckService
   │              │                  │                     │
   │──startEnroll()─►│               │                     │
   │              │──startEnrollment(userId)──────────────►│
   │              │              │   │──isRooted/Jailbroken?
   │              │              │   │◄── false (safe)
   │              │──────────────►   │
   │              │   ◄─EnrollmentSession
   │              │                  │
   │   [Camera Loop × 5 samples]     │
   │              │──captureFrame()──►
   │              │   ◄─CaptureResult (face detected, liveness)
   │              │──runChallenge(blink/turn/smile)──►
   │              │   ◄─challengePassed=true
   │              │──generateEmbedding(alignedFrame)──►
   │              │   [TFLite: MobileFaceNet inference]
   │              │   ◄─embedding[512]
   │              │                  │
   │   [After 5 samples]             │
   │              │──finalizeEnrollment()──►
   │              │   [validateConsistency → cosine sim > 0.85]
   │              │   [encrypt embeddings → AES-256-GCM]
   │              │   [saveFaceTemplate × 5 → SQLite]
   │              │   [enqueue sync → SyncQueue]
   │              │   ◄─EnrollmentResult{success:true}
   │◄─Success UI  │
```

### 13.2 Authentication Flow

```
User   FaceAuthScreen   AuthService   LivenessService   MatchEngine   SessionService   AttendanceService
  │         │               │               │               │               │               │
  │─tap()──►│               │               │               │               │               │
  │         │──authenticate(deviceId)──────►│               │               │               │
  │         │               │──checkLockout()               │               │               │
  │         │               │◄─notLocked                    │               │               │
  │         │               │──checkRoot()                  │               │               │
  │         │               │◄─safe                         │               │               │
  │         │               │──detectFace(frame)            │               │               │
  │         │               │  [BlazeFace TFLite]           │               │               │
  │         │               │◄─{face:1,bbox}                │               │               │
  │         │               │──computeAntiSpoof(frame)──────►               │               │
  │         │               │               │◄─score:0.92   │               │               │
  │         │               │──runChallenge(random)─────────►               │               │
  │         │               │               │◄─passed:true  │               │               │
  │         │               │──generateEmbedding(aligned)   │               │               │
  │         │               │  [MobileFaceNet TFLite]        │               │               │
  │         │               │◄─query[512]                   │               │               │
  │         │               │──matchEmbedding(query)───────────────────────►│               │
  │         │               │  [load+decrypt templates]      │               │               │
  │         │               │  [cosine sim × N templates]    │               │               │
  │         │               │◄──────{matched:true,sim:0.78}──────────────────               │
  │         │               │──verifyDeviceBinding(userId,deviceId)         │               │
  │         │               │◄─valid                        │               │               │
  │         │               │──createSession()──────────────────────────────────────────── ►│
  │         │               │◄──────────────────────────────────────────────────Session──────
  │         │               │──recordAttendance(session,check_in,GPS)──────────────────────►│
  │         │               │◄──────────────────────────────────────────────────AttendanceRecord
  │         │               │──writeAuditLog(auth,success)  │               │               │
  │         │◄─AuthResult{success,sessionId}                │               │               │
  │◄─Success│               │               │               │               │               │
```

---

## 14. Development Roadmap

### Sprint 0: Foundation (Week 1–2)
- [ ] Initialize React Native project with TypeScript
- [ ] Configure ESLint, Prettier, Husky pre-commit
- [ ] Install + configure `op-sqlite` (SQLCipher build) + migration runner
- [ ] Implement all 8 database tables + indexes
- [ ] Create repository pattern for all tables
- [ ] Configure Redux Toolkit store
- [ ] Set up React Navigation skeleton
- [ ] Install + configure `react-native-keychain` (Keystore/Enclave via JS)
- [ ] Install + configure `react-native-aes-crypto` for AES-256
- [ ] CryptoService (AES-256-GCM) unit tested

### Sprint 1: AI Engine (Week 3–4)
- [ ] Convert TFLite models → tfjs format using `tensorflowjs_converter`
- [ ] Bundle tfjs model assets into Android + iOS app bundle
- [ ] Install + configure `@tensorflow/tfjs` + `@tensorflow/tfjs-react-native`
- [ ] Install + configure `react-native-vision-camera` v4 + Frame Processors
- [ ] FaceDetectorService (BlazeFace via tfjs)
- [ ] FaceAlignmentService (5-point affine in TypeScript)
- [ ] EmbeddingService (MobileFaceNet via tfjs)
- [ ] Cosine similarity matching engine (pure TypeScript)
- [ ] Unit tests: AI services (mocked model tensors)
- [ ] Benchmark inference times on mid-range device (target < 100 ms total)

### Sprint 2: Liveness & Anti-Spoofing (Week 5–6)
- [ ] MediaPipe Face Mesh integration
- [ ] EAR blink detection
- [ ] Head pose estimation (solvePnP)
- [ ] Smile detection
- [ ] Anti-spoofing CNN model integration
- [ ] Challenge-response system
- [ ] LivenessService with all 3 challenge types
- [ ] Anti-spoofing test suite (photo, video, screen attacks)

### Sprint 3: Enrollment & Security (Week 7–8)
- [ ] EnrollmentService with 5-sample flow
- [ ] Root/jailbreak detection (Android + iOS)
- [ ] DeviceBindingService + SafetyNet/DeviceCheck
- [ ] SecurityCheckService (multi-signal)
- [ ] Enrollment UI screens
- [ ] SessionService with lockout mechanism
- [ ] 30 enrollment test cases passing
- [ ] Security audit: encryption, key storage

### Sprint 4: Authentication & Attendance (Week 9–10)
- [ ] AuthenticationService (full pipeline)
- [ ] FaceAuthScreen with real-time overlay
- [ ] LocationService + GeofenceService
- [ ] AttendanceService (offline-first)
- [ ] Attendance UI (check-in/out, history)
- [ ] AuditService + log rotation
- [ ] 50 authentication test cases passing
- [ ] End-to-end offline test (airplane mode)

### Sprint 5: Sync & Cloud (Week 11–13)
- [ ] Supabase project initialization & configuration
- [ ] Database schema deployment to Supabase Postgres
- [ ] Supabase Storage bucket setup (for face embeddings)
- [ ] Row-Level Security (RLS) policies
- [ ] SyncService + SyncQueueService
- [ ] Exponential backoff + dead letter handling
- [ ] 30 synchronization test cases passing
- [ ] Performance test: sync 1000 records

### Sprint 6: Admin, Polish & Launch (Week 14–16)
- [ ] Admin screens (user management, configs)
- [ ] RBAC enforcement (employee/supervisor/admin)
- [ ] CloudWatch dashboards + alerts
- [ ] Load testing (1000 concurrent devices)
- [ ] Penetration testing (OWASP Mobile Top 10)
- [ ] Spoofing test suite (physical + digital)
- [ ] App Store / Google Play submission prep
- [ ] Documentation: developer guide, ops runbook

---

## 15. Performance Targets Summary

| Metric | Target | Critical |
|---|---|---|
| Total model size | < 9 MB | Yes |
| Authentication latency | < 1000 ms | Yes |
| Face detection | < 10 ms | Yes |
| Embedding generation | < 50 ms | Yes |
| DB read (templates) | < 5 ms | Yes |
| App cold start | < 3 s | Medium |
| Battery impact | < 5% per 50 auths | Medium |
| Offline storage (1 yr attendance) | < 50 MB | Low |
| Sync (50 records) | < 5 s | Medium |
| FAR (False Accept Rate) | < 0.1% | Critical |
| FRR (False Reject Rate) | < 2% | High |

---

## 16. OWASP Mobile Security Checklist

| ID | Control | Implementation |
|---|---|---|
| M1 | Improper Credential Usage | No passwords stored; only biometric |
| M2 | Inadequate Supply Chain Security | Lock npm deps with lockfile + audit |
| M3 | Insecure Authentication | Multi-factor: biometric + device + liveness |
| M4 | Insufficient Input/Output Validation | Zod schema validation on all inputs |
| M5 | Insecure Communication | TLS 1.3 + cert pinning |
| M6 | Inadequate Privacy Controls | No PII in logs; embeddings never in plaintext outside Keystore |
| M7 | Insufficient Binary Protections | ProGuard/R8 + Hermes (Android), Bitcode disabled + symbol stripping (iOS) — configured via RN build settings |
| M8 | Security Misconfiguration | No debug builds in prod; APK signing enforced |
| M9 | Insecure Data Storage | SQLCipher + Keystore/Enclave for all sensitive data |
| M10 | Insufficient Cryptography | AES-256-GCM; no ECB, no MD5/SHA1 |

---

*End of System Design Document*

**Document Structure:**
- **Part 1:** [HLD & Architecture](system_design_part1_hld_architecture.md) — System context, tech stack, security layers, AI pipeline
- **Part 2:** [Database & LLD](system_design_part2_database_lld.md) — Full SQLite schema, REST API, 14-module LLD
- **Part 3:** [RN Architecture & Cloud](system_design_part3_rn_cloud.md) — Folder structure, native bridges, AWS design
- **Part 4:** [Testing & Roadmap](system_design_part4_testing_roadmap.md) — 110 test cases, sequence diagrams, 16-week roadmap
