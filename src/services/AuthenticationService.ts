import { CryptoService } from './CryptoService';
import { deviceBindingService } from './DeviceBindingService';
import { sessionService } from './SessionService';
import { auditService } from './AuditService';
import { FaceTemplateRepository } from '../database/repositories/FaceTemplateRepository';
import { ConfigRepository } from '../database/repositories/ConfigRepository';
import { syncService } from './network/SyncService';

export interface AuthResult {
    success: boolean;
    userId?: string;
    sessionId?: string;
    similarityScore?: number;
    livenessScore?: number;
    failureReason?: 'no_match' | 'device_mismatch' | 'locked' | 'storage_error';
    attemptsRemaining?: number;
}

export class AuthenticationService {

    /**
     * Authenticates a user by matching their live embedding against stored encrypted templates.
     * 
     * @param queryEmbedding - The live 512-dim embedding from the scanner.
     * @param livenessScore - The anti-spoofing confidence score.
     * @returns AuthResult detailing the outcome of the authentication attempt.
     */
    async authenticate(queryEmbedding: Float32Array, livenessScore: number): Promise<AuthResult> {
        const deviceId = await deviceBindingService.getDeviceId();
        
        // 1. Check Lockout
        const lockoutStatus = await sessionService.checkLockout(deviceId);
        if (lockoutStatus.isLocked) {
            return {
                success: false,
                failureReason: 'locked',
                attemptsRemaining: 0,
            };
        }

        // 2. Identify User on Device
        const binding = await deviceBindingService.getBindingForCurrentDevice();
        if (!binding) {
            await this.handleFailure(deviceId, 'device_mismatch');
            return { success: false, failureReason: 'device_mismatch' };
        }
        
        const userId = binding.user_id;

        // 3. Retrieve and Decrypt Templates
        let masterKey: string;
        try {
            masterKey = (await CryptoService.getMasterKey()) ?? '';
            if (!masterKey) throw new Error('Empty master key');
        } catch {
            return { success: false, failureReason: 'storage_error' };
        }

        const encryptedTemplates = await FaceTemplateRepository.getActive(userId);
        console.log(`[AuthenticationService] Loaded ${encryptedTemplates.length} encrypted templates from local SQLite for user ${userId}`);
        
        if (encryptedTemplates.length === 0) {
            console.warn('[AuthenticationService] No templates found locally. Returning no_match.');
            await this.handleFailure(deviceId, 'no_match');
            return { success: false, failureReason: 'no_match' };
        }

        const matchThreshold = await ConfigRepository.getNumber('similarity_threshold', 0.65);
        let bestScore = 0;

        try {
            for (const template of encryptedTemplates) {
                const plaintext = await CryptoService.decrypt(
                    template.embedding_cipher,
                    masterKey,
                    template.embedding_iv,
                    template.embedding_tag
                );
                const storedEmbeddingArray = JSON.parse(plaintext) as number[];
                const storedEmbedding = new Float32Array(storedEmbeddingArray);
                
                const score = this.cosineSimilarity(queryEmbedding, storedEmbedding);
                if (score > bestScore) {
                    bestScore = score;
                }
            }
            console.log(`[AuthenticationService] Decrypted embeddings and calculated best similarity score: ${bestScore}`);
        } catch (error) {
            console.error('[AuthenticationService] Failed to decrypt templates:', error);
            return { success: false, failureReason: 'storage_error' };
        }

        // 4. Validate Match
        if (bestScore < matchThreshold) {
            const result = await this.handleFailure(deviceId, 'no_match');
            await auditService.log({
                user_id: userId,
                action: 'auth_fail',
                outcome: 'failure',
                failure_reason: 'no_match',
                metadata: JSON.stringify({ bestScore, threshold: matchThreshold }),
            });
            return {
                success: false,
                failureReason: 'no_match',
                attemptsRemaining: result.attemptsRemaining,
            };
        }

        // 5. Success Flow
        sessionService.clearFailures(deviceId);
        const session = await sessionService.createSession(userId, 'BLINK', bestScore, livenessScore);
        
        await auditService.log({
            user_id: userId,
            action: 'auth',
            outcome: 'success',
            metadata: JSON.stringify({ bestScore, livenessScore }),
        });

        // Trigger background sync and check for template updates (Online Flow)
        syncService.syncBatch().catch(e => console.error(e));
        syncService.checkTemplateUpdates(userId).catch(e => console.error(e));

        return {
            success: true,
            userId,
            sessionId: session.id,
            similarityScore: bestScore,
            livenessScore,
        };
    }

    private async handleFailure(deviceId: string, reason: string) {
        return sessionService.recordFailure(deviceId);
    }

    /**
     * Computes the cosine similarity between two Float32 vectors.
     */
    private cosineSimilarity(a: Float32Array, b: Float32Array): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot   += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }
}

export const authenticationService = new AuthenticationService();
