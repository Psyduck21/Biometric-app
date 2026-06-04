/**
 * Computes the cosine similarity between two 1D Float32Array vectors.
 * A value of 1.0 means perfectly identical directions.
 * A value of -1.0 means perfectly opposite directions.
 * A value of 0.0 means orthogonal (independent) vectors.
 * 
 * @param a First embedding vector (Float32Array)
 * @param b Second embedding vector (Float32Array)
 * @returns Similarity score between -1.0 and 1.0
 */
export function computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have the same length to compute similarity.');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
        return 0; // Avoid division by zero
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalises a vector in-place so its L2 norm equals 1.
 * Useful for preprocessing embeddings before computing similarity.
 * 
 * @param vector The Float32Array to normalise
 */
export function l2Normalize(vector: Float32Array): void {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
        norm += vector[i] * vector[i];
    }
    
    norm = Math.sqrt(norm);
    if (norm === 0) return;
    
    for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
    }
}
