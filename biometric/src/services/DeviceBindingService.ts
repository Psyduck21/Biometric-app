import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { CryptoService } from './CryptoService';
import { DeviceBindingRepository } from '../database/repositories/DeviceBindingRepository';
import { DeviceBinding } from '../types/domain';
import type { Transaction } from '@op-engineering/op-sqlite';

/**
 * DeviceBindingService
 *
 * Associates a user's biometric enrollment to a specific physical device.
 *
 * The device identity is a SHA-256 hash of stable, non-PII device identifiers:
 *   Android: SHA-256(androidId + model + manufacturer)
 *   iOS:     SHA-256(identifierForVendor + model)
 *
 * This prevents cross-device authentication (test case A31) — if a user's
 * face templates are copied to another device, auth will fail because the
 * device_id stored in the binding will not match.
 *
 * SafetyNet / DeviceCheck JWT attestation tokens are reserved for Sprint 5
 * when cloud validation is introduced. The attestation_token column is
 * currently stored as null.
 *
 * Reference: system_design_part2_database_lld.md, Section 9.10
 */
export class DeviceBindingService {

    /**
     * Computes the deterministic device fingerprint for the current device.
     *
     * The fingerprint is a SHA-256 hash of a concatenation of stable
     * device properties. No PII (IMEI, phone number) is included.
     *
     * @returns A 64-character lowercase hex string.
     */
    async getDeviceId(): Promise<string> {
        const parts: string[] = [];

        if (Platform.OS === 'android') {
            // androidId is stable per-app-signing-key since Android 8.0
            const androidId = Application.getAndroidId();
            if (androidId) parts.push(androidId);
        } else if (Platform.OS === 'ios') {
            // identifierForVendor changes on app reinstall but is stable otherwise
            const vendorId = await Application.getIosIdForVendorAsync();
            if (vendorId) parts.push(vendorId);
        }

        // Append hardware-level identifiers for extra entropy
        parts.push(Device.modelName ?? 'unknown_model');
        parts.push(Device.manufacturer ?? 'unknown_manufacturer');
        parts.push(Application.applicationId ?? 'unknown_bundle');

        const raw = parts.join('|');
        return CryptoService.sha256(raw);
    }

    /**
     * Creates a new device binding record for a user after successful enrollment.
     *
     * If a binding already exists for this (user, device) pair, the call is
     * idempotent — no error is thrown and the existing binding is returned.
     *
     * @param userId - The UUID of the user who was just enrolled.
     * @param tx - Optional transaction.
     * @returns The newly created or pre-existing DeviceBinding record.
     */
    async bindDevice(userId: string, tx?: Transaction): Promise<DeviceBinding> {
        const deviceId    = await this.getDeviceId();
        const { TimeService } = require('./TimeService');
        const now         = await TimeService.now();
        const bindingId   = CryptoService.uuid();

        // Check if a binding already exists (e.g., re-enrollment)
        const existing = await DeviceBindingRepository.findActive(userId, deviceId);
        if (existing) {
            await DeviceBindingRepository.updateLastVerified(existing.id, now, tx);
            return existing;
        }

        // Before binding a NEW user to this device, revoke any OLD users bound to it
        await DeviceBindingRepository.revokeAllForDevice(deviceId, 'device_reassigned', now, tx);

        // Generate ECDSA P-256 key pair for this device binding
        let publicKey: string | undefined;
        try {
            const keys = await CryptoService.generateECKeyPair();
            await CryptoService.saveDevicePrivateKey(keys.privateKeyPem);
            publicKey = keys.publicKeyPem;
        } catch (e) {
            console.error('[DeviceBindingService] Failed to generate ECDSA key pair:', e);
            // Non-fatal if fallback required, but ideally should succeed.
        }

        const binding: DeviceBinding = {
            id:                bindingId,
            user_id:           userId,
            device_id:         deviceId,
            device_model:      Device.modelName ?? undefined,
            os_version:        Device.osVersion ?? undefined,
            app_version:       Application.nativeApplicationVersion ?? undefined,
            public_key:        publicKey,
            attestation_token: undefined,
            attestation_valid: 0,
            bound_at:          now,
            last_verified_at:  now,
            is_active:         1,
        };

        await DeviceBindingRepository.insert(binding, tx);
        return binding;
    }

    /**
     * Verifies that the given userId is bound to the current device.
     *
     * Returns false if:
     *   - No active binding exists for (userId, deviceId)
     *   - The binding was revoked
     *
     * On success, updates last_verified_at as a proof-of-possession timestamp.
     *
     * @param userId - The user attempting to authenticate.
     * @returns true if the binding is valid.
     */
    async verifyBinding(userId: string): Promise<boolean> {
        const deviceId = await this.getDeviceId();
        const binding  = await DeviceBindingRepository.findActive(userId, deviceId);

        if (!binding) return false;

        const { TimeService } = require('./TimeService');
        await DeviceBindingRepository.updateLastVerified(binding.id, await TimeService.now());
        return true;
    }

    /**
     * Revokes all active bindings for a user on the current device.
     *
     * Called during user suspension or voluntary de-registration.
     *
     * @param userId - The user whose binding should be revoked.
     * @param reason - Human-readable reason stored in the revoke_reason column.
     */
    async revokeBinding(userId: string, reason: string): Promise<void> {
        const deviceId = await this.getDeviceId();
        const { TimeService } = require('./TimeService');
        await DeviceBindingRepository.revoke(userId, deviceId, reason, await TimeService.now());
    }

    /**
     * Looks up the user registered on the current device without a known userId.
     *
     * Used at app startup to restore auth state and during authentication to
     * quickly identify which user's templates to load.
     *
     * @returns The active DeviceBinding, or null if this device is unregistered.
     */
    async getBindingForCurrentDevice(): Promise<DeviceBinding | null> {
        const deviceId = await this.getDeviceId();
        return DeviceBindingRepository.findByDeviceId(deviceId);
    }
}

export const deviceBindingService = new DeviceBindingService();
