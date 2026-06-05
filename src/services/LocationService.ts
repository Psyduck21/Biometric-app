import * as Location from 'expo-location';
import { ConfigRepository } from '../database/repositories/ConfigRepository';
import { GPSCoordinates } from '../types/domain';

export class LocationService {

    /**
     * Requests foreground location permissions from the user.
     * @returns True if granted, false otherwise.
     */
    async requestPermissions(): Promise<boolean> {
        const { status } = await Location.requestForegroundPermissionsAsync();
        return status === 'granted';
    }

    /**
     * Checks if location services are enabled on the device.
     */
    async isGPSEnabled(): Promise<boolean> {
        return await Location.hasServicesEnabledAsync();
    }

    /**
     * Retrieves the current GPS coordinates.
     * Will attempt to get a fresh location, but falls back to last known if it fails or times out.
     */
    async getCurrentPosition(): Promise<GPSCoordinates | null> {
        try {
            const hasPermission = await this.requestPermissions();
            if (!hasPermission) return null;

            const enabled = await this.isGPSEnabled();
            if (!enabled) return null;

            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });

            return {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                altitude: location.coords.altitude ?? undefined,
                accuracy: location.coords.accuracy ?? 0,
                timestamp: location.timestamp,
            };
        } catch (error) {
            console.warn('[LocationService] Failed to get current position, trying last known.', error);
            return this.getLastKnownPosition();
        }
    }

    /**
     * Gets the last known position from the OS cache (faster but potentially stale).
     */
    async getLastKnownPosition(): Promise<GPSCoordinates | null> {
        try {
            const location = await Location.getLastKnownPositionAsync();
            if (location) {
                return {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    altitude: location.coords.altitude ?? undefined,
                    accuracy: location.coords.accuracy ?? 0,
                    timestamp: location.timestamp,
                };
            }
        } catch (error) {
            console.warn('[LocationService] Failed to get last known position.', error);
        }
        return null;
    }

    /**
     * Calculates the Haversine distance in meters between two coordinates.
     */
    haversineDistance(a: GPSCoordinates, b: { latitude: number; longitude: number }): number {
        const R = 6371e3; // Earth radius in meters
        const phi1 = (a.latitude * Math.PI) / 180;
        const phi2 = (b.latitude * Math.PI) / 180;
        const deltaPhi = ((b.latitude - a.latitude) * Math.PI) / 180;
        const deltaLambda = ((b.longitude - a.longitude) * Math.PI) / 180;

        const aVal =
            Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));

        return R * c;
    }

    /**
     * Validates if the given location is within the configured geofence.
     * Default radius is 100 meters, reading from ConfigRepository.
     * If center coordinates aren't configured, we assume geofence is universally valid for now.
     */
    async validateGeofence(location: GPSCoordinates): Promise<{ valid: boolean; geofenceId?: string }> {
        const radius = await ConfigRepository.getNumber('geofence_radius_meters', 100);
        const centerLatStr = await ConfigRepository.getString('geofence_center_lat', '');
        const centerLonStr = await ConfigRepository.getString('geofence_center_lon', '');
        const geofenceId = await ConfigRepository.getString('geofence_id', '');

        const finalGeofenceId = geofenceId ? geofenceId : undefined;

        if (!centerLatStr || !centerLonStr) {
            // No geofence configured, allow punch everywhere (or fail depending on strictness)
            // Let's assume valid if no geofence is set up.
            return { valid: true, geofenceId: finalGeofenceId };
        }

        const centerLat = parseFloat(centerLatStr);
        const centerLon = parseFloat(centerLonStr);
        
        if (isNaN(centerLat) || isNaN(centerLon)) {
             return { valid: true, geofenceId: finalGeofenceId };
        }

        const distance = this.haversineDistance(location, { latitude: centerLat, longitude: centerLon });
        
        return {
            valid: distance <= radius,
            geofenceId: finalGeofenceId,
        };
    }
}

export const locationService = new LocationService();
