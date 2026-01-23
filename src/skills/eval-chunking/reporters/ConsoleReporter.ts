import type { EvalReport, ComparisonReport } from '../types.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const fmt = (color: keyof typeof COLORS, text: string): string =>
  `${COLORS[color]}${text}${COLORS.reset}`;

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const num = (n: number, decimals = 2): string => n.toFixed(decimals);

type Interpretation = 'Excellent' | 'Good' | 'Needs Work';

interface MetricDisplay {
  label: string;
  value: string;
  interpretation: Interpretation;
  description: string;
}

export class ConsoleReporter {
  printReport(report: EvalReport): void {
    this.printHeader(report);
    this.printSearchQuality(report);
    this.printChunkQuality(report);
    this.printInformationPreservation(report);
    this.printOverallScore(report.overallScore);
    this.printWhatThisMeans(report);
    this.printRecommendations(report);
  }

  printComparison(comparison: ComparisonReport): void {
    this.printComparisonHeader(comparison);
    this.printComparisonSearchQuality(comparison);
    this.printComparisonChunkQuality(comparison);
    this.printComparisonPreservation(comparison);
    this.printComparisonOverall(comparison);
    this.printWhatThisMeansComparison(comparison);
    this.printRecommendationsComparison(comparison);
  }

  private printHeader(report: EvalReport): void {
    const docName = this.getDocumentName(report.documentId);
    console.log('\n' + fmt('bold', '╔═══════════════════════════════════════════════════════════════╗'));
    console.log(fmt('bold', '║ CHUNKING EVALUATION REPORT                                    ║'));
    console.log(fmt('bold', '╠═══════════════════════════════════════════════════════════════╣'));
    console.log(fmt('bold', `║ Document: ${docName.padEnd(55)}║`));
    console.log(fmt('bold', `║ Chunker: ${report.chunkerType.toUpperCase().padEnd(56)}║`));
    console.log(fmt('dim', `║ Timestamp: ${new Date(report.timestamp).toLocaleString().padEnd(50)}║`));
    console.log(fmt('bold', '╚═══════════════════════════════════════════════════════════════╝'));
  }

  private printComparisonHeader(comparison: ComparisonReport): void {
    const docName = this.getDocumentName(comparison.documentId);
    const s = comparison.semantic.overallScore;
    const f = comparison.fixed.overallScore;
    const delta = comparison.comparison.overallDelta;
    const winner = comparison.comparison.winner;
    
    let summary: string;
    if (winner === 'tie') {
      summary = `Both strategies scored ${pct(s)} (tie)`;
    } else {
      const winnerScore = winner === 'semantic' ? s : f;
      const loserScore = winner === 'semantic' ? f : s;
      const strategy = winner === 'semantic' ? 'Semantic' : 'Fixed-size';
      summary = `${strategy} chunking scored ${pct(winnerScore)} vs ${pct(loserScore)} → ${strategy} wins by ${Math.abs(delta * 100).toFixed(1)} points`;
    }

    console.log('\n' + fmt('bold', '╔═══════════════════════════════════════════════════════════════╗'));
    console.log(fmt('bold', '║ CHUNKING COMPARISON REPORT                                  ║'));
    console.log(fmt('bold', '╠═══════════════════════════════════════════════════════════════╣'));
    console.log(fmt('bold', `║ Document: ${docName.padEnd(55)}║`));
    console.log(fmt('bold', `║ Summary: ${summary.substring(0, 55).padEnd(55)}║`));
    console.log(fmt('dim', `║ Timestamp: ${new Date(comparison.timestamp).toLocaleString().padEnd(50)}║`));
    console.log(fmt('bold', '╚═══════════════════════════════════════════════════════════════╝'));
  }

  private printSearchQuality(report: EvalReport): void {
    const m = report.retrievalMetrics;
    const metrics: MetricDisplay[] = [
      {
        label: 'First-Choice Accuracy',
        value: `${pct(m.hitRateAt1)} (${Math.round(m.hitRateAt1 * m.totalQuestions)}/${m.totalQuestions} questions)`,
        interpretation: this.interpretScore(m.hitRateAt1),
        description: 'Percentage of questions where the correct chunk appeared in the top result',
      },
      {
        label: 'Top-3 Accuracy',
        value: `${pct(m.hitRateAt3)} (${Math.round(m.hitRateAt3 * m.totalQuestions)}/${m.totalQuestions} questions)`,
        interpretation: this.interpretScore(m.hitRateAt3),
        description: 'Percentage of questions where the correct chunk appeared in top 3 results',
      },
      {
        label: 'Top-5 Accuracy',
        value: `${pct(m.hitRateAt5)} (${Math.round(m.hitRateAt5 * m.totalQuestions)}/${m.totalQuestions} questions)`,
        interpretation: this.interpretScore(m.hitRateAt5),
        description: 'Percentage of questions where the correct chunk appeared in top 5 results',
      },
      {
        label: 'Ranking Quality',
        value: pct(m.mrr),
        interpretation: this.interpretScore(m.mrr),
        description: 'How quickly correct chunks appear in search results (higher = faster)',
      },
    ];

    this.printMetricSection('SEARCH QUALITY', 'Measures: Can we find the right chunk when asking questions?', metrics);
  }

  private printComparisonSearchQuality(comparison: ComparisonReport): void {
    const s = comparison.semantic.retrievalMetrics;
    const f = comparison.fixed.retrievalMetrics;
    const deltas = {
      hitRateAt1: s.hitRateAt1 - f.hitRateAt1,
      hitRateAt3: s.hitRateAt3 - f.hitRateAt3,
      hitRateAt5: s.hitRateAt5 - f.hitRateAt5,
      mrr: s.mrr - f.mrr,
    };

    console.log('\n' + fmt('bold', '┌─ SEARCH QUALITY ─────────────────────────────────────────────┐'));
    console.log(fmt('dim', '│ Measures: Can we find the right chunk when asking questions? │'));
    console.log(fmt('bold', '├──────────────────────────────────────────────────────────────┤'));
    
    this.printComparisonRow('First-Choice Accuracy', pct(s.hitRateAt1), pct(f.hitRateAt1), deltas.hitRateAt1);
    this.printComparisonRow('Top-3 Accuracy', pct(s.hitRateAt3), pct(f.hitRateAt3), deltas.hitRateAt3);
    this.printComparisonRow('Top-5 Accuracy', pct(s.hitRateAt5), pct(f.hitRateAt5), deltas.hitRateAt5);
    this.printComparisonRow('Ranking Quality', pct(s.mrr), pct(f.mrr), deltas.mrr);
    
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printChunkQuality(report: EvalReport): void {
    const m = report.intrinsicMetrics;
    const metrics: MetricDisplay[] = [
      {
        label: 'Topic Coherence',
        value: `${pct(m.avgConceptUnity / 5)} (${num(m.avgConceptUnity)}/5)`,
        interpretation: this.interpretScore(m.avgConceptUnity / 5),
        description: 'How well chunks stay focused on a single topic',
      },
      {
        label: 'Boundary Quality',
        value: `${pct(m.cleanBoundaryRate)} (${Math.round(m.cleanBoundaryRate * m.totalChunks)}/${m.totalChunks} chunks)`,
        interpretation: this.interpretScore(m.cleanBoundaryRate),
        description: 'Percentage of chunks that start/end at natural boundaries',
      },
      {
        label: 'Standalone Clarity',
        value: `${pct(m.avgStandaloneScore / 5)} (${num(m.avgStandaloneScore)}/5)`,
        interpretation: this.interpretScore(m.avgStandaloneScore / 5),
        description: 'How understandable chunks are without surrounding context',
      },
    ];

    this.printMetricSection('CHUNK QUALITY', 'Measures: How well-formed are the individual chunks?', metrics);
  }

  private printComparisonChunkQuality(comparison: ComparisonReport): void {
    const s = comparison.semantic.intrinsicMetrics;
    const f = comparison.fixed.intrinsicMetrics;
    const deltas = {
      conceptUnity: (s.avgConceptUnity - f.avgConceptUnity) / 5,
      boundaryRate: s.cleanBoundaryRate - f.cleanBoundaryRate,
      standalone: (s.avgStandaloneScore - f.avgStandaloneScore) / 5,
    };

    console.log('\n' + fmt('bold', '┌─ CHUNK QUALITY ──────────────────────────────────────────────┐'));
    console.log(fmt('dim', '│ Measures: How well-formed are the individual chunks?          │'));
    console.log(fmt('bold', '├──────────────────────────────────────────────────────────────┤'));
    
    this.printComparisonRow('Topic Coherence', pct(s.avgConceptUnity / 5), pct(f.avgConceptUnity / 5), deltas.conceptUnity);
    this.printComparisonRow('Boundary Quality', pct(s.cleanBoundaryRate), pct(f.cleanBoundaryRate), deltas.boundaryRate);
    this.printComparisonRow('Standalone Clarity', pct(s.avgStandaloneScore / 5), pct(f.avgStandaloneScore / 5), deltas.standalone);
    
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printInformationPreservation(report: EvalReport): void {
    const p = report.preservation;
    const metrics: MetricDisplay[] = [
      {
        label: 'Fact Preservation',
        value: `${pct(p.preservationScore)} (${p.factsFound}/${p.totalFacts} facts)`,
        interpretation: this.interpretScore(p.preservationScore),
        description: 'Percentage of key facts from the document that appear in chunks',
      },
    ];

    this.printMetricSection('INFORMATION PRESERVATION', 'Measures: Are important facts preserved when chunking?', metrics);

    if (p.missingFacts.length > 0 && p.missingFacts.length <= 5) {
      console.log(fmt('yellow', '\n  Missing facts:'));
      for (const fact of p.missingFacts) {
        console.log(fmt('dim', `    • ${fact.substring(0, 75)}${fact.length > 75 ? '...' : ''}`));
      }
    } else if (p.missingFacts.length > 5) {
      console.log(fmt('yellow', `\n  Missing ${p.missingFacts.length} facts (use --format json to see details)`));
    }
  }

  private printComparisonPreservation(comparison: ComparisonReport): void {
    const s = comparison.semantic.preservation;
    const f = comparison.fixed.preservation;
    const delta = comparison.comparison.preservationDelta;

    console.log('\n' + fmt('bold', '┌─ INFORMATION PRESERVATION ───────────────────────────────────┐'));
    console.log(fmt('dim', '│ Measures: Are important facts preserved when chunking?      │'));
    console.log(fmt('bold', '├──────────────────────────────────────────────────────────────┤'));
    
    this.printComparisonRow('Fact Preservation', pct(s.preservationScore), pct(f.preservationScore), delta);
    
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printOverallScore(score: number): void {
    console.log('\n' + fmt('bold', '┌─ OVERALL SCORE ──────────────────────────────────────────────┐'));
    const bar = this.scoreBar(score);
    const interpretation = this.interpretScore(score);
    const badge = this.getBadge(interpretation);
    console.log(`│ ${fmt('bold', 'Overall Performance:')} ${pct(score).padEnd(6)} ${bar.padEnd(25)} ${badge} │`);
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printComparisonOverall(comparison: ComparisonReport): void {
    const s = comparison.semantic.overallScore;
    const f = comparison.fixed.overallScore;
    const delta = comparison.comparison.overallDelta;
    const winner = comparison.comparison.winner;

    console.log('\n' + fmt('bold', '┌─ OVERALL SCORE ──────────────────────────────────────────────┐'));
    console.log(fmt('bold', '├──────────────────────────────────────────────────────────────┤'));
    this.printComparisonRow('OVERALL', pct(s), pct(f), delta, true);
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));

    const emoji = winner === 'semantic' ? '🏆' : winner === 'fixed' ? '📦' : '🤝';
    const label = winner === 'tie' ? 'TIE' : winner.toUpperCase();
    const color = winner === 'semantic' ? 'green' : winner === 'fixed' ? 'yellow' : 'blue';
    console.log('\n' + fmt('bold', `Winner: ${emoji} ${fmt(color, label)}`));
  }

  private printWhatThisMeans(report: EvalReport): void {
    const m = report.retrievalMetrics;
    const i = report.intrinsicMetrics;
    const p = report.preservation;
    const overall = report.overallScore;

    console.log('\n' + fmt('bold', '┌─ WHAT THIS MEANS ────────────────────────────────────────────┐'));
    
    const insights: string[] = [];
    
    if (m.hitRateAt1 >= 0.8) {
      insights.push(`Your chunking strategy finds the right information ${pct(m.hitRateAt1)} of the time on the first try.`);
    } else if (m.hitRateAt1 >= 0.6) {
      insights.push(`Your chunking strategy finds the right information ${pct(m.hitRateAt1)} of the time on the first try, with room for improvement.`);
    } else {
      insights.push(`Your chunking strategy struggles to find the right information (only ${pct(m.hitRateAt1)} first-try accuracy).`);
    }

    if (i.avgConceptUnity / 5 >= 0.8) {
      insights.push(`Chunks are well-focused on single topics (${pct(i.avgConceptUnity / 5)} coherence).`);
    } else if (i.avgConceptUnity / 5 < 0.6) {
      insights.push(`Chunks mix multiple topics (${pct(i.avgConceptUnity / 5)} coherence), which may confuse retrieval.`);
    }

    if (i.cleanBoundaryRate < 0.7) {
      insights.push(`Many chunks break at unnatural boundaries (${pct(1 - i.cleanBoundaryRate)}), potentially splitting related content.`);
    }

    if (p.preservationScore < 0.9) {
      insights.push(`${p.totalFacts - p.factsFound} key facts may be lost or fragmented across chunks.`);
    }

    if (overall >= 0.8) {
      insights.push(`Overall, your chunking strategy performs well and should provide reliable search results.`);
    } else if (overall < 0.6) {
      insights.push(`Overall performance is below optimal. Consider adjusting chunking parameters or strategy.`);
    }

    for (const insight of insights) {
      console.log(`│ ${insight.padEnd(60)} │`);
    }
    
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printWhatThisMeansComparison(comparison: ComparisonReport): void {
    const s = comparison.semantic;
    const f = comparison.fixed;
    const winner = comparison.comparison.winner;
    const delta = comparison.comparison.overallDelta;

    console.log('\n' + fmt('bold', '┌─ WHAT THIS MEANS ────────────────────────────────────────────┐'));
    
    const insights: string[] = [];

    if (winner === 'tie') {
      insights.push('Both chunking strategies perform similarly. Either approach should work well.');
    } else {
      const winnerName = winner === 'semantic' ? 'Semantic' : 'Fixed-size';
      const loserName = winner === 'semantic' ? 'Fixed-size' : 'Semantic';
      insights.push(`${winnerName} chunking outperforms ${loserName} by ${Math.abs(delta * 100).toFixed(1)} points overall.`);
    }

    const retrievalDelta = comparison.comparison.retrievalDelta;
    if (Math.abs(retrievalDelta) > 0.05) {
      if (retrievalDelta > 0) {
        insights.push(`Semantic chunking finds answers ${pct(Math.abs(retrievalDelta))} more accurately.`);
      } else {
        insights.push(`Fixed-size chunking finds answers ${pct(Math.abs(retrievalDelta))} more accurately.`);
      }
    }

    const intrinsicDelta = comparison.comparison.intrinsicDelta;
    if (Math.abs(intrinsicDelta) > 0.05) {
      if (intrinsicDelta > 0) {
        insights.push(`Semantic chunks are better-formed (${pct(Math.abs(intrinsicDelta))} better coherence).`);
      } else {
        insights.push(`Fixed-size chunks are better-formed (${pct(Math.abs(intrinsicDelta))} better coherence).`);
      }
    }

    for (const insight of insights) {
      console.log(`│ ${insight.padEnd(60)} │`);
    }
    
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printRecommendations(report: EvalReport): void {
    const m = report.retrievalMetrics;
    const i = report.intrinsicMetrics;
    const p = report.preservation;
    const recommendations: string[] = [];

    if (m.hitRateAt1 < 0.7) {
      recommendations.push('• Consider adjusting chunk size or overlap to improve first-result accuracy');
    }

    if (m.mrr < 0.6) {
      recommendations.push('• Review chunk boundaries to ensure related content stays together');
    }

    if (i.avgConceptUnity / 5 < 0.7) {
      recommendations.push('• Chunks may be too large or mixing topics; try smaller, more focused chunks');
    }

    if (i.cleanBoundaryRate < 0.7) {
      recommendations.push('• Improve boundary detection to avoid splitting sentences or concepts');
    }

    if (p.preservationScore < 0.9) {
      recommendations.push('• Some facts may be fragmented; review missing facts and adjust chunking strategy');
    }

    if (recommendations.length === 0) {
      recommendations.push('• Your chunking strategy is performing well. No immediate changes needed.');
    }

    if (recommendations.length > 0) {
      console.log('\n' + fmt('bold', '┌─ RECOMMENDATIONS ────────────────────────────────────────────┐'));
      for (const rec of recommendations) {
        console.log(`│ ${rec.padEnd(60)} │`);
      }
      console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
    }
  }

  private printRecommendationsComparison(comparison: ComparisonReport): void {
    const winner = comparison.comparison.winner;
    const recommendations: string[] = [];

    if (winner === 'semantic') {
      recommendations.push('• Use semantic chunking for this document type');
      recommendations.push('• Semantic chunking better preserves topic coherence and improves search accuracy');
    } else if (winner === 'fixed') {
      recommendations.push('• Fixed-size chunking may be simpler and sufficient for this document');
      recommendations.push('• Consider if the performance difference justifies the added complexity');
    } else {
      recommendations.push('• Both strategies work well; choose based on implementation complexity');
    }

    const retrievalDelta = comparison.comparison.retrievalDelta;
    if (Math.abs(retrievalDelta) > 0.1) {
      if (retrievalDelta > 0) {
        recommendations.push('• Semantic chunking significantly improves search accuracy');
      } else {
        recommendations.push('• Fixed-size chunking provides better search accuracy for this document');
      }
    }

    console.log('\n' + fmt('bold', '┌─ RECOMMENDATIONS ────────────────────────────────────────────┐'));
    for (const rec of recommendations) {
      console.log(`│ ${rec.padEnd(60)} │`);
    }
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printMetricSection(title: string, description: string, metrics: MetricDisplay[]): void {
    console.log('\n' + fmt('bold', `┌─ ${title} ─────────────────────────────────────────────┐`));
    console.log(fmt('dim', `│ ${description.padEnd(60)} │`));
    console.log(fmt('bold', '├──────────────────────────────────────────────────────────────┤'));
    
    for (const metric of metrics) {
      const bar = this.scoreBar(this.scoreFromInterpretation(metric.interpretation));
      const badge = this.getBadge(metric.interpretation);
      const label = metric.label.padEnd(22);
      const value = metric.value.padEnd(25);
      console.log(`│ ${label} ${value} ${bar.padEnd(20)} ${badge} │`);
      console.log(fmt('dim', `│   ${metric.description.padEnd(58)} │`));
    }
    
    console.log(fmt('bold', '└──────────────────────────────────────────────────────────────┘'));
  }

  private printComparisonRow(label: string, semantic: string, fixed: string, delta: number, highlight = false): void {
    const deltaStr = delta >= 0 ? `+${(delta * 100).toFixed(1)}%` : `${(delta * 100).toFixed(1)}%`;
    const deltaColor = delta > 0.02 ? 'green' : delta < -0.02 ? 'red' : 'dim';
    const labelFmt = highlight ? fmt('bold', label.padEnd(20)) : label.padEnd(20);

    console.log(`│ ${labelFmt} │ ${semantic.padStart(9)} │ ${fixed.padStart(9)} │ ${fmt(deltaColor, deltaStr.padStart(6))} │`);
  }

  private interpretScore(score: number): Interpretation {
    if (score >= 0.8) return 'Excellent';
    if (score >= 0.6) return 'Good';
    return 'Needs Work';
  }

  private scoreFromInterpretation(interpretation: Interpretation): number {
    switch (interpretation) {
      case 'Excellent': return 0.85;
      case 'Good': return 0.7;
      case 'Needs Work': return 0.5;
    }
  }

  private getBadge(interpretation: Interpretation): string {
    switch (interpretation) {
      case 'Excellent':
        return fmt('green', '[Excellent]');
      case 'Good':
        return fmt('yellow', '[Good]');
      case 'Needs Work':
        return fmt('red', '[Needs Work]');
    }
  }

  private scoreBar(score: number): string {
    const filled = Math.round(score * 10);
    const empty = 10 - filled;
    const color = score >= 0.8 ? 'green' : score >= 0.6 ? 'yellow' : 'red';
    return fmt(color, '█'.repeat(filled)) + fmt('dim', '░'.repeat(empty));
  }

  private getDocumentName(documentId: string): string {
    if (documentId.length > 55) {
      return documentId.substring(0, 52) + '...';
    }
    return documentId;
  }
}
