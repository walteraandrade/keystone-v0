export type QuestionType = 'factoid' | 'contextual' | 'multi-span';
export type BoundaryQuality = 'clean' | 'mid-sentence' | 'mid-concept';
export type ChunkerType = 'semantic' | 'fixed';

export interface GoldenQuestion {
  id: string;
  documentId: string;
  question: string;
  type: QuestionType;
  sourceLineRange: [number, number];
  expectedFacts: string[];
  createdAt: string;
}

export interface RetrievalResult {
  questionId: string;
  question: string;
  type: QuestionType;
  expectedLineRange: [number, number];
  retrievedChunks: RetrievedChunk[];
  hit: boolean;
  rankOfFirstRelevant: number | null;
  tokenIoU: number;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
  lineRange?: [number, number];
  containsRelevant: boolean;
}

export interface ChunkEvaluation {
  chunkId: string;
  chunkIndex: number;
  conceptUnity: number;
  boundaryQuality: BoundaryQuality;
  standaloneScore: number;
  semanticType: string;
  tokens: number;
}

export interface PreservationResult {
  totalFacts: number;
  factsFound: number;
  missingFacts: string[];
  preservationScore: number;
}

export interface RetrievalMetrics {
  hitRateAt1: number;
  hitRateAt3: number;
  hitRateAt5: number;
  mrr: number;
  avgTokenIoU: number;
  totalQuestions: number;
}

export interface IntrinsicMetrics {
  avgConceptUnity: number;
  cleanBoundaryRate: number;
  avgStandaloneScore: number;
  totalChunks: number;
}

export interface EvalReport {
  documentId: string;
  chunkerType: ChunkerType;
  timestamp: string;
  goldenQuestions: GoldenQuestion[];
  retrievalResults: RetrievalResult[];
  retrievalMetrics: RetrievalMetrics;
  chunkEvaluations: ChunkEvaluation[];
  intrinsicMetrics: IntrinsicMetrics;
  preservation: PreservationResult;
  overallScore: number;
}

export interface ComparisonReport {
  documentId: string;
  timestamp: string;
  semantic: EvalReport;
  fixed: EvalReport;
  comparison: {
    retrievalDelta: number;
    intrinsicDelta: number;
    preservationDelta: number;
    overallDelta: number;
    winner: ChunkerType | 'tie';
  };
}

export interface EvalConfig {
  topK: number;
  questionCount: number;
  fixedChunkSize: number;
  fixedChunkOverlap: number;
  weights: {
    retrieval: number;
    intrinsic: number;
    preservation: number;
  };
}

export const DEFAULT_EVAL_CONFIG: EvalConfig = {
  topK: 5,
  questionCount: 20,
  fixedChunkSize: 512,
  fixedChunkOverlap: 50,
  weights: {
    retrieval: 0.5,
    intrinsic: 0.3,
    preservation: 0.2,
  },
};

export type ProgressCallback = (step: { current: number; total: number; message: string; substeps?: Array<{ current: number; total: number; message: string }> }) => void;
