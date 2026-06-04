import { DetectionResult, FaceDetection } from '../../types/models';
import { MathBBox, nonMaxSuppression, sigmoid } from '../../utils/mathUtils';

const INPUT_SIZE = 128;
const ANCHORS_CONFIG = {
  strides: [8, 16] as [number, number],
  anchors: [2, 6] as [number, number],
};

export function generateAnchors(width: number, height: number): number[][] {
  'worklet';
  const anchors: number[][] = [];

  for (let i = 0; i < ANCHORS_CONFIG.strides.length; i++) {
    const stride = ANCHORS_CONFIG.strides[i];
    const gridRows = Math.floor((height + stride - 1) / stride);
    const gridCols = Math.floor((width + stride - 1) / stride);
    const anchorsNum = ANCHORS_CONFIG.anchors[i];

    for (let gridY = 0; gridY < gridRows; gridY++) {
      const anchorY = stride * (gridY + 0.5);
      for (let gridX = 0; gridX < gridCols; gridX++) {
        const anchorX = stride * (gridX + 0.5);
        for (let anchorIndex = 0; anchorIndex < anchorsNum; anchorIndex++) {
          anchors.push([anchorX, anchorY]);
        }
      }
    }
  }

  return anchors;
}

export function decodeBounds(boxOutputs: number[][], anchors: number[][], inputSize: number): MathBBox[] {
  'worklet';
  const decoded: MathBBox[] = [];

  for (let i = 0; i < boxOutputs.length; i++) {
    const box = boxOutputs[i];
    const anchor = anchors[i];

    const centerY = box[0] + anchor[1];
    const centerX = box[1] + anchor[0];
    const h = box[2];
    const w = box[3];

    const centerYNorm = centerY / inputSize;
    const centerXNorm = centerX / inputSize;
    const hNorm = h / inputSize;
    const wNorm = w / inputSize;

    const yMin = centerYNorm - hNorm / 2;
    const xMin = centerXNorm - wNorm / 2;
    const yMax = centerYNorm + hNorm / 2;
    const xMax = centerXNorm + wNorm / 2;

    decoded.push({
      yMin: yMin * inputSize,
      xMin: xMin * inputSize,
      yMax: yMax * inputSize,
      xMax: xMax * inputSize,
    });
  }

  return decoded;
}

export function processBlazeFaceOutput(
  rawOutput: Float32Array, // Flat array representing [1, num_anchors, 17] or [num_anchors, 17]
  anchors: number[][],
  frameWidth: number,
  frameHeight: number
): DetectionResult {
  'worklet';
  const numAnchors = anchors.length;
  // If the model output is combined [numAnchors, 16/17], determine step.
  const step = rawOutput.length / numAnchors; 
  
  const scores: number[] = [];
  const boxOutputs: number[][] = [];

  for (let i = 0; i < numAnchors; i++) {
    const offset = i * step;
    // Score is the first element
    scores.push(sigmoid(rawOutput[offset]));
    
    // BBox regressions are the next 4
    boxOutputs.push([
      rawOutput[offset + 1], // yCenter
      rawOutput[offset + 2], // xCenter
      rawOutput[offset + 3], // h
      rawOutput[offset + 4], // w
    ]);
  }

  const decodedBoxes = decodeBounds(boxOutputs, anchors, INPUT_SIZE);
  
  const iouThreshold = 0.3;
  const scoreThreshold = 0.75;
  const maxOutputSize = 5;

  const selectedIndices = nonMaxSuppression(
    decodedBoxes,
    scores,
    maxOutputSize,
    iouThreshold,
    scoreThreshold
  );

  const faces: FaceDetection[] = [];
  const scaleX = frameWidth / INPUT_SIZE;
  const scaleY = frameHeight / INPUT_SIZE;

  for (const index of selectedIndices) {
    const box = decodedBoxes[index];
    const bbox = {
      xMin: Math.max(0, box.xMin * scaleX),
      yMin: Math.max(0, box.yMin * scaleY),
      xMax: Math.min(frameWidth, box.xMax * scaleX),
      yMax: Math.min(frameHeight, box.yMax * scaleY),
      width: Math.max(0, (box.xMax - box.xMin) * scaleX),
      height: Math.max(0, (box.yMax - box.yMin) * scaleY),
    };

    const faceWidth = Math.max(1, bbox.width);
    const faceHeight = Math.max(1, bbox.height);
    const faceCentreX = bbox.xMin + faceWidth / 2;
    const faceCentreY = bbox.yMin + faceHeight / 2;
    const landmarks = [
      { x: bbox.xMin + faceWidth * 0.35, y: bbox.yMin + faceHeight * 0.38 },
      { x: bbox.xMin + faceWidth * 0.65, y: bbox.yMin + faceHeight * 0.38 },
      { x: faceCentreX, y: bbox.yMin + faceHeight * 0.55 },
      { x: faceCentreX, y: bbox.yMin + faceHeight * 0.72 },
      { x: bbox.xMin + faceWidth * 0.28, y: faceCentreY },
      { x: bbox.xMin + faceWidth * 0.72, y: faceCentreY },
    ];

    faces.push({
      bbox,
      confidence: scores[index],
      landmarks,
    });
  }

  return {
    faces,
    frameWidth,
    frameHeight,
    processingTimeMs: 0,
  };
}
