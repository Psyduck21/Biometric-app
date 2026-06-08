import { Face } from 'react-native-vision-camera-face-detector';
import {
    ChallengeType,
    LivenessChallenge,
    LivenessMetrics,
    LivenessResult,
} from '../../types/liveness';

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
 *   BLINK      - Eye open probability drops below 0.25 (eye closed) then rises above 0.65 (eye opened).
 *   HEAD_TURN  - Yaw exceeds ±15° in the instructed direction.
 *   SMILE      - Smile probability exceeds 0.65.
 *
 * The service issues challenges randomly to prevent pre-recording attacks.
 */

export function extractLivenessMetrics(face: Face, frameWidth: number, frameHeight: number): LivenessMetrics {
    'worklet';
    const leftEyeOpen = face.leftEyeOpenProbability ?? 1.0;
    const rightEyeOpen = face.rightEyeOpenProbability ?? 1.0;
    const eyeOpenProb = (leftEyeOpen + rightEyeOpen) / 2;

    const yaw = face.yawAngle;
    const pitch = face.pitchAngle;
    const roll = face.rollAngle;

    const smileRatio = face.smilingProbability ?? 0.0;

    const faceWidth = face.bounds.width;
    const faceHeight = face.bounds.height;
    const faceCentreX = face.bounds.x + faceWidth / 2;
    const faceCentreY = face.bounds.y + faceHeight / 2;
    
    const frameCentreX = frameWidth / 2;
    const frameCentreY = frameHeight / 2;
    const distFromCentre = Math.sqrt(
        Math.pow(faceCentreX - frameCentreX, 2) + Math.pow(faceCentreY - frameCentreY, 2)
    );
    const maxDist = Math.sqrt(Math.pow(frameWidth/2, 2) + Math.pow(frameHeight/2, 2));
    const positionScore = Math.max(0, 1 - (distFromCentre / maxDist));
    
    const idealArea = (frameWidth * frameHeight) * 0.15;
    const faceArea = faceWidth * faceHeight;
    const sizeScore = Math.max(0, 1 - Math.abs(faceArea - idealArea) / idealArea);
    
    const faceQuality = (positionScore * 0.4) + (sizeScore * 0.6);

    return { ear: eyeOpenProb, yaw, pitch, roll, smileRatio, faceQuality };
}

export class LivenessService {
    /**
     * Number of challenges a subject must complete to pass liveness.
     * Set to 2 so a single lucky blink cannot trivially unlock the system.
     */
    private readonly REQUIRED_CHALLENGES = 4;

    /**
     * Maximum time in milliseconds allowed to complete a single challenge.
     * After this window the challenge is marked FAILED.
     */
    private readonly CHALLENGE_TIMEOUT_MS = 10000;

    /**
     * Eye open probability threshold below which an eye is considered closed (blink detected).
     * Based on ML Kit's native probability scores.
     */
    private readonly EYE_CLOSED_THRESHOLD = 0.25;

    /**
     * Eye open probability threshold above which an eye is considered open again after a blink.
     * Using a small hysteresis gap to avoid false positives.
     */
    private readonly EYE_OPEN_THRESHOLD = 0.65;

    /**
     * Yaw threshold in degrees required to satisfy a HEAD_TURN challenge.
     * A 15° turn is clearly intentional and visible to the camera.
     * Test Case A10: yaw > 15° left then right.
     */
    private readonly YAW_TURN_THRESHOLD = 15;

    /**
     * Pitch threshold in degrees required to satisfy an UP/DOWN HEAD_TURN challenge.
     * Based on face orientation, pitch indicates looking up or down.
     */
    private readonly PITCH_TURN_THRESHOLD = 12;

    /**
     * Smile probability threshold.
     * Expressed as a probability (0.0 to 1.0) provided by ML Kit.
     */
    private readonly SMILE_PROBABILITY_THRESHOLD = 0.65;

    /** Tracks whether the eye was closed in the previous frame (for blink state machine) */
    private wasEyeClosed = false;

    /** Challenges issued and their outcomes in the current session */
    private challenges: LivenessChallenge[] = [];

    /** Index of the challenge currently awaiting completion */
    private activeChallengeIndex = 0;

    /** Whether a liveness session is currently in progress */
    private sessionActive = false;

    /** Timestamp until which the service pauses evaluation (e.g., between challenges) */
    private nextChallengeTime = 0;

    /** Rolling window for pitch/yaw to detect static photos (Passive Liveness) */
    private pitchHistory: number[] = [];
    private yawHistory: number[] = [];
    private readonly PASSIVE_HISTORY_SIZE = 15;

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
        this.nextChallengeTime = Date.now() + 1000; // 1 second grace period before first challenge
        this.challenges = this.generateChallengeSequence(this.REQUIRED_CHALLENGES);
        this.pitchHistory = [];
        this.yawHistory = [];

        // console.log(
        //     '[LivenessService] Session started. Challenges:',
        //     this.challenges.map(c => c.type).join(' → ')
        // );
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
     * Helper to get a user-friendly instruction string for a challenge.
     */
    getInstructionForChallenge(challenge: LivenessChallenge): string {
        switch (challenge.type) {
            case 'BLINK': return 'Please blink your eyes';
            case 'SMILE': return 'Please smile widely';
            case 'HEAD_LEFT': return 'Turn your head left';
            case 'HEAD_RIGHT': return 'Turn your head right';
            case 'HEAD_UP': return 'Look up slightly';
            case 'HEAD_DOWN': return 'Look down slightly';
            default: return 'Please look at the camera';
        }
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

        // 1. Passive Liveness Check (Anti-Spoof Heuristics)
        if (metrics.faceQuality < 0.6) {
             // Face is too small, too far, or poorly aligned. Return early without advancing.
             return this.buildResult();
        }

        this.pitchHistory.push(metrics.pitch);
        this.yawHistory.push(metrics.yaw);
        if (this.pitchHistory.length > this.PASSIVE_HISTORY_SIZE) {
            this.pitchHistory.shift();
            this.yawHistory.shift();
        }

        // Check for unnatural stillness (e.g. photo on a desk or static screen)
        if (this.pitchHistory.length === this.PASSIVE_HISTORY_SIZE) {
            const pitchVariance = this.calculateVariance(this.pitchHistory);
            const yawVariance = this.calculateVariance(this.yawHistory);
            
            // Humans naturally micro-jitter. Variance < 0.02 is impossibly still
            if (pitchVariance < 0.02 && yawVariance < 0.02) {
                console.warn(`[LivenessService] SPOOF DETECTED: Unnatural stillness (PitchVar: ${pitchVariance.toFixed(4)}, YawVar: ${yawVariance.toFixed(4)})`);
                this.sessionActive = false;
                const result = this.buildResult();
                result.failureReason = 'STATIC_SPOOF_DETECTED';
                return result;
            }
        }

        const activeChallenge = this.getActiveChallenge();
        if (!activeChallenge) {
            return this.buildResult();
        }

        // Delay evaluation to give user time to read the instruction
        if (Date.now() < this.nextChallengeTime) {
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
                passed = this.evaluateBlink(metrics.ear); // 'ear' in LivenessMetrics is repurposed for eye open probability average
                break;
            case 'SMILE':
                passed = this.evaluateSmile(metrics.smileRatio);
                break;
            case 'HEAD_LEFT':
                passed = this.evaluateHeadTurn(metrics.yaw, metrics.pitch, 'LEFT');
                break;
            case 'HEAD_RIGHT':
                passed = this.evaluateHeadTurn(metrics.yaw, metrics.pitch, 'RIGHT');
                break;
            case 'HEAD_UP':
                passed = this.evaluateHeadTurn(metrics.yaw, metrics.pitch, 'UP');
                break;
            case 'HEAD_DOWN':
                passed = this.evaluateHeadTurn(metrics.yaw, metrics.pitch, 'DOWN');
                break;
        }

        if (passed) {
            activeChallenge.outcome = 'PASSED';
            this.activeChallengeIndex += 1;
            console.log('[LivenessService] Challenge passed:', activeChallenge.type);

            this.nextChallengeTime = Date.now() + 1500;
            if (this.activeChallengeIndex < this.challenges.length) {
                this.challenges[this.activeChallengeIndex].issuedAt = this.nextChallengeTime;
            }

            // All challenges completed — session succeeded
            if (this.activeChallengeIndex >= this.challenges.length) {
                this.sessionActive = false;
            }
        }

        return this.buildResult();
    }

    /**
     * Terminate session manually.
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
    private evaluateBlink(eyeOpenProb: number): boolean {
        if (!this.wasEyeClosed && eyeOpenProb < this.EYE_CLOSED_THRESHOLD) {
            this.wasEyeClosed = true; // eye just closed
        } else if (this.wasEyeClosed && eyeOpenProb > this.EYE_OPEN_THRESHOLD) {
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
    private evaluateHeadTurn(yaw: number, pitch: number, direction?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN'): boolean {
        switch (direction) {
            case 'UP':
                // Positive pitch indicates looking up
                return pitch > this.PITCH_TURN_THRESHOLD;
            case 'DOWN':
                // Negative pitch indicates looking down
                return pitch < -this.PITCH_TURN_THRESHOLD;
            case 'LEFT':
                // Negative yaw typically indicates looking to the subject's left
                return yaw < -this.YAW_TURN_THRESHOLD;
            case 'RIGHT':
                // Positive yaw typically indicates looking to the subject's right
                return yaw > this.YAW_TURN_THRESHOLD;
            default:
                return false;
        }
    }

    /**
     * Evaluates the smile challenge.
     *
     * @param smileRatio - Current mouth width-to-height ratio
     * @returns True if the smile ratio exceeds the threshold
     */
    private evaluateSmile(smileProb: number): boolean {
        return smileProb > this.SMILE_PROBABILITY_THRESHOLD;
    }

    /**
     * Generates a randomised sequence of challenge types with no consecutive duplicates.
     *
     * @param count - Number of challenges to generate
     * @returns Array of LivenessChallenge objects, each in PENDING state
     */
    private generateChallengeSequence(count: number): LivenessChallenge[] {
        const allTypes: ChallengeType[] = ['BLINK', 'SMILE', 'HEAD_LEFT', 'HEAD_RIGHT', 'HEAD_UP', 'HEAD_DOWN'];
        const sequence: LivenessChallenge[] = [];
        let lastType: ChallengeType | null = null;

        for (let i = 0; i < count; i++) {
            // Exclude the last used type to prevent consecutive repeats
            const available = allTypes.filter(t => t !== lastType);
            const chosen = available[Math.floor(Math.random() * available.length)];
            lastType = chosen;

            sequence.push({
                type: chosen,
                issuedAt: Date.now(),
                outcome: 'PENDING',
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

    /**
     * Calculates the sample variance of an array of numbers.
     */
    private calculateVariance(values: number[]): number {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(v => Math.pow(v - mean, 2));
        return squareDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
    }
}

export const livenessService = new LivenessService();
