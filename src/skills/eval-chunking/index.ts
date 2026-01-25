import { createVectorStore } from '../../services/vector/VectorStoreFactory.js';
import type { VectorStore } from '../../services/vector/VectorStore.interface.js';
import { logger } from '../../utils/logger.js';
import { EvalChunkingDB } from './schema.js';
import { GoldenQuestionGenerator } from './generators/GoldenQuestionGenerator.js';
import { FixedSizeChunker } from './chunkers/FixedSizeChunker.js';
import { RetrievalEvaluator } from './evaluators/RetrievalEvaluator.js';
import { IntrinsicEvaluator } from './evaluators/IntrinsicEvaluator.js';
import { PreservationEvaluator } from './evaluators/PreservationEvaluator.js';
import { MetricsCalculator } from './scoring/MetricsCalculator.js';
import { ConsoleReporter } from './reporters/ConsoleReporter.js';
import { JsonReporter } from './reporters/JsonReporter.js';
import { ProgressReporter } from './reporters/ProgressReporter.js';
import {
  type EvalReport,
  type ComparisonReport,
  type GoldenQuestion,
  type EvalConfig,
  DEFAULT_EVAL_CONFIG,
  type ChunkerType,
} from './types.js';

export interface EvalOptions {
  documentId: string;
  content: string;
  documentType: string;
  config?: Partial<EvalConfig>;
  generateOnly?: boolean;
  questionsPath?: string;
  format?: 'table' | 'json';
  skipFixed?: boolean;
  progressReporter?: ProgressReporter;
}

export class ChunkingEvaluator {
  private db: EvalChunkingDB;
  private vectorStore: VectorStore;
  private questionGenerator: GoldenQuestionGenerator;
  private retrievalEvaluator: RetrievalEvaluator;
  private intrinsicEvaluator: IntrinsicEvaluator;
  private preservationEvaluator: PreservationEvaluator;
  private metricsCalculator: MetricsCalculator;
  private consoleReporter: ConsoleReporter;
  private jsonReporter: JsonReporter;
  private config: EvalConfig;

  constructor(dbPath: string = './data/eval-chunking.db', config?: Partial<EvalConfig>) {
    this.db = new EvalChunkingDB(dbPath);
    this.vectorStore = createVectorStore();
    this.questionGenerator = new GoldenQuestionGenerator();
    this.retrievalEvaluator = new RetrievalEvaluator(this.vectorStore);
    this.intrinsicEvaluator = new IntrinsicEvaluator();
    this.preservationEvaluator = new PreservationEvaluator();
    this.config = { ...DEFAULT_EVAL_CONFIG, ...config };
    this.metricsCalculator = new MetricsCalculator(this.config);
    this.consoleReporter = new ConsoleReporter();
    this.jsonReporter = new JsonReporter();
  }

  async initialize(): Promise<void> {
    await this.vectorStore.connect();
    logger.info('ChunkingEvaluator initialized');
  }

  async evaluate(options: EvalOptions): Promise<ComparisonReport | EvalReport> {
    const { documentId, content, documentType, generateOnly, skipFixed, format, progressReporter } = options;
    const config = { ...this.config, ...options.config };

    let questions = this.db.getGoldenQuestionsByDocument(documentId);
    const totalSteps = generateOnly ? 1 : skipFixed ? 2 : 3;
    let currentStep = 0;

    if (questions.length === 0 || generateOnly) {
      currentStep++;
      progressReporter?.step({
        current: currentStep,
        total: totalSteps,
        message: `Generating ${config.questionCount} golden questions...`,
      });

      logger.info({ documentId }, 'Generating new golden questions');
      const generated = await this.questionGenerator.generate(
        documentId,
        content,
        documentType,
        config.questionCount
      );
      this.db.deleteGoldenQuestionsByDocument(documentId);
      this.db.saveGoldenQuestions(generated);
      questions = this.db.getGoldenQuestionsByDocument(documentId);

      progressReporter?.complete(`Generated ${questions.length} golden questions`);

      if (generateOnly) {
        return this.buildEmptyReport(documentId, 'semantic', questions);
      }
    }

    logger.info({ documentId, questionCount: questions.length }, 'Running evaluation');

    currentStep++;
    progressReporter?.step({
      current: currentStep,
      total: totalSteps,
      message: 'Evaluating semantic chunking...',
    });

    const semanticReport = await this.evaluateChunker(
      documentId,
      content,
      questions,
      'semantic',
      config,
      progressReporter
    );

    progressReporter?.complete('Semantic chunking evaluation complete');

    if (skipFixed) {
      if (format === 'json') {
        console.log(this.jsonReporter.formatReport(semanticReport));
      } else {
        this.consoleReporter.printReport(semanticReport);
      }
      return semanticReport;
    }

    currentStep++;
    progressReporter?.step({
      current: currentStep,
      total: totalSteps,
      message: 'Evaluating fixed-size baseline...',
    });

    const fixedReport = await this.evaluateChunker(
      documentId,
      content,
      questions,
      'fixed',
      config,
      progressReporter
    );

    progressReporter?.complete('Fixed-size chunking evaluation complete');

    progressReporter?.step({
      current: totalSteps,
      total: totalSteps,
      message: 'Calculating final scores and generating report...',
    });

    const comparison = this.buildComparison(documentId, semanticReport, fixedReport);

    progressReporter?.complete('Evaluation complete');

    if (format === 'json') {
      console.log(this.jsonReporter.formatComparison(comparison));
    } else {
      this.consoleReporter.printComparison(comparison);
    }

    return comparison;
  }

  private async evaluateChunker(
    documentId: string,
    content: string,
    questions: GoldenQuestion[],
    chunkerType: ChunkerType,
    config: EvalConfig,
    progressReporter?: ProgressReporter
  ): Promise<EvalReport> {
    logger.info({ documentId, chunkerType }, `Evaluating ${chunkerType} chunker`);

    let retrievalResults;
    let chunkTexts: string[];
    let chunkEvaluations;

    if (chunkerType === 'semantic') {
      retrievalResults = await this.retrievalEvaluator.evaluateSemanticChunks(
        documentId,
        questions,
        config.topK,
        content
      );

      const chunks: Array<{ id: string; text: string; tokens: number; index: number; semanticType?: string }> = [];
      await this.vectorStore.scrollAll(chunk => {
        if (chunk.payload.documentId === documentId) {
          chunks.push({
            id: chunk.id,
            text: chunk.payload.chunkText,
            tokens: (chunk.payload.metadata?.tokens as number) || 0,
            index: chunk.payload.chunkIndex,
            semanticType: chunk.payload.metadata?.semanticType as string,
          });
        }
      });

      chunkTexts = chunks.map(c => c.text);
      chunkEvaluations = await this.intrinsicEvaluator.evaluate(chunks);
    } else {
      const fixedChunker = new FixedSizeChunker(config.fixedChunkSize, config.fixedChunkOverlap);
      const fixedChunks = fixedChunker.chunk(content);

      retrievalResults = await this.retrievalEvaluator.evaluateFixedChunks(
        questions,
        fixedChunks,
        config.topK
      );

      chunkTexts = fixedChunks.map(c => c.text);
      chunkEvaluations = await this.intrinsicEvaluator.evaluate(
        fixedChunks.map(c => ({
          id: c.id,
          text: c.text,
          tokens: c.tokens,
          index: c.index,
        }))
      );

      fixedChunker.dispose();
    }
    const retrievalMetrics = this.metricsCalculator.calculateRetrievalMetrics(retrievalResults);
    const intrinsicMetrics = this.metricsCalculator.calculateIntrinsicMetrics(chunkEvaluations);
    const preservation = await this.preservationEvaluator.evaluate(content, chunkTexts);
    const overallScore = this.metricsCalculator.calculateOverallScore(
      retrievalMetrics,
      intrinsicMetrics,
      preservation
    );

    const report: EvalReport = {
      documentId,
      chunkerType,
      timestamp: new Date().toISOString(),
      goldenQuestions: questions,
      retrievalResults,
      retrievalMetrics,
      chunkEvaluations,
      intrinsicMetrics,
      preservation,
      overallScore,
    };

    this.db.saveEvalRun(
      documentId,
      chunkerType,
      {
        retrievalHitRate1: retrievalMetrics.hitRateAt1,
        retrievalHitRate3: retrievalMetrics.hitRateAt3,
        retrievalHitRate5: retrievalMetrics.hitRateAt5,
        retrievalMrr: retrievalMetrics.mrr,
        retrievalIou: retrievalMetrics.avgTokenIoU,
        intrinsicConceptUnity: intrinsicMetrics.avgConceptUnity,
        intrinsicBoundaryRate: intrinsicMetrics.cleanBoundaryRate,
        intrinsicStandalone: intrinsicMetrics.avgStandaloneScore,
        preservationScore: preservation.preservationScore,
        overallScore,
      },
      JSON.stringify(report)
    );

    return report;
  }

  private buildComparison(
    documentId: string,
    semantic: EvalReport,
    fixed: EvalReport
  ): ComparisonReport {
    const retrievalDelta = this.metricsCalculator.calculateDelta(
      semantic.retrievalMetrics.mrr,
      fixed.retrievalMetrics.mrr
    );
    const intrinsicDelta = this.metricsCalculator.calculateDelta(
      semantic.intrinsicMetrics.avgConceptUnity / 5,
      fixed.intrinsicMetrics.avgConceptUnity / 5
    );
    const preservationDelta = this.metricsCalculator.calculateDelta(
      semantic.preservation.preservationScore,
      fixed.preservation.preservationScore
    );
    const overallDelta = this.metricsCalculator.calculateDelta(
      semantic.overallScore,
      fixed.overallScore
    );

    return {
      documentId,
      timestamp: new Date().toISOString(),
      semantic,
      fixed,
      comparison: {
        retrievalDelta,
        intrinsicDelta,
        preservationDelta,
        overallDelta,
        winner: this.metricsCalculator.determineWinner(semantic.overallScore, fixed.overallScore),
      },
    };
  }

  private buildEmptyReport(
    documentId: string,
    chunkerType: ChunkerType,
    questions: GoldenQuestion[]
  ): EvalReport {
    return {
      documentId,
      chunkerType,
      timestamp: new Date().toISOString(),
      goldenQuestions: questions,
      retrievalResults: [],
      retrievalMetrics: {
        hitRateAt1: 0,
        hitRateAt3: 0,
        hitRateAt5: 0,
        mrr: 0,
        avgTokenIoU: 0,
        totalQuestions: questions.length,
      },
      chunkEvaluations: [],
      intrinsicMetrics: {
        avgConceptUnity: 0,
        cleanBoundaryRate: 0,
        avgStandaloneScore: 0,
        totalChunks: 0,
      },
      preservation: {
        totalFacts: 0,
        factsFound: 0,
        missingFacts: [],
        preservationScore: 0,
      },
      overallScore: 0,
    };
  }

  async close(): Promise<void> {
    await this.vectorStore.disconnect();
    this.db.close();
  }
}

export * from './types.js';
