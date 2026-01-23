import type { EvalReport, ComparisonReport } from '../types.js';

export class JsonReporter {
  formatReport(report: EvalReport): string {
    return JSON.stringify(report, null, 2);
  }

  formatComparison(comparison: ComparisonReport): string {
    return JSON.stringify(comparison, null, 2);
  }

  formatSummary(report: EvalReport): object {
    return {
      documentId: report.documentId,
      chunkerType: report.chunkerType,
      timestamp: report.timestamp,
      metrics: {
        retrieval: {
          hitRateAt1: report.retrievalMetrics.hitRateAt1,
          hitRateAt3: report.retrievalMetrics.hitRateAt3,
          hitRateAt5: report.retrievalMetrics.hitRateAt5,
          mrr: report.retrievalMetrics.mrr,
        },
        intrinsic: {
          conceptUnity: report.intrinsicMetrics.avgConceptUnity,
          cleanBoundaryRate: report.intrinsicMetrics.cleanBoundaryRate,
          standaloneScore: report.intrinsicMetrics.avgStandaloneScore,
        },
        preservation: report.preservation.preservationScore,
        overall: report.overallScore,
      },
      counts: {
        questions: report.retrievalMetrics.totalQuestions,
        chunks: report.intrinsicMetrics.totalChunks,
        facts: report.preservation.totalFacts,
      },
    };
  }

  formatComparisonSummary(comparison: ComparisonReport): object {
    return {
      documentId: comparison.documentId,
      timestamp: comparison.timestamp,
      winner: comparison.comparison.winner,
      scores: {
        semantic: comparison.semantic.overallScore,
        fixed: comparison.fixed.overallScore,
      },
      deltas: {
        retrieval: comparison.comparison.retrievalDelta,
        intrinsic: comparison.comparison.intrinsicDelta,
        preservation: comparison.comparison.preservationDelta,
        overall: comparison.comparison.overallDelta,
      },
    };
  }
}
