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
