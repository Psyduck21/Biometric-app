/**
 * Liveness and Anti-Spoofing domain types.
 * These types govern the challenge-response system that proves a subject is a
 * live human being, not a photograph, video, or 3D mask.
 */

/**
 * The three challenge types the liveness system can issue.
 *
 * BLINK      - The subject must close and reopen their eyes.
 * HEAD_TURN  - The subject must turn their head left or right past a yaw threshold.
 * SMILE      - The subject must produce a visible smile past a lip-ratio threshold.
 */
export type ChallengeType = 'BLINK' | 'SMILE' | 'HEAD_LEFT' | 'HEAD_RIGHT' | 'HEAD_UP' | 'HEAD_DOWN';

/**
 * Possible outcomes of a single challenge attempt.
 *
 * PENDING    - Challenge has been issued but not yet completed or timed out.
 * PASSED     - The subject successfully completed the challenge.
 * FAILED     - The subject failed or the attempt timed out.
 */
export type ChallengeOutcome = 'PENDING' | 'PASSED' | 'FAILED';

/**
 * Represents a single issued liveness challenge and its result.
 *
 * @property type      - The challenge type that was issued.
 * @property issuedAt  - Unix timestamp (ms) when the challenge was issued.
 * @property outcome   - Current outcome of the challenge.
 * @property direction - Direction hint for HEAD_TURN challenges ('LEFT' or 'RIGHT').
 */
export interface LivenessChallenge {
    type: ChallengeType;
    issuedAt: number;
    outcome: ChallengeOutcome;
}

/**
 * Aggregate result of the complete liveness check session.
 * A session consists of one or more sequential challenges.
 *
 * @property passed          - True if all required challenges were completed.
 * @property completedCount  - Number of challenges successfully passed.
 * @property requiredCount   - Number of challenges required to pass.
 * @property challenges      - Full history of challenges issued in this session.
 * @property failureReason   - Human-readable reason for failure, if applicable.
 */
export interface LivenessResult {
    passed: boolean;
    completedCount: number;
    requiredCount: number;
    challenges: LivenessChallenge[];
    failureReason?: string;
}

/**
 * Per-frame biometric signal measurements extracted by the liveness pipeline.
 * Computed from facial landmarks on every processed frame.
 *
 * @property ear        - Eye Aspect Ratio (both eyes averaged). Blink threshold < 0.25.
 * @property yaw        - Estimated horizontal head rotation in degrees. Range: -90 to +90.
 * @property pitch      - Estimated vertical head rotation in degrees. Range: -90 to +90.
 * @property roll       - Estimated head tilt in degrees. Range: -45 to +45.
 * @property smileRatio - Lip width-to-height ratio. Smile threshold > 0.35.
 * @property faceQuality - Overall face quality score (0.0 to 1.0).
 */
export interface LivenessMetrics {
    ear: number;
    yaw: number;
    pitch: number;
    roll: number;
    smileRatio: number;
    faceQuality: number;
}

/**
 * Result of a single anti-spoofing inference pass on a face crop.
 *
 * @property isRealFace  - True if the model classifies the input as a live face.
 * @property confidence  - Confidence of the 'real face' prediction (0.0 to 1.0).
 * @property attackType  - Detected spoof type if classified as fake.
 */
export interface AntiSpoofingResult {
    isRealFace: boolean;
    confidence: number;
    attackType?: 'PRINT' | 'REPLAY' | 'MASK' | 'UNKNOWN';
}
