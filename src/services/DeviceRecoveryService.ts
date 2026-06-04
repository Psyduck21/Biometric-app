import { apiService } from './network/ApiService';
import { deviceBindingService } from './DeviceBindingService';
import { FaceTemplateRepository } from '../database/repositories/FaceTemplateRepository';
import { UserRepository } from '../database/repositories/UserRepository';
import { CryptoService } from './CryptoService';
import { FaceTemplate } from '../types/domain';

export class DeviceRecoveryService {
    
    /**
     * Request an OTP to begin the device recovery flow.
     * @param employeeId - The Employee ID to recover.
     */
    async requestOTP(employeeId: string): Promise<boolean> {
        try {
            console.log(`[DeviceRecoveryService] Requesting OTP for ${employeeId}...`);
            const response = await apiService.post('/rpc/request_recovery_otp', { employee_id: employeeId });
            return response.success;
        } catch (error) {
            console.error('[DeviceRecoveryService] Failed to request OTP:', error);
            return false;
        }
    }

    /**
     * Verify the OTP entered by the user.
     * @param employeeId - The Employee ID to recover.
     * @param otpCode - The 6-digit OTP code.
     * @returns A temporary recovery token.
     */
    async verifyOTP(employeeId: string, otpCode: string): Promise<string | null> {
        try {
            console.log(`[DeviceRecoveryService] Verifying OTP for ${employeeId}...`);
            const response = await apiService.post<{ recovery_token: string }>('/rpc/verify_recovery_otp', { 
                employee_id: employeeId,
                otp_code: otpCode
            });
            return response.success && response.data ? response.data.recovery_token : null;
        } catch (error) {
            console.error('[DeviceRecoveryService] Failed to verify OTP:', error);
            return null;
        }
    }

    /**
     * Completes device recovery by matching live embedding in the cloud, downloading templates, and creating a new binding.
     * @param recoveryToken - The token received from verifyOTP.
     * @param liveEmbedding - A newly captured live 512D face embedding array.
     */
    async recoverDevice(recoveryToken: string, liveEmbedding: Float32Array): Promise<boolean> {
        try {
            console.log(`[DeviceRecoveryService] Matching live embedding in the cloud to authorize recovery...`);
            const response = await apiService.post<{ 
                user_id: string; 
                employee_id: string;
                templates: any[] 
            }>('/rpc/authorize_recovery', {
                recovery_token: recoveryToken,
                embedding: Array.from(liveEmbedding)
            });

            if (!response.success || !response.data) {
                console.error('[DeviceRecoveryService] Cloud authorization failed.');
                return false;
            }

            const { user_id, employee_id, templates } = response.data;
            console.log(`[DeviceRecoveryService] Authorization successful for user ${user_id}. Downloading templates...`);

            // 1. Create local user if they don't exist
            let localUser = await UserRepository.getUserById(user_id);
            if (!localUser) {
                await UserRepository.createUser({
                    id: user_id,
                    employee_id: employee_id,
                    full_name: 'Recovered User', // Ideally fetched from cloud
                    role: 'employee',
                    status: 'active',
                    enrolled_at: Date.now(),
                    updated_at: Date.now(),
                    sync_status: 'synced'
                });
            }

            // 2. Fetch or create Master Key
            let masterKey = await CryptoService.getMasterKey();
            if (!masterKey) {
                 masterKey = await CryptoService.generateNonce();
                 await CryptoService.createMasterKey(masterKey);
            }

            // 3. Encrypt & Store downloaded templates
            for (const t of templates) {
                 const { cipher, iv } = await CryptoService.encrypt(JSON.stringify(t.embedding), masterKey);
                 const templateId = CryptoService.uuid();
                 const newTemplate: FaceTemplate = {
                     id: templateId,
                     user_id: user_id,
                     embedding_cipher: cipher,
                     embedding_iv: iv,
                     embedding_tag: '',
                     quality_score: 0.99,
                     capture_index: 1,
                     model_version: 'mobilefacenet-v2-tfjs',
                     template_type: 'master',
                     created_at: Date.now(),
                     is_active: 1,
                     sync_status: 'synced' // came from cloud
                 };
                 await FaceTemplateRepository.insert(newTemplate);
            }

            // 4. Register new Device Binding (which creates new ECDSA P-256 key pairs)
            await deviceBindingService.bindDevice(user_id);
            console.log(`[DeviceRecoveryService] Device recovered and bound successfully.`);
            
            return true;
        } catch (error) {
            console.error('[DeviceRecoveryService] Failed to recover device:', error);
            return false;
        }
    }
}

export const deviceRecoveryService = new DeviceRecoveryService();
