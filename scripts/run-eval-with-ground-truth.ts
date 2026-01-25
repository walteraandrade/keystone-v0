import { Neo4jRepository } from '../src/services/graph/Neo4jRepository.js';
import { Neo4jVectorStore } from '../src/services/vector/Neo4jVectorStore.js';
import { EmbeddingService } from '../src/services/vector/EmbeddingService.js';
import { HybridQueryService } from '../src/services/query/HybridQueryService.js';
import { GroundTruthEvaluator } from './evaluation/evaluator.js';
import { GROUND_TRUTH, QUESTIONS } from './evaluation/ground-truth.js';
import { writeFileSync } from 'fs';
import type { QuestionCategory, ChunkResult, EvaluationScore } from './evaluation/types.js';

interface QuestionResult {
  question_id: number;
  category: QuestionCategory;
  question: string;
  ground_truth: {
    expected_entity_count: number;
    required_keywords: string[];
  };
  latency_ms: number;
  result_count: number;
  context: string[];
  scores: EvaluationScore;
}

interface EvalOutput {
  metadata: {
    timestamp: string;
    scoring: 'ground-truth';
    vector_store: 'neo4j';
    total_questions: number;
  };
  summary: {
    overall: MetricSummary;
    by_category: Record<QuestionCategory, MetricSummary>;
  };
  results: QuestionResult[];
}

interface MetricSummary {
  avg_precision: number;
  avg_recall: number;
  avg_f1: number;
  avg_token_coverage: number;
  avg_latency_ms: number;
}

async function queryHybrid(
  hybridService: HybridQueryService,
  question: string
): Promise<{ latency: number; chunks: ChunkResult[] }> {
  const start = Date.now();
  const result = await hybridService.semanticSearchWithExpansion({
    query: question,
    limit: 5,
    expandDepth: 2,
  });
  const latency = Date.now() - start;

  const chunks: ChunkResult[] = result.chunks.map(c => ({
    chunkId: c.chunkId,
    text: c.text,
    score: c.score,
    semanticType: c.semanticType,
    context: c.context,
    entity: c.entity as unknown as ChunkResult['entity'],
    relatedEntities: c.relatedEntities as unknown as ChunkResult['relatedEntities'],
  }));

  return { latency, chunks };
}

function computeSummary(results: QuestionResult[]): EvalOutput['summary'] {
  const categories: QuestionCategory[] = ['local_similarity', 'global_understanding', 'multi_hop', 'aggregation'];

  const computeMetrics = (items: QuestionResult[]): MetricSummary => {
    if (items.length === 0) {
      return { avg_precision: 0, avg_recall: 0, avg_f1: 0, avg_token_coverage: 0, avg_latency_ms: 0 };
    }
    const sum = items.reduce(
      (acc, r) => ({
        precision: acc.precision + r.scores.entityPrecision,
        recall: acc.recall + r.scores.entityRecall,
        f1: acc.f1 + r.scores.entityF1,
        coverage: acc.coverage + r.scores.tokenCoverage,
        latency: acc.latency + r.latency_ms,
      }),
      { precision: 0, recall: 0, f1: 0, coverage: 0, latency: 0 }
    );
    return {
      avg_precision: sum.precision / items.length,
      avg_recall: sum.recall / items.length,
      avg_f1: sum.f1 / items.length,
      avg_token_coverage: sum.coverage / items.length,
      avg_latency_ms: Math.round(sum.latency / items.length),
    };
  };

  const byCategory = {} as Record<QuestionCategory, MetricSummary>;
  for (const cat of categories) {
    byCategory[cat] = computeMetrics(results.filter(r => r.category === cat));
  }

  return {
    overall: computeMetrics(results),
    by_category: byCategory,
  };
}

async function main() {
  console.log('=== RAG Evaluation with Ground Truth ===\n');

  console.log('Connecting to Neo4j...');
  const neo4jGraph = new Neo4jRepository();
  await neo4jGraph.connect();

  const vectorStore = new Neo4jVectorStore();
  await vectorStore.connect();

  const embeddingService = new EmbeddingService();
  const hybridService = new HybridQueryService(neo4jGraph, vectorStore, embeddingService);
  const evaluator = new GroundTruthEvaluator(neo4jGraph);

  console.log('Running evaluation on 20 questions...\n');

  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    const groundTruth = GROUND_TRUTH.find(gt => gt.questionId === q.id);
    if (!groundTruth) {
      console.warn(`No ground truth for Q${q.id}, skipping`);
      continue;
    }

    console.log(`[${q.id}/20] ${q.category}: ${q.q.slice(0, 50)}...`);

    const { latency, chunks } = await queryHybrid(hybridService, q.q);
    const scores = await evaluator.evaluate(q.id, chunks, groundTruth);
    const expectedEntities = await evaluator.queryExpectedEntities(groundTruth);

    results.push({
      question_id: q.id,
      category: q.category as QuestionCategory,
      question: q.q,
      ground_truth: {
        expected_entity_count: expectedEntities.size,
        required_keywords: groundTruth.requiredKeywords || [],
      },
      latency_ms: latency,
      result_count: chunks.length,
      context: chunks.slice(0, 3).map(c => c.text.slice(0, 200)),
      scores,
    });

    console.log(`   P=${scores.entityPrecision.toFixed(2)} R=${scores.entityRecall.toFixed(2)} F1=${scores.entityF1.toFixed(2)} TC=${scores.tokenCoverage.toFixed(2)} ${latency}ms`);
  }

  const output: EvalOutput = {
    metadata: {
      timestamp: new Date().toISOString(),
      scoring: 'ground-truth',
      vector_store: 'neo4j',
      total_questions: 20,
    },
    summary: computeSummary(results),
    results,
  };

  writeFileSync('evaluation-results-ground-truth.json', JSON.stringify(output, null, 2));

  console.log('\n=== Summary ===\n');
  const s = output.summary;
  console.log(`Overall: P=${s.overall.avg_precision.toFixed(3)} R=${s.overall.avg_recall.toFixed(3)} F1=${s.overall.avg_f1.toFixed(3)} TC=${s.overall.avg_token_coverage.toFixed(3)} Latency=${s.overall.avg_latency_ms}ms`);

  console.log('\nBy Category:');
  for (const cat of ['local_similarity', 'global_understanding', 'multi_hop', 'aggregation'] as const) {
    const c = s.by_category[cat];
    console.log(`  ${cat}: F1=${c.avg_f1.toFixed(3)} TC=${c.avg_token_coverage.toFixed(3)} Latency=${c.avg_latency_ms}ms`);
  }

  console.log('\nResults saved to evaluation-results-ground-truth.json');

  await vectorStore.disconnect();
  await neo4jGraph.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
