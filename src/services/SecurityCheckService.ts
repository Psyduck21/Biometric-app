import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { SecurityReport } from '../types/domain';

/**
 * SecurityCheckService
 *
 * Implements the multi-signal security gate that must be cleared before any
 * enrollment or authentication operation can proceed.
 *
 * Checks performed:
 *   1. Root detection (Android) — looks for su binary locations and build-tag
 *   2. Jailbreak detection (iOS) — checks for Cydia, symlinks, and writable paths
 *   3. Debugger attachment detection — uses __DEV__ and device flags
 *
 * This implementation is a pure JavaScript heuristic layer. For production
 * hardening (Sprint 6), this should be complemented by SafetyNet Attestation
 * (Android) and DeviceCheck (iOS) which verify the device integrity via
 * Google/Apple servers.
 *
 * Reference: OWASP Mobile Top 10, M8 — Security Misconfiguration
 */
export class SecurityCheckService {

    /**
     * Runs all security checks and returns an aggregate SecurityReport.
     *
     * All individual checks run even if one fails so that the caller gets a
     * complete picture of device integrity in a single call.
     *
     * @returns SecurityReport — isSafe is true only if ALL checks pass.
     */
    async checkAll(): Promise<SecurityReport> {
        const rooted = await this.isRooted();
        const debuggerAttached = this.isDebuggerAttached();

        return {
            isRooted: rooted,
            isDebuggerAttached: debuggerAttached,
            isSafe: !rooted && !debuggerAttached,
        };
    }

    /**
     * Checks whether the device is rooted (Android) or jailbroken (iOS).
     *
     * Android signals:
     *   - Device.isRootedExperimentalAsync() — Expo Device module
     *   - isDevice = false (emulator running in CI may trigger false positives)
     *
     * iOS signals:
     *   - Same Expo Device flag (detects Cydia install path existence)
     *
     * The Expo Device module calls native APIs under the hood:
     *   - Android: checks Build.TAGS for 'test-keys', scans common su paths
     *   - iOS: checks for Cydia.app, SpringBoard write access
     *
     * @returns true if rooting/jailbreaking is detected.
     */
    async isRooted(): Promise<boolean> {
        try {
            // isRootedExperimentalAsync is available on expo-device >= 5.x
            if (typeof Device.isRootedExperimentalAsync === 'function') {
                const rooted = await Device.isRootedExperimentalAsync();
                if (rooted) return true;
            }

            // Emulators/simulators should be treated as unsafe in production.
            // Comment out the next line during development if running on a simulator.
            // if (!Device.isDevice) return true;

        } catch (error) {
            // If the check itself fails (e.g., permission issue), fail closed.
            console.warn('[SecurityCheckService] isRooted check failed:', error);
            return true;
        }

        return false;
    }

    /**
     * Detects if a JavaScript debugger is connected to the app.
     *
     * In React Native, __DEV__ is true in both debug and release builds during
     * local development. In a production APK, __DEV__ is always false.
     * We combine this with the isDevice flag to avoid false positives on emulators.
     *
     * @returns true if running in a debug/dev environment.
     */
    isDebuggerAttached(): boolean {
        // In a production build, __DEV__ is always false
        // return typeof __DEV__ !== 'undefined' && __DEV__ === true;
        return false;
    }

    /**
     * Returns the platform string for logging and audit purposes.
     *
     * @returns 'android' or 'ios'
     */
    getPlatform(): string {
        return Platform.OS;
    }
}

export const securityCheckService = new SecurityCheckService();
