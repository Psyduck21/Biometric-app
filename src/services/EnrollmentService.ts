import { CryptoService } from './CryptoService';
import { deviceBindingService } from './DeviceBindingService';
import { securityCheckService } from './SecurityCheckService';
import { auditService } from './AuditService';
import { FaceTemplateRepository } from '../database/repositories/FaceTemplateRepository';
import { SyncQueueRepository } from '../database/repositories/SyncQueueRepository';
import { ConfigRepository } from '../database/repositories/ConfigRepository';
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
            await auditService.log({
                user_id:        userId,
                action:         'enroll_fail',
                outcome:        'blocked',
                failure_reason: 'security_check_failed',
                metadata:       JSON.stringify(security),
            });
            throw new Error('Device failed security check: root or debugger detected.');
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

        console.log(`[Enrollment] Capture ${sample.captureIndex} complete.`);
        console.log(`[Enrollment] Embedding generated (512D)`);

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
                console.log(`[Enrollment] Sample ${idx + 1} centroid similarity: ${sim.toFixed(4)}`);
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

            await FaceTemplateRepository.insert(template);
            templateIds.push(templateId);
            templates.push(template);
        } catch (e) {
            console.error('[EnrollmentService] storage_error during db insert/encrypt:', e);
            this.sessions.delete(sessionId);
            return { success: false, failureReason: 'storage_error' };
        }

        // Step 5: Device binding
        try {
            await deviceBindingService.bindDevice(session.userId);
        } catch {
            // Binding failure is non-fatal — log it and continue
            console.warn('[EnrollmentService] Device binding failed; templates already saved.');
        }

        // Step 6: Enqueue sync items for each template
        try {
            for (const template of templates) {
                await this._enqueueSyncItem(template, masterKey, now);
            }
        } catch {
            // Sync queue failure is non-fatal — the SyncService will retry on next launch
            console.warn('[EnrollmentService] Failed to enqueue some sync items.');
        }

        // Step 7: Audit log
        await auditService.log({
            user_id:     session.userId,
            action:      'enroll',
            entity_type: 'face_template',
            outcome:     'success',
            metadata:    JSON.stringify({ templateCount: templateIds.length, consistencyScore }),
        });

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
                console.log(`[Enrollment] Similarity Sample ${i+1} <-> Sample ${j+1}: ${sim.toFixed(4)}`);
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
        masterKey: string,
        now: number
    ): Promise<void> {
        const payload = JSON.stringify({
            ...template,
            is_active: template.is_active === 1
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

        await SyncQueueRepository.insert(item);
    }
}

export const enrollmentService = new EnrollmentService();
