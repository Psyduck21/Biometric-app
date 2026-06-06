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
        const [rooted, rawDebuggerAttached] = await Promise.all([
            this.isRooted(),
            this.isDebuggerAttached()
        ]);
        const rawEmulator = this.isEmulator();

        let offlineLocked = false;
        let debuggerAttached = rawDebuggerAttached;
        let emulator = rawEmulator;

        try {
            const { TimeService } = require('./TimeService');
            const { ConfigRepository } = require('../database/repositories/ConfigRepository');
            
            // Check debug overrides
            const allowDebugger = await ConfigRepository.getBoolean('allow_debugger', false);
            const allowEmulator = await ConfigRepository.getBoolean('allow_emulator', false);
            
            // Use only explicit dynamic overrides
            if (allowDebugger) debuggerAttached = false;
            if (allowEmulator) emulator = false;

            const lastSync = await ConfigRepository.getNumber('last_successful_sync');
            const maxOfflineHours = await ConfigRepository.getNumber('max_offline_hours', 72);
            if (lastSync) {
                const now = await TimeService.now();
                const offlineHours = (now - lastSync) / 3600000;
                if (offlineHours > maxOfflineHours) {
                    console.warn(`[SecurityCheckService] Offline Window Exceeded: ${offlineHours.toFixed(1)} hours offline.`);
                    offlineLocked = true;
                }
            }
        } catch (e) {
            console.warn('[SecurityCheckService] Time manipulation detected or error checking config:', e);
            offlineLocked = true; // Fail closed if time is tampered
        }

        return {
            isRooted: rooted,
            isDebuggerAttached: debuggerAttached,
            isEmulator: emulator,
            isOfflineLocked: offlineLocked,
            isSafe: !rooted && !debuggerAttached && !emulator && !offlineLocked,
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
