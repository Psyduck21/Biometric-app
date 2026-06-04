/**
 * Shared domain types for the Biometric Authentication System
 */

/**
 * Represents a bounding box in an image
 */
export interface BoundingBox {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    width: number;
    height: number;
}

/**
 * Represents a 2D landmark point on a face (e.g., eye corner, nose tip)
 */
export interface Landmark {
    x: number;
    y: number;
}

/**
 * Represents a detected face in a camera frame
 */
export interface FaceDetection {
    /** Bounding box of the face */
    bbox: BoundingBox;
    /** Confidence score from the detector (0.0 to 1.0) */
    confidence: number;
    /** Key facial landmarks (usually 6 for BlazeFace: eyes, ears, nose, mouth) */
    landmarks: Landmark[];
}

/**
 * Result of running a face detection pass on a single frame
 */
export interface DetectionResult {
    /** Array of faces detected in the frame */
    faces: FaceDetection[];
    /** Original width of the frame processed */
    frameWidth: number;
    /** Original height of the frame processed */
    frameHeight: number;
    /** Time taken to process the frame in milliseconds */
    processingTimeMs: number;
}

/**
 * Represents a 112x112 RGB cropped and aligned face image ready for embedding
 */
export interface AlignedFrame {
    /** Raw RGB pixel data (112 * 112 * 3 bytes) */
    pixels: Uint8Array;
    /** Original bounding box of the face in the source frame */
    originalBbox: BoundingBox;
    /** Quality score of the alignment process */
    alignmentScore: number;
}

/**
 * Represents the 3D rotation of a head (used in Liveness)
 */
export interface EulerAngles {
    /** Nodding up and down (±20°) */
    pitch: number;
    /** Turning left and right (±30°) */
    yaw: number;
    /** Tilting head side to side (±15°) */
    roll: number;
}
