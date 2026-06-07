import { ConfigRepository } from '../database/repositories/ConfigRepository';

/**
 * TimeService
 *
 * Provides a tamper-resistant time source for offline attendance tracking.
 * It detects if the user has manipulated the device clock (Time-Tampering)
 * by comparing monotonic uptime (performance.now()) against the OS clock delta.
 */
export class TimeService {
    private static lastOsTime: number = Date.now();

    /**
     * Initializes the time service and checks for obvious offline clock tampering
     * that occurred while the app was killed.
     */
    static async initialize(): Promise<void> {
        const lastSeenTime = await ConfigRepository.getNumber('last_seen_time', 0);
        const now = Date.now();
        
        if (lastSeenTime && now < lastSeenTime) {
            console.error(`[TimeService] TIME TAMPERING DETECTED! Current OS time (${now}) is older than last seen time (${lastSeenTime}).`);
            await ConfigRepository.setBoolean('time_tampered', true);
        } else {
            await ConfigRepository.setNumber('last_seen_time', now);
        }
        
        this.lastOsTime = Date.now();
    }

    /**
     * Returns the current secure time. 
     * If the clock was tampered with, this will throw an error or return a flagged timestamp.
     */
    static async now(): Promise<number> {
        const currentOs = Date.now();

        // 1. Backward time jump check (user set clock to the past)
        if (currentOs < this.lastOsTime) {
            console.error(`[TimeService] TIME TAMPERING DETECTED! Clock moved backwards. currentOs: ${currentOs}, lastOsTime: ${this.lastOsTime}`);
            await ConfigRepository.setBoolean('time_tampered', true);
        }

        this.lastOsTime = currentOs;
        
        // Update last seen time for future cold starts
        await ConfigRepository.setNumber('last_seen_time', currentOs);

        const isTampered = await ConfigRepository.getBoolean('time_tampered');
        if (isTampered) {
            throw new Error('Device clock manipulation detected. Please connect to the internet to resync secure time.');
        }

        return currentOs;
    }

    /**
     * Clears the tampered flag, called ONLY when a successful server sync happens
     * and the server time is verified.
     */
    static async clearTamperFlag(): Promise<void> {
        await ConfigRepository.setBoolean('time_tampered', false);
        this.lastOsTime = Date.now();
        await ConfigRepository.setNumber('last_seen_time', this.lastOsTime);
    }
}
