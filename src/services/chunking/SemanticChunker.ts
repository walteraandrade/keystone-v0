import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { DocumentType } from '../../domain/entities/Document.js';
import type { EmbeddingService } from '../vector/EmbeddingService.js';
import { TokenSplitter } from './TokenSplitter.js';
import type { TokenizedChunk, SegmentationOptions } from './types.js';
import type { SemanticSegmentationStrategy } from './strategies/SemanticSegmentationStrategy.js';
import { FMEASegmentationStrategy } from './strategies/FMEASegmentationStrategy.js';
import { IPARSegmentationStrategy } from './strategies/IPARSegmentationStrategy.js';
import { HIRASegmentationStrategy } from './strategies/HIRASegmentationStrategy.js';
import { AlertSegmentationStrategy } from './strategies/AlertSegmentationStrategy.js';
import { FPSSegmentationStrategy } from './strategies/FPSSegmentationStrategy.js';
import { GenericSegmentationStrategy } from './strategies/GenericSegmentationStrategy.js';

export class SemanticChunker {
  private strategies: Map<DocumentType, SemanticSegmentationStrategy>;
  private tokenSplitter: TokenSplitter;

  constructor(embeddingService?: EmbeddingService) {
    this.strategies = new Map<DocumentType, SemanticSegmentationStrategy>([
      ['fmea', new FMEASegmentationStrategy()],
      ['ipar', new IPARSegmentationStrategy()],
      ['hira', new HIRASegmentationStrategy()],
      ['alert', new AlertSegmentationStrategy()],
      ['fps', new FPSSegmentationStrategy()],
      ['generic', new GenericSegmentationStrategy()],
    ]);

    this.tokenSplitter = new TokenSplitter(
      config.chunking.maxTokens,
      config.chunking.overlapTokens
    );
  }

  async chunk(content: string, documentType: DocumentType, options?: SegmentationOptions): Promise<TokenizedChunk[]> {
    logger.debug({ documentType, hasStructuredElements: !!options?.structuredElements }, 'Starting semantic chunking');

    const strategy = this.strategies.get(documentType) || this.strategies.get('generic')!;
    const segments = await strategy.segment(content, options);

    logger.debug({ documentType, segmentCount: segments.length }, 'Phase 1: Semantic segmentation complete');

    const chunks: TokenizedChunk[] = [];

    for (let segmentIdx = 0; segmentIdx < segments.length; segmentIdx++) {
      const segment = segments[segmentIdx];
      const segmentChunks = this.tokenSplitter.split(segment, segmentIdx);

      for (let subIdx = 0; subIdx < segmentChunks.length; subIdx++) {
        chunks.push({
          ...segmentChunks[subIdx],
          index: segmentIdx * 1000 + subIdx,
        });
      }
    }

    const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);
    const avgTokens = chunks.length > 0 ? Math.round(totalTokens / chunks.length) : 0;
    const maxTokens = chunks.length > 0 ? Math.max(...chunks.map(c => c.tokens)) : 0;
    const oversizedCount = chunks.filter(c => c.metadata.isOversized).length;

    logger.info(
      {
        documentType,
        segmentCount: segments.length,
        chunkCount: chunks.length,
        avgTokens,
        maxTokens,
        oversizedCount,
      },
      'Phase 2: Token enforcement complete'
    );

    return chunks;
  }

  dispose(): void {
    this.tokenSplitter.dispose();
  }
}
