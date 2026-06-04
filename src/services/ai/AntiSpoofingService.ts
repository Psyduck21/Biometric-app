import { AntiSpoofingResult } from '../../types/liveness';

const REAL_FACE_THRESHOLD = 0.3;

export function classifyAttackType(confidence: number): AntiSpoofingResult['attackType'] {
  'worklet';
  if (confidence < 0.2) return 'PRINT';
  if (confidence < 0.4) return 'REPLAY';
  if (confidence < 0.6) return 'MASK';
  return 'UNKNOWN';
}

export function processAntiSpoofingOutput(rawOutput: Float32Array): AntiSpoofingResult {
  'worklet';
  // Fast TFLite will return the softmax/sigmoid output in rawOutput[0]
  const confidence = rawOutput[0];
  const isRealFace = confidence > REAL_FACE_THRESHOLD;
  
  return {
    isRealFace,
    confidence,
    attackType: isRealFace ? undefined : classifyAttackType(confidence),
  };
}
