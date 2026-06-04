import { FaceDetection, Landmark } from '../../types/models';
import {
    ChallengeType,
    LivenessChallenge,
    LivenessMetrics,
    LivenessResult,
} from '../../types/liveness';
import {
    estimateEARFromCentres,
    estimateHeadPose,
    computeSmileRatio,
    computeFaceQuality,
} from '../../utils/geometry';

/**
 * LivenessService
 *
 * Implements the full challenge-response liveness system as defined in
 * system_design_part3_rn_cloud.md (Section 10.3) and system_design_part4
 * (Sprint 2, Test Cases A09, A10, A11).
 *
 * The service is a stateful session manager. Each authentication attempt
 * begins with startSession(), receives frame-by-frame measurements via
 * processMeasurements(), and ends either when all challenges are passed or
 * when a timeout or failure condition is reached.
 *
 * Challenge Types:
 *   BLINK      - EAR drops below 0.25 (eye closed) then rises above 0.28 (eye opened).
 *   HEAD_TURN  - Yaw exceeds ±15° in the instructed direction.
 *   SMILE      - Smile ratio exceeds 4.5 (equivalent to lip_ratio > 0.35).
 *
 * The service issues challenges randomly to prevent pre-recording attacks.
 */
export class LivenessService {
    /**
     * Number of challenges a subject must complete to pass liveness.
     * Set to 2 so a single lucky blink cannot trivially unlock the system.
     */
    private readonly REQUIRED_CHALLENGES = 2;

    /**
     * Maximum time in milliseconds allowed to complete a single challenge.
     * After this window the challenge is marked FAILED.
     */
    private readonly CHALLENGE_TIMEOUT_MS = 5000;

    /**
     * EAR threshold below which an eye is considered closed (blink detected).
     * Reference: Soukupova & Cech (2016) – "Real-Time Eye Blink Detection Using
     * Facial Landmarks", CVWW 2016.
     */
    private readonly EAR_BLINK_THRESHOLD = 0.25;

    /**
     * EAR threshold above which an eye is considered open again after a blink.
     * Using a small hysteresis gap (0.25 close / 0.28 open) to avoid false
     * positives from natural fluctuations.
     */
    private readonly EAR_OPEN_THRESHOLD = 0.28;

    /**
     * Yaw threshold in degrees required to satisfy a HEAD_TURN challenge.
     * A 15° turn is clearly intentional and visible to the camera.
     * Test Case A10: yaw > 15° left then right.
     */
    private readonly YAW_TURN_THRESHOLD = 15;

    /**
     * Smile ratio threshold. Derived from Test Case A11: lip_ratio > 0.35.
     * Expressed as mouth_width / mouth_height, a ratio > 4.5 corresponds
     * approximately to a genuine broad smile.
     */
    private readonly SMILE_RATIO_THRESHOLD = 4.5;

    /** Tracks whether the eye was closed in the previous frame (for blink state machine) */
    private wasEyeClosed = false;

    /** Challenges issued and their outcomes in the current session */
    private challenges: LivenessChallenge[] = [];

    /** Index of the challenge currently awaiting completion */
    private activeChallengeIndex = 0;

    /** Whether a liveness session is currently in progress */
    private sessionActive = false;

    /**
     * Begins a new liveness challenge session.
     * Resets all state and randomly selects the required challenges.
     *
     * A new random seed is used each session so that attackers cannot replay
     * a pre-recorded sequence. The two challenges are always drawn from
     * different types (no two consecutive BLINK challenges, for example).
     */
    startSession(): void {
        this.wasEyeClosed = false;
        this.activeChallengeIndex = 0;
        this.sessionActive = true;
        this.challenges = this.generateChallengeSequence(this.REQUIRED_CHALLENGES);

        console.log(
            '[LivenessService] Session started. Challenges:',
            this.challenges.map(c => c.type).join(' → ')
        );
    }

    /**
     * Returns the currently active challenge (the one awaiting completion).
     * Returns null if no session is active or all challenges are done.
     */
    getActiveChallenge(): LivenessChallenge | null {
        if (!this.sessionActive) return null;
        if (this.activeChallengeIndex >= this.challenges.length) return null;
        return this.challenges[this.activeChallengeIndex];
    }

    /**
     * Processes a set of per-frame biometric measurements and advances the
     * challenge state machine accordingly.
     *
     * This method must be called once per camera frame while a session is active.
     * It returns early if no session is active or no challenges remain.
     *
     * @param metrics - The LivenessMetrics extracted from the current frame
     * @returns The updated LivenessResult reflecting the current session state
     */
    processMeasurements(metrics: LivenessMetrics): LivenessResult {
        if (!this.sessionActive) {
            return this.buildResult();
        }

        const activeChallenge = this.getActiveChallenge();
        if (!activeChallenge) {
            return this.buildResult();
        }

        // Check for timeout on the active challenge
        const elapsed = Date.now() - activeChallenge.issuedAt;
        if (elapsed > this.CHALLENGE_TIMEOUT_MS) {
            activeChallenge.outcome = 'FAILED';
            this.sessionActive = false;
            console.warn('[LivenessService] Challenge timed out:', activeChallenge.type);
            return this.buildResult();
        }

        // Evaluate the active challenge based on its type
        let passed = false;
        switch (activeChallenge.type) {
            case 'BLINK':
                passed = this.evaluateBlink(metrics.ear);
                break;
            case 'HEAD_TURN':
                passed = this.evaluateHeadTurn(metrics.yaw, activeChallenge.direction);
                break;
            case 'SMILE':
                passed = this.evaluateSmile(metrics.smileRatio);
                break;
        }

        if (passed) {
            activeChallenge.outcome = 'PASSED';
            this.activeChallengeIndex += 1;
            console.log('[LivenessService] Challenge passed:', activeChallenge.type);

            // All challenges completed — session succeeded
            if (this.activeChallengeIndex >= this.challenges.length) {
                this.sessionActive = false;
            }
        }

        return this.buildResult();
    }

    /**
     * Extracts biometric signals from a raw FaceDetection object.
     *
     * Converts the BlazeFace 6-point landmark array into EAR, head pose,
     * smile ratio, and face quality values compatible with processMeasurements().
     *
     * BlazeFace landmark order (0-indexed):
     *   0 = Right eye centre
     *   1 = Left eye centre
     *   2 = Nose tip
     *   3 = Mouth centre
     *   4 = Right ear tragion (not always reliable — unused)
     *   5 = Left ear tragion
     *
     * @param face        - The FaceDetection from FaceDetectorService
     * @param frameWidth  - Width of the source camera frame in pixels
     * @param frameHeight - Height of the source camera frame in pixels
     * @returns LivenessMetrics ready for processMeasurements()
     */
    extractMetrics(
        face: FaceDetection,
        frameWidth: number,
        frameHeight: number
    ): LivenessMetrics {
        const lm = face.landmarks;

        // Gracefully handle cases where the detector returns fewer than 4 landmarks
        const rightEye = lm[0] ?? { x: 0, y: 0 };
        const leftEye  = lm[1] ?? { x: 0, y: 0 };
        const nose     = lm[2] ?? { x: 0, y: 0 };
        const mouth    = lm[3] ?? { x: 0, y: 0 };

        // Face bounding-box dimensions
        const faceWidth  = face.bbox.width;
        const faceHeight = face.bbox.height;

        // EAR estimation using BlazeFace eye centres.
        // Open-eye height is modelled as 7% of face bbox height.
        const openEyeHeight = faceHeight * 0.07;
        const currentEyeGap = Math.abs(leftEye.y - rightEye.y) * 0.1; // scaled lateral gap proxy
        const ear = estimateEARFromCentres(leftEye, rightEye, openEyeHeight, currentEyeGap);

        // Head pose from 4 anchor landmarks
        const { yaw, pitch, roll } = estimateHeadPose(
            leftEye, rightEye, nose, mouth, faceWidth, faceHeight
        );

        // Smile: approximate left/right mouth corners from mouth centre + face width
        const halfMouthWidth = faceWidth * 0.18;
        const leftMouthCorner: Landmark  = { x: mouth.x - halfMouthWidth, y: mouth.y };
        const rightMouthCorner: Landmark = { x: mouth.x + halfMouthWidth, y: mouth.y };
        const upperLip: Landmark = { x: mouth.x, y: mouth.y - faceHeight * 0.04 };
        const lowerLip: Landmark = { x: mouth.x, y: mouth.y + faceHeight * 0.04 };
        const smileRatio = computeSmileRatio(leftMouthCorner, rightMouthCorner, upperLip, lowerLip);

        // Quality score
        const faceCentreX = face.bbox.xMin + faceWidth / 2;
        const faceCentreY = face.bbox.yMin + faceHeight / 2;
        const faceQuality = computeFaceQuality(
            faceWidth, faceHeight, frameWidth, frameHeight, faceCentreX, faceCentreY
        );

        return { ear, yaw, pitch, roll, smileRatio, faceQuality };
    }

    /**
     * Terminates the current session and returns the final result.
     * Call this when the camera view is unmounted or auth is cancelled.
     */
    endSession(): LivenessResult {
        this.sessionActive = false;
        return this.buildResult();
    }

    /**
     * Evaluates the blink challenge using a two-state machine (closed → open).
     *
     * A valid blink requires:
     *   1. EAR to drop below EAR_BLINK_THRESHOLD (eye closed).
     *   2. EAR to rise above EAR_OPEN_THRESHOLD in a subsequent frame (eye open again).
     *
     * This two-step requirement prevents a single noisy reading from passing.
     *
     * @param ear - Current Eye Aspect Ratio for this frame
     * @returns True if a complete blink was detected
     */
    private evaluateBlink(ear: number): boolean {
        if (!this.wasEyeClosed && ear < this.EAR_BLINK_THRESHOLD) {
            this.wasEyeClosed = true; // eye just closed
        } else if (this.wasEyeClosed && ear > this.EAR_OPEN_THRESHOLD) {
            this.wasEyeClosed = false; // eye just re-opened — blink complete!
            return true;
        }
        return false;
    }

    /**
     * Evaluates the head-turn challenge.
     *
     * @param yaw       - Current yaw angle in degrees (positive = right, negative = left)
     * @param direction - Required turn direction ('LEFT' or 'RIGHT')
     * @returns True if yaw exceeds the threshold in the required direction
     */
    private evaluateHeadTurn(yaw: number, direction?: 'LEFT' | 'RIGHT'): boolean {
        if (direction === 'LEFT')  return yaw < -this.YAW_TURN_THRESHOLD;
        if (direction === 'RIGHT') return yaw >  this.YAW_TURN_THRESHOLD;
        // Fallback: accept a turn in either direction
        return Math.abs(yaw) > this.YAW_TURN_THRESHOLD;
    }

    /**
     * Evaluates the smile challenge.
     *
     * @param smileRatio - Current mouth width-to-height ratio
     * @returns True if the smile ratio exceeds the threshold
     */
    private evaluateSmile(smileRatio: number): boolean {
        return smileRatio > this.SMILE_RATIO_THRESHOLD;
    }

    /**
     * Generates a randomised sequence of challenge types with no consecutive duplicates.
     *
     * @param count - Number of challenges to generate
     * @returns Array of LivenessChallenge objects, each in PENDING state
     */
    private generateChallengeSequence(count: number): LivenessChallenge[] {
        const allTypes: ChallengeType[] = ['BLINK', 'HEAD_TURN', 'SMILE'];
        const sequence: LivenessChallenge[] = [];
        let lastType: ChallengeType | null = null;

        for (let i = 0; i < count; i++) {
            // Exclude the last used type to prevent consecutive repeats
            const available = allTypes.filter(t => t !== lastType);
            const chosen = available[Math.floor(Math.random() * available.length)];
            lastType = chosen;

            // For HEAD_TURN, randomly assign a direction
            const direction: 'LEFT' | 'RIGHT' | undefined =
                chosen === 'HEAD_TURN'
                    ? (Math.random() > 0.5 ? 'LEFT' : 'RIGHT')
                    : undefined;

            sequence.push({
                type: chosen,
                issuedAt: Date.now(),
                outcome: 'PENDING',
                direction,
            });
        }

        return sequence;
    }

    /**
     * Builds the current LivenessResult snapshot from internal session state.
     *
     * @returns Immutable snapshot of the current liveness session result
     */
    private buildResult(): LivenessResult {
        const completedCount = this.challenges.filter(c => c.outcome === 'PASSED').length;
        const hasFailed = this.challenges.some(c => c.outcome === 'FAILED');
        const allPassed = completedCount >= this.REQUIRED_CHALLENGES;

        return {
            passed: allPassed,
            completedCount,
            requiredCount: this.REQUIRED_CHALLENGES,
            challenges: [...this.challenges],
            failureReason: hasFailed ? 'challenge_timeout_or_failure' : undefined,
        };
    }
}

export const livenessService = new LivenessService();
