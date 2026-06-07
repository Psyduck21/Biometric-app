import { apiService } from './network/ApiService';
import { deviceBindingService } from './DeviceBindingService';
import { FaceTemplateRepository } from '../database/repositories/FaceTemplateRepository';
import { UserRepository } from '../database/repositories/UserRepository';
import { CryptoService } from './CryptoService';
import { FaceTemplate } from '../types/domain';
import { TimeService } from './TimeService';
import { dbClient } from '../database/DatabaseClient';

export class DeviceRecoveryService {
    
    /**
     * Request an OTP to begin the device recovery flow.
     * @param employeeId - The Employee ID to recover.
     */
    async requestOTP(employeeId: string): Promise<string | null> {
        try {
            console.log(`[DeviceRecoveryService] Requesting OTP for ${employeeId}...`);
            const response = await apiService.post<any>('/functions/v1/send-recovery-otp', { employee_id: employeeId });
            
            if (response.success && response.data?.otp) {
                return response.data.otp;
            }
            return null;
        } catch (error) {
            console.error('[DeviceRecoveryService] Failed to request OTP:', error);
            return null;
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
            const response = await apiService.post<any>('/rpc/verify_recovery_otp', { 
                p_employee_id: employeeId,
                p_otp_code: otpCode
            });
            
            if (response.success && response.data && response.data.success) {
                return response.data.data.recovery_token;
            }
            return null;
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
            const response = await apiService.post<any>('/rpc/authorize_recovery', {
                p_recovery_token: recoveryToken,
                p_embedding: '[' + Array.from(liveEmbedding).join(',') + ']'
            });

            if (!response.success || !response.data || !response.data.success) {
                console.error('[DeviceRecoveryService] Cloud authorization failed. Error:', response.error || response.data?.error);
                console.error('[DeviceRecoveryService] Full response:', JSON.stringify(response, null, 2));
                return false;
            }

            const { user_id, employee_id, templates } = response.data.data;
            console.log(`[DeviceRecoveryService] Authorization successful for user ${user_id}. Downloading templates...`);

            // Wrap local modifications in a single atomic transaction
            await dbClient.getDb().transaction(async (tx) => {
                const now = await TimeService.now();
                
                // 1. Create local user if they don't exist
                let localUser = await UserRepository.getUserById(user_id, tx);
                if (!localUser) {
                    await UserRepository.createUser({
                        id: user_id,
                        employee_id: employee_id,
                        full_name: 'Recovered User', // Ideally fetched from cloud
                        role: 'employee',
                        status: 'active',
                        enrolled_at: now,
                        updated_at: now,
                        sync_status: 'synced'
                    }, tx);
                }

                // 2. Fetch or create Master Key
                let masterKey = await CryptoService.getMasterKey();
                if (!masterKey) {
                     masterKey = await CryptoService.generateNonce();
                     await CryptoService.createMasterKey(masterKey);
                }

                // 3. Encrypt & Store downloaded templates
                for (const t of templates) {
                     const { cipher, iv, tag } = await CryptoService.encrypt(JSON.stringify(t.embedding), masterKey);
                     const templateId = CryptoService.uuid();
                     const newTemplate: FaceTemplate = {
                         id: templateId,
                         user_id: user_id,
                         embedding_cipher: cipher,
                         embedding_iv: iv,
                         embedding_tag: tag,
                         quality_score: 0.99,
                         capture_index: 1,
                         model_version: 'mobilefacenet-v2-tfjs',
                         template_type: 'master',
                         created_at: now,
                         is_active: 1,
                         sync_status: 'synced' // came from cloud
                     };
                     await FaceTemplateRepository.insert(newTemplate, tx);
                }

                // 4. Register new Device Binding (which creates new ECDSA P-256 key pairs)
                // Note: deviceBindingService.bindDevice isn't currently taking tx, so it might need an update
                // But for now, we leave it as is if it's external, or we'd ideally pass tx.
            });
            
            // Call bindDevice outside transaction since it interacts with cloud APIs as well.
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
