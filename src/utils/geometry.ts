/**
 * Pure-TypeScript geometry utilities for the liveness pipeline.
 *
 * All computations are performed on the JS thread with no native dependencies.
 * Functions operate on landmark arrays as defined by the MediaPipe Face Mesh
 * 468-point schema. For BlazeFace (6-point) input, only the 6 available points
 * are used with reduced precision.
 */

import { Landmark } from '../types/models';

/**
 * Computes the Euclidean distance between two 2D landmark points.
 *
 * @param a - First landmark point {x, y}
 * @param b - Second landmark point {x, y}
 * @returns The straight-line distance in pixels
 */
export function euclideanDistance(a: Landmark, b: Landmark): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes the Eye Aspect Ratio (EAR) for a single eye.
 *
 * EAR is defined by Soukupova & Cech (2016) as:
 *   EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 *
 * A value near 0.3 corresponds to an open eye.
 * A value below 0.25 indicates a blink (eye closed).
 *
 * The six landmark indices follow the dlib/MediaPipe ordering:
 *   p1 (left corner), p2 (upper-left), p3 (upper-right),
 *   p4 (right corner), p5 (lower-right), p6 (lower-left)
 *
 * @param eyeLandmarks - Array of exactly 6 Landmark points for one eye
 * @returns EAR value (typically 0.0 to 0.5)
 */
export function computeEAR(eyeLandmarks: Landmark[]): number {
    if (eyeLandmarks.length < 6) return 0.3; // return neutral if insufficient landmarks

    const [p1, p2, p3, p4, p5, p6] = eyeLandmarks;

    const vertical1 = euclideanDistance(p2, p6);
    const vertical2 = euclideanDistance(p3, p5);
    const horizontal = euclideanDistance(p1, p4);

    if (horizontal === 0) return 0.3;

    return (vertical1 + vertical2) / (2.0 * horizontal);
}

/**
 * Approximates the bilateral EAR from the 6 BlazeFace landmarks.
 *
 * BlazeFace provides only 1 landmark per eye (the eye centre), not 6 per eye.
 * This function uses the available eye centres alongside the bounding box
 * to build a coarse EAR approximation. Precision is reduced but sufficient
 * for robust blink detection.
 *
 * The approximation models each eye as an ellipse whose semi-axes are
 * derived from the inter-ocular distance (IOD). When the eye closes, the
 * vertical axis collapses, producing a low EAR.
 *
 * @param leftEye  - Centre landmark of the left eye
 * @param rightEye - Centre landmark of the right eye
 * @param openEyeHeight - Estimated open-eye height in pixels (from face bbox height * 0.07)
 * @param currentEyeGap - Current measured inter-eye vertical gap in pixels
 * @returns Estimated EAR (0.0 to 0.5)
 */
export function estimateEARFromCentres(
    leftEye: Landmark,
    rightEye: Landmark,
    openEyeHeight: number,
    currentEyeGap: number
): number {
    // Approximate each eye width as 1/3 of inter-ocular distance
    const iod = euclideanDistance(leftEye, rightEye);
    const eyeWidth = iod / 3.0;
    if (eyeWidth === 0) return 0.3;

    // EAR ~ height / width. Normalise against the expected open-eye height.
    const estimatedHeight = Math.min(currentEyeGap, openEyeHeight);
    return estimatedHeight / eyeWidth;
}

/**
 * Estimates head pose Euler angles (yaw, pitch, roll) from 4 facial landmarks
 * using a simplified direct linear transform.
 *
 * This is a lightweight approximation of OpenCV's solvePnP, designed to run
 * entirely on the JS thread without any native bindings. Accuracy is sufficient
 * for challenge thresholds of ±15° yaw and ±20° pitch.
 *
 * The method:
 *   1. Normalises landmark coordinates to [-1, 1] relative to the face bbox.
 *   2. Uses the horizontal nose-to-eye deviation as a proxy for yaw.
 *   3. Uses the vertical nose-to-midpoint deviation as a proxy for pitch.
 *   4. Uses the inter-eye slope as roll.
 *
 * @param leftEye  - Left eye centre landmark
 * @param rightEye - Right eye centre landmark
 * @param nose     - Nose tip landmark
 * @param mouth    - Mouth centre landmark
 * @param faceWidth  - Width of the face bounding box in pixels
 * @param faceHeight - Height of the face bounding box in pixels
 * @returns Object containing yaw, pitch, roll in degrees
 */
export function estimateHeadPose(
    leftEye: Landmark,
    rightEye: Landmark,
    nose: Landmark,
    mouth: Landmark,
    faceWidth: number,
    faceHeight: number
): { yaw: number; pitch: number; roll: number } {
    if (faceWidth === 0 || faceHeight === 0) {
        return { yaw: 0, pitch: 0, roll: 0 };
    }

    // Midpoint between eyes
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;

    // Yaw: horizontal offset of nose tip from the inter-eye midpoint,
    // normalised by face width and converted to degrees using a 60° FOV model.
    const noseHorizontalOffset = (nose.x - eyeMidX) / faceWidth;
    const yaw = noseHorizontalOffset * 90; // scale to ±90°

    // Pitch: vertical compression ratio.
    // In a frontal face, eye-to-nose / eye-to-mouth should be ~0.5.
    // As the head tilts up/down this ratio changes.
    const eyeToNoseY = nose.y - eyeMidY;
    const eyeToMouthY = mouth.y - eyeMidY;
    const pitchRatio = eyeToMouthY > 0 ? eyeToNoseY / eyeToMouthY : 0.5;
    const pitch = (pitchRatio - 0.5) * 60; // scale to ±30°

    // Roll: angle of the inter-eye line relative to horizontal.
    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const roll = Math.atan2(dy, dx) * (180 / Math.PI);

    return { yaw, pitch, roll };
}

/**
 * Computes the smile ratio from mouth landmarks.
 *
 * Smile ratio is defined as:
 *   smileRatio = mouth_width / mouth_height
 *
 * A resting face has a lower ratio (~2.0 to 3.0).
 * A smiling face stretches the mouth horizontally, increasing the ratio
 * above the threshold of ~4.5 (equivalent to lip_ratio > 0.35 in normalised space).
 *
 * @param leftMouthCorner  - Left corner of the mouth
 * @param rightMouthCorner - Right corner of the mouth
 * @param upperLip         - Philtrum / upper lip centre point
 * @param lowerLip         - Chin-side / lower lip centre point
 * @returns Smile ratio (higher = more smile)
 */
export function computeSmileRatio(
    leftMouthCorner: Landmark,
    rightMouthCorner: Landmark,
    upperLip: Landmark,
    lowerLip: Landmark
): number {
    const mouthWidth = euclideanDistance(leftMouthCorner, rightMouthCorner);
    const mouthHeight = euclideanDistance(upperLip, lowerLip);

    if (mouthHeight < 1) return mouthWidth > 0 ? 5.0 : 0; // fully closed vs fully open

    return mouthWidth / mouthHeight;
}

/**
 * Computes a simple face quality score (0.0 to 1.0) based on the face bbox.
 *
 * Quality penalises:
 *   - Small faces (bbox too small relative to frame)
 *   - Off-centre faces (too far from centre of the frame)
 *
 * @param bboxWidth    - Width of the detected face bounding box in pixels
 * @param bboxHeight   - Height of the detected face bounding box in pixels
 * @param frameWidth   - Full width of the camera frame in pixels
 * @param frameHeight  - Full height of the camera frame in pixels
 * @param faceCentreX  - X coordinate of the face centre in pixels
 * @param faceCentreY  - Y coordinate of the face centre in pixels
 * @returns Quality score from 0.0 (bad) to 1.0 (perfect)
 */
export function computeFaceQuality(
    bboxWidth: number,
    bboxHeight: number,
    frameWidth: number,
    frameHeight: number,
    faceCentreX: number,
    faceCentreY: number
): number {
    // Size score: face should occupy at least 20% of the frame width
    const sizeFraction = bboxWidth / frameWidth;
    const sizeScore = Math.min(sizeFraction / 0.3, 1.0); // normalise against 30% ideal

    // Centre score: penalise if face centre is far from frame centre
    const frameCentreX = frameWidth / 2;
    const frameCentreY = frameHeight / 2;
    const maxOffset = Math.sqrt(frameCentreX ** 2 + frameCentreY ** 2);
    const offset = euclideanDistance(
        { x: faceCentreX, y: faceCentreY },
        { x: frameCentreX, y: frameCentreY }
    );
    const centreScore = Math.max(0, 1 - offset / maxOffset);

    return (sizeScore * 0.6 + centreScore * 0.4);
}
