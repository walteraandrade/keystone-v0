import {
  type RetrievalResult,
  type RetrievalMetrics,
  type ChunkEvaluation,
  type IntrinsicMetrics,
  type PreservationResult,
  type EvalConfig,
  DEFAULT_EVAL_CONFIG,
} from '../types.js';

export class MetricsCalculator {
  private config: EvalConfig;

  constructor(config: EvalConfig = DEFAULT_EVAL_CONFIG) {
    this.config = config;
  }

  calculateRetrievalMetrics(results: RetrievalResult[]): RetrievalMetrics {
    if (results.length === 0) {
      return {
        hitRateAt1: 0,
        hitRateAt3: 0,
        hitRateAt5: 0,
        mrr: 0,
        avgTokenIoU: 0,
        totalQuestions: 0,
      };
    }

    const hitsAt1 = results.filter(r => r.rankOfFirstRelevant === 1).length;
    const hitsAt3 = results.filter(r => r.rankOfFirstRelevant !== null && r.rankOfFirstRelevant <= 3).length;
    const hitsAt5 = results.filter(r => r.rankOfFirstRelevant !== null && r.rankOfFirstRelevant <= 5).length;

    const reciprocalRanks = results.map(r =>
      r.rankOfFirstRelevant !== null ? 1 / r.rankOfFirstRelevant : 0
    );
    const mrr = reciprocalRanks.reduce((a, b) => a + b, 0) / results.length;

    const avgTokenIoU = results.reduce((sum, r) => sum + r.tokenIoU, 0) / results.length;

    return {
      hitRateAt1: hitsAt1 / results.length,
      hitRateAt3: hitsAt3 / results.length,
      hitRateAt5: hitsAt5 / results.length,
      mrr,
      avgTokenIoU,
      totalQuestions: results.length,
    };
  }

  calculateIntrinsicMetrics(evaluations: ChunkEvaluation[]): IntrinsicMetrics {
    if (evaluations.length === 0) {
      return {
        avgConceptUnity: 0,
        cleanBoundaryRate: 0,
        avgStandaloneScore: 0,
        totalChunks: 0,
      };
    }

    const avgConceptUnity =
      evaluations.reduce((sum, e) => sum + e.conceptUnity, 0) / evaluations.length;

    const cleanBoundaries = evaluations.filter(e => e.boundaryQuality === 'clean').length;
    const cleanBoundaryRate = cleanBoundaries / evaluations.length;

    const avgStandaloneScore =
      evaluations.reduce((sum, e) => sum + e.standaloneScore, 0) / evaluations.length;

    return {
      avgConceptUnity,
      cleanBoundaryRate,
      avgStandaloneScore,
      totalChunks: evaluations.length,
    };
  }

  calculateOverallScore(
    retrievalMetrics: RetrievalMetrics,
    intrinsicMetrics: IntrinsicMetrics,
    preservation: PreservationResult
  ): number {
    const retrievalScore = (
      retrievalMetrics.hitRateAt1 * 0.3 +
      retrievalMetrics.hitRateAt3 * 0.3 +
      retrievalMetrics.mrr * 0.4
    );

    const intrinsicScore = (
      (intrinsicMetrics.avgConceptUnity / 5) * 0.4 +
      intrinsicMetrics.cleanBoundaryRate * 0.3 +
      (intrinsicMetrics.avgStandaloneScore / 5) * 0.3
    );

    const preservationScore = preservation.preservationScore;

    const overall =
      this.config.weights.retrieval * retrievalScore +
      this.config.weights.intrinsic * intrinsicScore +
      this.config.weights.preservation * preservationScore;

    return Math.round(overall * 1000) / 1000;
  }

  calculateDelta(semantic: number, fixed: number): number {
    return Math.round((semantic - fixed) * 1000) / 1000;
  }

  determineWinner(semanticScore: number, fixedScore: number): 'semantic' | 'fixed' | 'tie' {
    const threshold = 0.02;
    const delta = semanticScore - fixedScore;

    if (Math.abs(delta) < threshold) return 'tie';
    return delta > 0 ? 'semantic' : 'fixed';
  }
}
