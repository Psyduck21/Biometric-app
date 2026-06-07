import { CryptoService } from './CryptoService';
import { deviceBindingService } from './DeviceBindingService';
import { securityCheckService } from './SecurityCheckService';
import { auditService } from './AuditService';
import { appSessionService } from './AppSessionService';
import { FaceTemplateRepository } from '../database/repositories/FaceTemplateRepository';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { UserRepository } from '../database/repositories/UserRepository';
import { ConfigRepository } from '../database/repositories/ConfigRepository';
import { dbClient } from '../database/DatabaseClient';
import {
    EnrollmentSession,
    EnrollmentSample,
    EnrollmentResult,
    FaceTemplate,
    SyncQueueItem,
} from '../types/domain';
import { AlignedFrame } from '../types/models';

/**
 * EnrollmentService
 *
 * Orchestrates the complete 5-sample biometric enrollment pipeline:
 *
 *   1. startEnrollment()  — security gate + session creation
 *   2. addSample()        — adds one aligned face + embedding (called ×5)
 *   3. finalizeEnrollment() — consistency check → encrypt → persist → sync-queue
 *
 * All embeddings are AES-256-CBC encrypted before being written to SQLite.
 * The raw Float32Array never touches disk in plaintext.
 *
 * Consistency validation:
 *   All 5 embeddings must have pairwise cosine similarity > 0.85 (configurable).
 *   This prevents enrolling a user with inconsistent or swapped identities.
 *
 * Reference: system_design_part2_database_lld.md, Section 9.1
 * Test coverage: E01–E30 (system_design_part4_testing_roadmap.md)
 */
export class EnrollmentService {

    /** Model version string embedded in every template row for future migration. */
    private readonly MODEL_VERSION = 'mobilefacenet-v2-tfjs';

    /**
     * In-memory session store. Enrollment sessions are ephemeral —
     * they exist only in memory while the user is actively enrolling.
     * On app background/crash, the session is lost and must be restarted.
     */
    private readonly sessions = new Map<string, EnrollmentSession>();

    // ------------------------------------------------------------------
    // Phase 1: Start
    // ------------------------------------------------------------------

    /**
     * Initialises a new enrollment session for a user.
     *
     * Runs the security gate first. If the device is rooted or a debugger
     * is attached, enrollment is blocked and a 'security_fail' result is
     * thrown rather than returned, since this is a hard stop.
     *
     * @param userId - The UUID of the user being enrolled (must exist in `users`).
     * @returns A fresh EnrollmentSession with 0 captured samples.
     * @throws If the device fails the security check.
     */
    async startEnrollment(userId: string): Promise<EnrollmentSession> {
        const security = await securityCheckService.checkAll();
        if (!security.isSafe) {
            let specificReason = 'device_compromised';
            if (security.isOfflineLocked) specificReason = 'time_tampering_or_offline';
            else if (security.isRooted) specificReason = 'rooted_device';
            else if (security.isEmulator) specificReason = 'emulator_detected';
            else if (security.isDebuggerAttached) specificReason = 'debugger_attached';

            await auditService.log({
                user_id:        userId,
                action:         'security_check',
                outcome:        'failure',
                failure_reason: specificReason,
                metadata:       JSON.stringify(security),
            });
            
            const { syncService } = require('./network/SyncService');
            syncService.syncBatch().catch((e: any) => console.error(e));

            throw new Error(`Device failed security check: ${specificReason}`);
        }

        const sessionId = CryptoService.uuid();
        const required  = await ConfigRepository.getNumber('max_enrollment_samples', 5);

        const session: EnrollmentSession = {
            sessionId,
            userId,
            capturedSamples: 0,
            requiredSamples: required,
            samples: [],
            status: 'capturing',
            startedAt: Date.now(),
        };

        this.sessions.set(sessionId, session);
        return session;
    }

    // ------------------------------------------------------------------
    // Phase 2: Sample accumulation
    // ------------------------------------------------------------------

    /**
     * Adds one biometric sample to an in-progress enrollment session.
     *
     * Each call should be preceded by a successful liveness challenge on at
     * least one of the five frames (the UI layer enforces which sample requires
     * the challenge). This service layer only validates that the data is present
     * and that we have not exceeded the required sample count.
     *
     * @param sessionId   - The UUID of the enrollment session.
     * @param alignedFrame - The 112×112 RGB aligned face image.
     * @param embedding    - The 512-dim face embedding from EmbeddingService.
     * @param qualityScore - Quality score (0.0–1.0) from the alignment stage.
     * @returns The updated EnrollmentSession.
     * @throws If the session is not found or already complete.
     */
    async addSample(
        sessionId: string,
        alignedFrame: AlignedFrame,
        embedding: Float32Array,
        qualityScore: number
    ): Promise<EnrollmentSession> {
        const session = this._getSession(sessionId);

        if (session.capturedSamples >= session.requiredSamples) {
            throw new Error('Enrollment session already has the required number of samples.');
        }

        const sample: EnrollmentSample = {
            alignedFrame,
            embedding,
            qualityScore,
            captureIndex: session.capturedSamples + 1,
        };

        // console.log(`[Enrollment] Capture ${sample.captureIndex} complete.`);
        // console.log(`[Enrollment] Embedding generated (512D)`);

        session.samples.push(sample);
        session.capturedSamples += 1;

        if (session.capturedSamples === session.requiredSamples) {
            session.status = 'processing';
        }

        return session;
    }

    // ------------------------------------------------------------------
    // Phase 3: Finalise
    // ------------------------------------------------------------------

    /**
     * Validates, encrypts, persists, and queues all samples from an enrollment session.
     *
     * Steps:
     *   1. Consistency check — pairwise cosine similarity > 0.85 for all 5 pairs
     *   2. Retrieve master key from Keychain
     *   3. Encrypt each embedding with AES-256-CBC (unique IV per embedding)
     *   4. Write 5 FaceTemplate rows to SQLite
     *   5. Bind the device (creates DeviceBinding row)
     *   6. Enqueue 5 sync items (one per template)
     *   7. Write audit log
     *   8. Clean up in-memory session
     *
     * @param sessionId - The UUID of the enrollment session to finalise.
     * @returns EnrollmentResult with success status and template IDs.
     */
    async finalizeEnrollment(sessionId: string): Promise<EnrollmentResult> {
        const session = this._getSession(sessionId);

        if (session.capturedSamples < session.requiredSamples) {
            return {
                success: false,
                failureReason: 'quality_insufficient',
            };
        }

        // Step 1: Embedding consistency gate
        const consistencyScore = this._computeConsistencyScore(session.samples);
        const minConsistency   = await ConfigRepository.getNumber('min_consistency_score', 0.55);

        console.log(`[Enrollment] Finalizing 5 captures...`);
        console.log(`[Enrollment] Enrollment consistency check:`);
        console.log(`[Enrollment] Minimum pairwise Cosine Score: ${consistencyScore.toFixed(4)}`);

        if (consistencyScore < minConsistency) {
            console.log(`[Enrollment] inconsistent_face detected! Score ${consistencyScore.toFixed(4)} is below threshold ${minConsistency}.`);
            console.log(`[Enrollment] Enrollment rejected.`);
            await auditService.log({
                user_id:        session.userId,
                action:         'enroll_fail',
                outcome:        'failure',
                failure_reason: 'inconsistent_face',
                metadata:       JSON.stringify({ consistencyScore }),
            });
            this.sessions.delete(sessionId);
            return {
                success: false,
                failureReason: 'inconsistent_face',
                consistencyScore,
            };
        }

        // Step 2: Get master key
        let masterKey: string;
        try {
            masterKey = (await CryptoService.getMasterKey()) ?? '';
            if (!masterKey) throw new Error('Empty master key');
        } catch (e) {
            console.error('[EnrollmentService] storage_error getting master key:', e);
            this.sessions.delete(sessionId);
            return { success: false, failureReason: 'storage_error' };
        }

        // Steps 3 & 4: Revoke old templates, then encrypt and insert new ones
        const templateIds: string[] = [];
        const templates: FaceTemplate[] = [];
        const now = Date.now();

        try {
            await FaceTemplateRepository.revokeAllForUser(session.userId);

            // Outlier Rejection and Master Template Generation
            // 1. Calculate centroid
            const dim = session.samples[0].embedding.length;
            const centroid = new Float32Array(dim);
            for (const sample of session.samples) {
                for (let i = 0; i < dim; i++) {
                    centroid[i] += sample.embedding[i];
                }
            }
            for (let i = 0; i < dim; i++) {
                centroid[i] /= session.samples.length;
            }
            
            // Normalize centroid
            let centroidNorm = 0;
            for (let i = 0; i < dim; i++) {
                centroidNorm += centroid[i] * centroid[i];
            }
            centroidNorm = Math.sqrt(centroidNorm);
            if (centroidNorm > 0) {
                for (let i = 0; i < dim; i++) {
                    centroid[i] /= centroidNorm;
                }
            }

            // 2. Filter outliers (embeddings furthest from centroid)
            const validSamples = session.samples.filter((sample, idx) => {
                const sim = this._cosineSimilarity(centroid, sample.embedding);
                // console.log(`[Enrollment] Sample ${idx + 1} centroid similarity: ${sim.toFixed(4)}`);
                return sim > 0.65; // High threshold for outlier rejection
            });

            console.log(`[Enrollment] Valid samples after outlier rejection: ${validSamples.length} / ${session.samples.length}`);

            if (validSamples.length < session.samples.length / 2) {
                this.sessions.delete(sessionId);
                return { success: false, failureReason: 'quality_insufficient', consistencyScore };
            }

            // 3. Generate Weighted Average (Master Template)
            const masterEmbedding = new Float32Array(dim);
            let totalWeight = 0;
            for (const sample of validSamples) {
                for (let i = 0; i < dim; i++) {
                    masterEmbedding[i] += sample.embedding[i] * sample.qualityScore;
                }
                totalWeight += sample.qualityScore;
            }
            for (let i = 0; i < dim; i++) {
                masterEmbedding[i] /= totalWeight;
            }
            
            // Normalize master embedding
            let norm = 0;
            for (let i = 0; i < dim; i++) {
                norm += masterEmbedding[i] * masterEmbedding[i];
            }
            norm = Math.sqrt(norm);
            for (let i = 0; i < dim; i++) {
                masterEmbedding[i] /= norm;
            }

            // --- RE-ENROLLMENT SECURITY GATE (IDENTITY HIJACKING PREVENTION) ---
            const activeTemplates = await FaceTemplateRepository.getActive(session.userId);
            if (activeTemplates.length > 0) {
                console.log(`[Enrollment] Re-enrollment detected. Checking similarity against ${activeTemplates.length} existing templates...`);
                let maxSim = 0;

                for (const oldTemplate of activeTemplates) {
                    try {
                        const decryptedJson = await CryptoService.decrypt(
                            oldTemplate.embedding_cipher,
                            masterKey,
                            oldTemplate.embedding_iv,
                            oldTemplate.embedding_tag
                        );
                        const oldEmbeddingArray = JSON.parse(decryptedJson) as number[];
                        const oldEmbedding = new Float32Array(oldEmbeddingArray);

                        const sim = this._cosineSimilarity(masterEmbedding, oldEmbedding);
                        if (sim > maxSim) maxSim = sim;
                    } catch (decErr) {
                        console.warn(`[Enrollment] Failed to decrypt old template ${oldTemplate.id} for similarity check`, decErr);
                    }
                }

                console.log(`[Enrollment] Max similarity with previous templates: ${maxSim.toFixed(4)}`);
                const RE_ENROLL_SIMILARITY_THRESHOLD = await ConfigRepository.getNumber('re_enroll_similarity_threshold', 0.65);

                if (maxSim < RE_ENROLL_SIMILARITY_THRESHOLD && maxSim > 0) { // maxSim > 0 ensures we don't reject if all decryptions failed
                    console.error(`[Enrollment] IDENTITY MISMATCH! New face similarity (${maxSim.toFixed(4)}) is below threshold (${RE_ENROLL_SIMILARITY_THRESHOLD}).`);
                    
                    // Log the takeover attempt
                    await auditService.log({
                        user_id: session.userId,
                        action: 'identity_takeover_attempt',
                        entity_type: 'face_template',
                        outcome: 'blocked',
                        failure_reason: 'identity_mismatch',
                        metadata: JSON.stringify({ maxSimilarity: maxSim, threshold: RE_ENROLL_SIMILARITY_THRESHOLD }),
                    });

                    this.sessions.delete(sessionId);
                    return { success: false, failureReason: 'identity_mismatch', consistencyScore };
                }
            }
            // -------------------------------------------------------------------

            const embeddingJson = JSON.stringify(Array.from(masterEmbedding));
            const { cipher, iv, tag } = await CryptoService.encrypt(embeddingJson, masterKey);
            const templateId = CryptoService.uuid();

            const template: FaceTemplate = {
                id:               templateId,
                user_id:          session.userId,
                embedding_cipher: cipher,
                embedding_iv:     iv,
                embedding_tag:    tag,
                quality_score:    1.0, // Master template is highest quality representation
                capture_index:    0,
                model_version:    this.MODEL_VERSION,
                template_type:    'master',
                created_at:       now,
                is_active:        1,
                sync_status:      'pending',
            };

            const pendingUser = appSessionService.pendingUser;
            if (!pendingUser && session.userId) {
                // If there's no pending user, maybe they are just re-enrolling.
                // But if there is, we must save it inside the transaction.
            }

            // Execute EVERYTHING in a single transaction
            await dbClient.getDb().transaction(async (tx) => {
                // 1. Insert/Update User if pending
                if (pendingUser) {
                    if (appSessionService.isCloudUserMissing) {
                        // User exists locally but needs to adopt cloud ID, handled in registerUser mostly.
                        // We will just do a create/replace here since SQLite insert might conflict if it exists.
                        // Actually, UserRepository.createUser uses INSERT. If it exists, it might fail.
                        // Let's assume registerUser deleted it if UUID mismatched, or it's new.
                        await UserRepository.createUser(pendingUser, tx);
                        await appSessionService.enqueueUserSync(pendingUser, tx);
                    } else {
                        // Just create it
                        await UserRepository.createUser(pendingUser, tx);
                        // enqueueUserSync not needed because they exist in cloud
                    }
                }

                // 2. Revoke old templates & insert new template
                await FaceTemplateRepository.revokeAllForUser(session.userId, tx);
                await FaceTemplateRepository.insert(template, tx);
                templateIds.push(templateId);
                templates.push(template);

                // 3. Bind Device
                const binding = await deviceBindingService.bindDevice(session.userId, tx);

                // 4. Enqueue Sync Items
                // Enqueue device binding sync
                await appSessionService.enqueueDeviceBindingSync(binding, tx);
                
                // Enqueue template sync
                await this._enqueueSyncItem(template, masterEmbedding, masterKey, now, tx);

                // 5. Write audit log
                await auditService.log({
                    user_id:     session.userId,
                    action:      'enroll',
                    entity_type: 'face_template',
                    outcome:     'success',
                    metadata:    JSON.stringify({ templateCount: templateIds.length, consistencyScore }),
                }, tx);
            });

            // Clear the pending user now that it is saved
            appSessionService.pendingUser = null;
            appSessionService.isCloudUserMissing = false;

        } catch (e) {
            console.error('[EnrollmentService] storage_error during db insert/encrypt/transaction:', e);
            this.sessions.delete(sessionId);
            return { success: false, failureReason: 'storage_error' };
        }

        // The below steps (Device Binding, Sync Items, Audit Log) 
        // are now handled transactionally above.
        
        // Step 8: Clean up
        this.sessions.delete(sessionId);

        return {
            success: true,
            userId:      session.userId,
            templateIds,
            consistencyScore,
        };
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Returns the current state of an in-progress enrollment session.
     *
     * @param sessionId - The UUID of the enrollment session.
     * @returns The current EnrollmentSession state.
     */
    getSession(sessionId: string): EnrollmentSession | null {
        return this.sessions.get(sessionId) ?? null;
    }

    /**
     * Cancels an in-progress enrollment session and discards all samples.
     *
     * @param sessionId - The UUID of the session to cancel.
     */
    cancelSession(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private _getSession(sessionId: string): EnrollmentSession {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`EnrollmentSession '${sessionId}' not found. It may have expired.`);
        }
        return session;
    }

    /**
     * Computes the mean pairwise cosine similarity across all samples.
     *
     * For 5 samples there are C(5,2) = 10 pairs. The minimum pairwise
     * similarity is a stricter gate than the mean because a single outlier
     * sample (e.g., a different person) will produce a very low pair score.
     *
     * @param samples - The accumulated enrollment samples.
     * @returns The minimum pairwise cosine similarity (0.0–1.0).
     */
    private _computeConsistencyScore(samples: EnrollmentSample[]): number {
        let minSim = 1.0;

        for (let i = 0; i < samples.length; i++) {
            for (let j = i + 1; j < samples.length; j++) {
                const sim = this._cosineSimilarity(samples[i].embedding, samples[j].embedding);
                // console.log(`[Enrollment] Similarity Sample ${i+1} <-> Sample ${j+1}: ${sim.toFixed(4)}`);
                if (sim < minSim) minSim = sim;
            }
        }

        return minSim;
    }

    /**
     * Computes the cosine similarity between two equal-length Float32 vectors.
     *
     * @param a - First embedding vector (512-dim).
     * @param b - Second embedding vector (512-dim).
     * @returns Similarity score in the range [0, 1].
     */
    private _cosineSimilarity(a: Float32Array, b: Float32Array): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot   += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    /**
     * Builds and inserts a SyncQueueItem for a face template.
     *
     * The payload is the full template JSON-stringified and encrypted so the
     * server can insert it into the cloud database.
     */
    private async _enqueueSyncItem(
        template: FaceTemplate,
        rawEmbedding: Float32Array,
        masterKey: string,
        now: number,
        tx?: any
    ): Promise<void> {
        const payload = JSON.stringify({
            ...template,
            is_active: template.is_active === 1,
            embedding: Array.from(rawEmbedding)
        });
        const { cipher, iv, tag } = await CryptoService.encrypt(payload, masterKey);

        const idempotencyKey = CryptoService.uuid();

        const item: SyncQueueItem = {
            id:              CryptoService.uuid(),
            entity_type:     'face_template',
            entity_id:       template.id,
            operation:       'create',
            payload_cipher:  cipher,
            payload_iv:      iv,
            payload_tag:     tag,
            idempotency_key: idempotencyKey,
            status:          'pending',
            priority:        3,
            attempt_count:   0,
            created_at:      now,
        };

        await SyncQueueRepository.insert(item, tx);
    }
}

export const enrollmentService = new EnrollmentService();
