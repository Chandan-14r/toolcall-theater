// Local Vector space model using TF-IDF for local semantic memory retrieval.
// Since no external embedding API is available (as audited), this provides a 
// zero-dependency, real mathematical vector similarity search running locally.

export class VectorStore {
  constructor() {
    this.documents = []; // Array of { id, scope, content, tokens: string[] }
  }

  add(id, scope, content) {
    const tokens = this._tokenize(content);
    this.documents.push({ id, scope, content, tokens });
  }

  search(query, scope, limit = 5) {
    const queryTokens = this._tokenize(query);
    const filteredDocs = this.documents.filter(d => d.scope === scope);
    
    if (filteredDocs.length === 0) return [];

    // Calculate IDF for all tokens in our corpus
    const idf = this._calculateIdfs(filteredDocs);

    // Vectorize query
    const queryVector = this._vectorize(queryTokens, idf);

    const results = filteredDocs.map(doc => {
      const docVector = this._vectorize(doc.tokens, idf);
      const score = this._cosineSimilarity(queryVector, docVector);
      return {
        id: doc.id,
        content: doc.content,
        score
      };
    });

    // Rank by score descending and filter out zero-similarity results
    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  _tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(t => t.length > 2); // Filter out short stop-words
  }

  _calculateIdfs(docs) {
    const idf = {};
    const totalDocs = docs.length;
    
    docs.forEach(doc => {
      const uniqueTokens = new Set(doc.tokens);
      uniqueTokens.forEach(token => {
        idf[token] = (idf[token] || 0) + 1;
      });
    });

    for (const token in idf) {
      // Standard IDF formula: log(1 + N / DF)
      idf[token] = Math.log(1 + totalDocs / idf[token]);
    }

    return idf;
  }

  _vectorize(tokens, idf) {
    const tf = {};
    tokens.forEach(t => {
      tf[t] = (tf[t] || 0) + 1;
    });

    const vector = {};
    for (const token in tf) {
      if (idf[token]) {
        vector[token] = tf[token] * idf[token];
      }
    }
    return vector;
  }

  _cosineSimilarity(v1, v2) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    const allKeys = new Set([...Object.keys(v1), ...Object.keys(v2)]);

    allKeys.forEach(key => {
      const val1 = v1[key] || 0;
      const val2 = v2[key] || 0;
      dotProduct += val1 * val2;
      normA += val1 * val1;
      normB += val2 * val2;
    });

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  clear() {
    this.documents = [];
  }
}

export const globalVectorStore = new VectorStore();
