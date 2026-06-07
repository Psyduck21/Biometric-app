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
