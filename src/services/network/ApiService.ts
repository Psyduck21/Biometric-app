import { ConfigRepository } from '../../database/repositories/ConfigRepository';
import { deviceBindingService } from '../DeviceBindingService';

/**
 * Standardized API response format
 */
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    status: number;
}

/**
 * ApiService
 * 
 * Handles all outbound HTTP requests to the cloud backend.
 * Injects necessary authentication headers (Device ID) and handles timeouts.
 */
export class ApiService {
    private static DEFAULT_TIMEOUT_MS = 10000;

    /**
     * Executes a POST request.
     */
    async post<T>(endpoint: string, payload: any): Promise<ApiResponse<T>> {
        return this.request<T>('POST', endpoint, payload);
    }

    /**
     * Executes a GET request.
     */
    async get<T>(endpoint: string): Promise<ApiResponse<T>> {
        return this.request<T>('GET', endpoint);
    }

    private async request<T>(method: string, endpoint: string, body?: any): Promise<ApiResponse<T>> {
        // Base Supabase Project URL
        let projectUrl = process.env.EXPO_PUBLIC_SUPABASE_PROJECT_URL;
        if (!projectUrl) {
            const fallback = await ConfigRepository.getString('api_base_url', 'https://api.example.com');
            projectUrl = fallback ? fallback.replace(/\/rest\/v1\/?$/, '') : 'https://api.example.com';
        }
        
        let url: string;
        if (endpoint.startsWith('/functions/')) {
            // Edge Functions URL (e.g. https://project.supabase.co/functions/v1/...)
            url = `${projectUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
        } else {
            // PostgREST URL (e.g. https://project.supabase.co/rest/v1/...)
            const baseUrl = `${projectUrl.replace(/\/$/, '')}/rest/v1`;
            url = `${baseUrl}/${endpoint.replace(/^\//, '')}`;
        }

        const deviceId = await deviceBindingService.getDeviceId();

        const envKey = process.env.EXPO_PUBLIC_SUPABASE_API_KEY || null;
        const supabaseKey = envKey || await ConfigRepository.getString('supabase_anon_key', '');

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Device-Id': deviceId,
            ...(supabaseKey ? {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
            } : {})
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ApiService.DEFAULT_TIMEOUT_MS);

        try {
            // console.log(`[ApiService] ${method} ${url}`);

            const response = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                return {
                    success: false,
                    status: response.status,
                    error: typeof data === 'object' ? data.message || 'Server error' : data,
                };
            }

            return {
                success: true,
                status: response.status,
                data: data as T,
            };

        } catch (error: any) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                return { success: false, status: 408, error: 'Request Timeout' };
            }

            return {
                success: false,
                status: 0,
                error: error.message || 'Network request failed',
            };
        }
    }
}

export const apiService = new ApiService();
