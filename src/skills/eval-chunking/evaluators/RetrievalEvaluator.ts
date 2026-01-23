import { EmbeddingService } from '../../../services/vector/EmbeddingService.js';
import type { VectorStore, VectorSearchResult } from '../../../services/vector/VectorStore.interface.js';
import { logger } from '../../../utils/logger.js';
import type { GoldenQuestion, RetrievalResult, RetrievedChunk } from '../types.js';
import type { FixedChunk } from '../chunkers/FixedSizeChunker.js';

interface ChunkWithLineRange {
  id: string;
  text: string;
  lineRange?: [number, number];
  vector?: number[];
}

export class RetrievalEvaluator {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;

  constructor(vectorStore: VectorStore) {
    this.embeddingService = new EmbeddingService();
    this.vectorStore = vectorStore;
  }

  async evaluateSemanticChunks(
    documentId: string,
    questions: GoldenQuestion[],
    topK: number = 5,
    content?: string
  ): Promise<RetrievalResult[]> {
    logger.info({ documentId, questionCount: questions.length, topK }, 'Evaluating semantic chunk retrieval');

    const lineOffsets = content ? this.buildLineOffsets(content) : null;
    const results: RetrievalResult[] = [];

    for (const question of questions) {
      const queryEmbedding = await this.embeddingService.generateEmbedding(question.question);
      const searchResults = await this.vectorStore.search(queryEmbedding, topK, {
        documentId: documentId,
      });
      const retrievedChunks = this.mapSearchResults(searchResults, question.sourceLineRange, lineOffsets, content);
      const result = this.buildRetrievalResult(question, retrievedChunks);
      results.push(result);
    }

    return results;
  }

  private buildLineOffsets(content: string): number[] {
    const offsets: number[] = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        offsets.push(i + 1);
      }
    }
    return offsets;
  }

  private charToLine(charPos: number, lineOffsets: number[]): number {
    let low = 0;
    let high = lineOffsets.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (lineOffsets[mid] <= charPos) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low + 1;
  }

  async evaluateFixedChunks(
    questions: GoldenQuestion[],
    chunks: FixedChunk[],
    topK: number = 5
  ): Promise<RetrievalResult[]> {
    logger.info({ questionCount: questions.length, chunkCount: chunks.length, topK }, 'Evaluating fixed chunk retrieval');

    const chunkTexts = chunks.map(c => c.text);
    const chunkEmbeddings = await this.embeddingService.generateEmbeddings(chunkTexts);

    const chunksWithVectors: ChunkWithLineRange[] = chunks.map((c, i) => ({
      id: c.id,
      text: c.text,
      lineRange: c.lineRange,
      vector: chunkEmbeddings[i],
    }));

    const results: RetrievalResult[] = [];

    for (const question of questions) {
      const queryEmbedding = await this.embeddingService.generateEmbedding(question.question);
      const searchResults = this.localSearch(queryEmbedding, chunksWithVectors, topK);
      const retrievedChunks = this.mapLocalResults(searchResults, question.sourceLineRange);
      const result = this.buildRetrievalResult(question, retrievedChunks);
      results.push(result);
    }

    return results;
  }

  private localSearch(
    query: number[],
    chunks: ChunkWithLineRange[],
    topK: number
  ): Array<{ chunk: ChunkWithLineRange; score: number }> {
    const scored = chunks
      .filter(c => c.vector)
      .map(chunk => ({
        chunk,
        score: this.cosineSimilarity(query, chunk.vector!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private mapSearchResults(
    results: VectorSearchResult[],
    expectedLineRange: [number, number],
    lineOffsets: number[] | null,
    content?: string
  ): RetrievedChunk[] {
    return results.map(r => {
      let lineRange = r.payload.metadata?.lineRange as [number, number] | undefined;
      
      if (!lineRange && lineOffsets && content) {
        const chunkText = r.payload.chunkText;
        const startChar = content.indexOf(chunkText);
        if (startChar !== -1) {
          const endChar = startChar + chunkText.length;
          lineRange = [this.charToLine(startChar, lineOffsets), this.charToLine(endChar, lineOffsets)];
        }
      }

      return {
        id: r.id,
        text: r.payload.chunkText,
        score: r.score,
        lineRange,
        containsRelevant: lineRange ? this.rangesOverlap(lineRange, expectedLineRange) : false,
      };
    });
  }

  private mapLocalResults(
    results: Array<{ chunk: ChunkWithLineRange; score: number }>,
    expectedLineRange: [number, number]
  ): RetrievedChunk[] {
    return results.map(r => ({
      id: r.chunk.id,
      text: r.chunk.text,
      score: r.score,
      lineRange: r.chunk.lineRange,
      containsRelevant: r.chunk.lineRange
        ? this.rangesOverlap(r.chunk.lineRange, expectedLineRange)
        : false,
    }));
  }

  private rangesOverlap(a: [number, number], b: [number, number]): boolean {
    return a[0] <= b[1] && b[0] <= a[1];
  }

  private buildRetrievalResult(
    question: GoldenQuestion,
    retrievedChunks: RetrievedChunk[]
  ): RetrievalResult {
    const firstRelevantIdx = retrievedChunks.findIndex(c => c.containsRelevant);
    const hit = firstRelevantIdx !== -1;
    const rankOfFirstRelevant = hit ? firstRelevantIdx + 1 : null;

    const tokenIoU = this.calculateTokenIoU(question, retrievedChunks);

    return {
      questionId: question.id,
      question: question.question,
      type: question.type,
      expectedLineRange: question.sourceLineRange,
      retrievedChunks,
      hit,
      rankOfFirstRelevant,
      tokenIoU,
    };
  }

  private calculateTokenIoU(
    question: GoldenQuestion,
    retrievedChunks: RetrievedChunk[]
  ): number {
    const expectedFacts = new Set(
      question.expectedFacts.flatMap(f => f.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    );

    if (expectedFacts.size === 0) return 0;

    const retrievedText = retrievedChunks.map(c => c.text).join(' ').toLowerCase();
    const retrievedWords = new Set(retrievedText.split(/\s+/).filter(w => w.length > 2));

    const intersection = [...expectedFacts].filter(w => retrievedWords.has(w)).length;
    const union = new Set([...expectedFacts, ...retrievedWords]).size;

    return union > 0 ? intersection / union : 0;
  }
}
