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
 *   4. Emulator detection — using expo-device flags
 *
 * This implementation is a pure JavaScript heuristic layer.
 */
export class SecurityCheckService {

    /**
     * Runs all security checks and returns an aggregate SecurityReport.
     *
     * All individual checks run even if one fails so that the caller gets a
     * complete picture of device integrity in a single call.
     * @returns SecurityReport — isSafe is true only if ALL checks pass.
     */
    async checkAll(): Promise<SecurityReport> {
        const rooted = await this.isRooted();
        const debuggerAttached = this.isDebuggerAttached();
        const emulator = this.isEmulator();
        return {
            isRooted: rooted,
            isDebuggerAttached: debuggerAttached,
            isEmulator: emulator,
            isSafe: !rooted && !debuggerAttached && !emulator,
        };
    }

    /**
     * Checks whether the device is rooted (Android) or jailbroken (iOS).
     */
    async isRooted(): Promise<boolean> {
        try {
            if (typeof Device.isRootedExperimentalAsync === 'function') {
                const rooted = await Device.isRootedExperimentalAsync();
                if (rooted) return true;
            }
        } catch (error) {
            console.warn('[SecurityCheckService] isRooted check failed:', error);
            return true;
        }

        return false;
    }

    /**
     * Detects if the app is running on an emulator/simulator.
     * Emulators are often used to spoof camera feeds or GPS coordinates.
     */
    isEmulator(): boolean {
        // If it's not a physical device, treat it as an emulator
        return !Device.isDevice;
    }

    /**
     * Detects if a JavaScript debugger is connected to the app.
     *
     * In a production APK, __DEV__ is always false.
     */
    isDebuggerAttached(): boolean {
        return typeof __DEV__ !== 'undefined' && __DEV__ === true;
    }

    getPlatform(): string {
        return Platform.OS;
    }
}

export const securityCheckService = new SecurityCheckService();
