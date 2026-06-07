# Admin Role & Dashboard Task List

This document outlines the required features and responsibilities for the "Admin" role within the biometric application. When we begin building the Admin UI and backend controls, we will use this list to ensure all critical security and management workflows are implemented.

## 1. Identity & Enrollment Management
- [ ] **Hard Reset Biometrics (Admin Override)**
  - Capability to manually revoke (`is_active = 0`) all face templates for a user.
  - Required for users who undergo drastic facial changes or have corrupted enrollments, allowing them to bypass the Re-enrollment Similarity Gate.
- [ ] **Account Suspension**
  - Ability to toggle user status between `active` and `suspended`. 
  - Suspended users should immediately be blocked from capturing attendance or authenticating locally.

## 2. Device Security Management
- [ ] **Revoke Device Bindings**
  - Manually unlink an employee from their current hardware device.
  - Required if an employee loses their phone or upgrades to a new device.
- [ ] **Lockout Reset**
  - Reset the anti-brute-force lockout counters if an employee gets permanently locked out of their device due to too many failed biometric attempts.

## 3. Compliance & Auditing
- [ ] **Security Incident Dashboard**
  - View real-time security alerts synced from devices.
  - Specifically monitor for `identity_takeover_attempt` and `device_reassigned` events.
- [ ] **Audit Log Viewer**
  - Browse immutable audit logs for individual users to trace the lifecycle of their identity (enrollments, binding changes, sync failures).

## 4. System Configuration
- [ ] **Dynamic Threshold Management**
  - Adjust global security thresholds stored in the `ConfigRepository` without requiring an app update.
  - *Key Thresholds to expose:*
    - `re_enroll_similarity_threshold` (Default: 0.65)
    - `min_consistency_score` (Default: 0.55)
    - `auth_similarity_threshold` (Default: 0.70)
- [ ] **Force Sync Command**
  - Send a push notification/command to a specific device forcing it to flush its offline `sync_queue` to the cloud immediately.
