export type QuestionCategory = 'local_similarity' | 'global_understanding' | 'multi_hop' | 'aggregation';

export interface PropertyFilter {
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $contains?: string;
  $in?: unknown[];
}

export interface ExpectedEntityQuery {
  nodeLabel: string;
  properties?: Record<string, unknown | PropertyFilter>;
  relationshipFilter?: {
    type: string;
    direction: 'in' | 'out' | 'both';
    targetLabel?: string;
  };
}

export interface ExpectedPath {
  from: string;
  relationship: string;
  to: string;
}

export interface GroundTruth {
  questionId: number;
  category: QuestionCategory;
  expectedEntityQuery?: ExpectedEntityQuery;
  expectedCount?: number;
  expectedDistribution?: Record<string, number>;
  expectedPath?: ExpectedPath[];
  requiredKeywords?: string[];
}

export interface EvaluationScore {
  entityPrecision: number;
  entityRecall: number;
  entityF1: number;
  tokenCoverage: number;
  countAccuracy: number | null;
}

export interface ChunkResult {
  chunkId: string;
  text: string;
  score: number;
  semanticType: string;
  context: string;
  entity?: {
    id: string;
    type: string;
    name?: string;
    code?: string;
    description?: string;
    [key: string]: unknown;
  };
  relatedEntities?: Array<{
    id: string;
    type: string;
    name?: string;
    code?: string;
    [key: string]: unknown;
  }>;
}

export interface StoreEvalResult {
  latency_ms: number;
  result_count: number;
  context: string[];
  scores: EvaluationScore;
}

export interface QuestionEvalResult {
  question_id: number;
  category: QuestionCategory;
  question: string;
  ground_truth: {
    expected_entity_count: number;
    required_keywords: string[];
  };
  stores: {
    qdrant: StoreEvalResult;
    neo4j: StoreEvalResult;
  };
}

export interface EvaluationOutput {
  metadata: {
    timestamp: string;
    scoring: 'ground-truth';
    questions_file: string;
    total_questions: number;
  };
  summary: {
    qdrant: CategorySummary;
    neo4j: CategorySummary;
  };
  results: QuestionEvalResult[];
}

export interface CategorySummary {
  overall: MetricSummary;
  by_category: Record<QuestionCategory, MetricSummary>;
}

export interface MetricSummary {
  avg_precision: number;
  avg_recall: number;
  avg_f1: number;
  avg_token_coverage: number;
  avg_latency_ms: number;
}
