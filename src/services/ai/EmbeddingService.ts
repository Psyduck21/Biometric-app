import { l2Normalize } from '../../utils/embeddings';

export function processEmbeddingOutput(rawOutput: Float32Array): Float32Array {
  'worklet';
  const embedding = new Float32Array(rawOutput);
  // In a real implementation we would L2 normalize it using a math loop,
  // but since l2Normalize from utils/embeddings is imported, we should ensure it's a worklet.
  let sumSquare = 0;
  for (let i = 0; i < embedding.length; i++) {
    sumSquare += embedding[i] * embedding[i];
  }
  const norm = Math.sqrt(sumSquare);
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / norm;
    }
  }
  
  return embedding;
}
