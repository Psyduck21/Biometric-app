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
  // Fast TFLite returns raw logits. We need to apply softmax.
  // MiniFASNet typically outputs 3 classes: 0=Fake, 1=Real, 2=Fake (or similar).
  
  let maxLogit = -Infinity;
  for (let i = 0; i < rawOutput.length; i++) {
    if (rawOutput[i] > maxLogit) {
      maxLogit = rawOutput[i];
    }
  }

  let sum = 0;
  const probs = new Float32Array(rawOutput.length);
  for (let i = 0; i < rawOutput.length; i++) {
    probs[i] = Math.exp(rawOutput[i] - maxLogit);
    sum += probs[i];
  }
  for (let i = 0; i < probs.length; i++) {
    probs[i] /= sum;
  }

  // Usually, Class 1 is 'Real' in MiniFASNet. If length is 2, maybe Class 1 is still Real.
  // If the model is a binary classifier where it just outputs 1 logit, use sigmoid.
  let confidence = 0;
  if (rawOutput.length === 1) {
    confidence = 1 / (1 + Math.exp(-rawOutput[0]));
  } else if (rawOutput.length >= 2) {
    // If length is 3 (Real is class 1), or length 2 (Real is class 1).
    // In Silent-Face-Anti-Spoofing, label 1 is real face.
    confidence = probs[1];
  }
  
  const isRealFace = confidence > REAL_FACE_THRESHOLD;
  
  return {
    isRealFace,
    confidence,
    attackType: isRealFace ? undefined : classifyAttackType(confidence),
  };
}
