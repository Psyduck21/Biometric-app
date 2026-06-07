export interface MathBBox {
  yMin: number;
  xMin: number;
  yMax: number;
  xMax: number;
}

/**
 * Computes the sigmoid of a given number.
 */
export function sigmoid(x: number): number {
  'worklet';
  return 1 / (1 + Math.exp(-x));
}

/**
 * Calculates the Intersection over Union (IoU) of two bounding boxes.
 */
export function calculateIoU(box1: MathBBox, box2: MathBBox): number {
  'worklet';
  const yMin = Math.max(box1.yMin, box2.yMin);
  const xMin = Math.max(box1.xMin, box2.xMin);
  const yMax = Math.min(box1.yMax, box2.yMax);
  const xMax = Math.min(box1.xMax, box2.xMax);

  const intersectionArea = Math.max(0, yMax - yMin) * Math.max(0, xMax - xMin);

  const box1Area = Math.max(0, box1.yMax - box1.yMin) * Math.max(0, box1.xMax - box1.xMin);
  const box2Area = Math.max(0, box2.yMax - box2.yMin) * Math.max(0, box2.xMax - box2.xMin);

  const unionArea = box1Area + box2Area - intersectionArea;
  if (unionArea <= 0) return 0;

  return intersectionArea / unionArea;
}

/**
 * Greedily selects a subset of bounding boxes in descending order of score,
 * pruning away boxes that have high intersection-over-union (IOU) overlap
 * with previously selected boxes.
 *
 * This behaves identically to tf.image.nonMaxSuppressionAsync.
 */
export function nonMaxSuppression(
  boxes: MathBBox[],
  scores: number[],
  maxOutputSize: number,
  iouThreshold: number,
  scoreThreshold: number
): number[] {
  'worklet';
  const candidates: { index: number; score: number; box: MathBBox }[] = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] >= scoreThreshold) {
      candidates.push({ index: i, score: scores[i], box: boxes[i] });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  const selectedIndices: number[] = [];

  for (const candidate of candidates) {
    if (selectedIndices.length >= maxOutputSize) {
      break;
    }

    let keep = true;
    for (const selectedIndex of selectedIndices) {
      const selectedBox = boxes[selectedIndex];
      const iou = calculateIoU(candidate.box, selectedBox);
      if (iou > iouThreshold) {
        keep = false;
        break;
      }
    }

    if (keep) {
      selectedIndices.push(candidate.index);
    }
  }

  return selectedIndices;
}

/**
 * Fast in-place-like rotation of a square Float32Array image by 90 degrees clockwise.
 * Used to correct camera sensor orientation for ML models.
 */
export function rotateSquareImage90CW(
  input: Float32Array,
  size: number,
  channels: number = 3
): Float32Array {
  'worklet';
  const output = new Float32Array(input.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * channels;
      // 90 deg CW: x_new = size - 1 - y, y_new = x
      const destX = size - 1 - y;
      const destY = x;
      const destIdx = (destY * size + destX) * channels;
      
      output[destIdx] = input[srcIdx];
      output[destIdx + 1] = input[srcIdx + 1];
      output[destIdx + 2] = input[srcIdx + 2];
    }
  }
  return output;
}

/**
 * Crops a bounding box from a flat Float32Array image and scales it to target dimensions
 * using nearest-neighbor interpolation. Normalizes from [0, 1] to [-1, 1].
 */
export function cropAndScaleTensor(
  input: Float32Array,
  srcWidth: number,
  srcHeight: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  targetW: number,
  targetH: number,
  normalization: 'none' | '[-1, 1]' | '[0, 255]' = '[-1, 1]'
): Float32Array {
  'worklet';
  const output = new Float32Array(targetW * targetH * 3);

  // Scale factors for interpolation
  const scaleX = boxW / targetW;
  const scaleY = boxH / targetH;

  for (let ty = 0; ty < targetH; ty++) {
    const srcY = boxY + ty * scaleY;
    let y1 = Math.floor(srcY);
    let y2 = Math.min(y1 + 1, srcHeight - 1);
    y1 = Math.max(0, Math.min(srcHeight - 1, y1));
    const wy = srcY - y1;

    for (let tx = 0; tx < targetW; tx++) {
      const srcX = boxX + tx * scaleX;
      let x1 = Math.floor(srcX);
      let x2 = Math.min(x1 + 1, srcWidth - 1);
      x1 = Math.max(0, Math.min(srcWidth - 1, x1));
      const wx = srcX - x1;

      // Indices for the 4 surrounding pixels
      const idx11 = (y1 * srcWidth + x1) * 3;
      const idx21 = (y1 * srcWidth + x2) * 3;
      const idx12 = (y2 * srcWidth + x1) * 3;
      const idx22 = (y2 * srcWidth + x2) * 3;

      // Bilinear interpolation for each channel
      let r = input[idx11] * (1 - wx) * (1 - wy) +
              input[idx21] * wx * (1 - wy) +
              input[idx12] * (1 - wx) * wy +
              input[idx22] * wx * wy;

      let g = input[idx11 + 1] * (1 - wx) * (1 - wy) +
              input[idx21 + 1] * wx * (1 - wy) +
              input[idx12 + 1] * (1 - wx) * wy +
              input[idx22 + 1] * wx * wy;

      let b = input[idx11 + 2] * (1 - wx) * (1 - wy) +
              input[idx21 + 2] * wx * (1 - wy) +
              input[idx12 + 2] * (1 - wx) * wy +
              input[idx22 + 2] * wx * wy;

      const destIdx = (ty * targetW + tx) * 3;

      if (normalization === '[-1, 1]') {
        output[destIdx] = (r * 2.0) - 1.0;
        output[destIdx + 1] = (g * 2.0) - 1.0;
        output[destIdx + 2] = (b * 2.0) - 1.0;
      } else if (normalization === '[0, 255]') {
        output[destIdx] = r * 255.0;
        output[destIdx + 1] = g * 255.0;
        output[destIdx + 2] = b * 255.0;
      } else {
        output[destIdx] = r;
        output[destIdx + 1] = g;
        output[destIdx + 2] = b;
      }
    }
  }

  return output;
}
