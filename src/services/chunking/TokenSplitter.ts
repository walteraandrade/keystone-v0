import { get_encoding, type Tiktoken } from 'tiktoken';
import { logger } from '../../utils/logger.js';
import type { SemanticSegment, TokenizedChunk } from './types.js';

export class TokenSplitter {
  private encoder: Tiktoken;
  private maxTokens: number;
  private overlapTokens: number;

  constructor(maxTokens = 8192, overlapTokens = 100) {
    this.encoder = get_encoding('cl100k_base');
    this.maxTokens = maxTokens;
    this.overlapTokens = overlapTokens;
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  split(segment: SemanticSegment, segmentIndex = 0): TokenizedChunk[] {
    if (!segment.text || segment.text.trim().length === 0) {
      logger.warn(
        { segmentType: segment.semanticType, context: segment.context },
        'Empty segment text, skipping'
      );
      return [];
    }

    const tokenCount = this.countTokens(segment.text);

    if (tokenCount <= this.maxTokens) {
      return [
        {
          text: segment.text,
          tokens: tokenCount,
          index: segmentIndex,
          semanticType: segment.semanticType,
          context: segment.context,
          metadata: {
            startChar: 0,
            endChar: segment.text.length,
            isOversized: false,
            splitDepth: 0,
          },
          sourceReference: segment.sourceReference,
        },
      ];
    }

    logger.warn(
      { segmentType: segment.semanticType, tokens: tokenCount, maxTokens: this.maxTokens },
      'Segment exceeds token limit, recursive splitting'
    );

    return this.recursiveSplit(segment, 0, segmentIndex);
  }

  private recursiveSplit(
    segment: SemanticSegment,
    depth: number,
    segmentIndex: number
  ): TokenizedChunk[] {
    if (depth > 5) {
      logger.error(
        { segmentType: segment.semanticType, depth },
        'Max split depth exceeded, forcing character split'
      );
    }

    const splitPoints = this.findSentenceBoundaries(segment.text);

    if (splitPoints.length > 1) {
      const subChunks: TokenizedChunk[] = [];
      let chunkIdx = 0;

      for (const point of splitPoints) {
        const subText = this.prependContext(point, segment.context);
        const subSegment: SemanticSegment = {
          text: subText,
          semanticType: segment.semanticType,
          context: segment.context,
          sourceReference: segment.sourceReference,
        };

        const tokenCount = this.countTokens(subText);

        if (tokenCount <= this.maxTokens) {
          subChunks.push({
            text: subText,
            tokens: tokenCount,
            index: segmentIndex * 1000 + chunkIdx++,
            semanticType: segment.semanticType,
            context: segment.context,
            metadata: {
              startChar: 0,
              endChar: subText.length,
              isOversized: true,
              splitDepth: depth + 1,
            },
            sourceReference: segment.sourceReference,
          });
        } else {
          const deeperChunks = this.recursiveSplit(subSegment, depth + 1, segmentIndex);
          subChunks.push(...deeperChunks);
          chunkIdx += deeperChunks.length;
        }
      }

      return subChunks;
    }

    return this.characterSplit(segment, depth, segmentIndex);
  }

  private findSentenceBoundaries(text: string): string[] {
    const sentences = text.split(/(?<=[.!?])\s+/);

    if (sentences.length <= 1) {
      return this.splitByLines(text);
    }

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.countTokens(sentence);

      if (currentTokens + sentenceTokens > this.maxTokens && currentChunk.length > 0) {
        chunks.push(this.applyOverlap(currentChunk.join(' '), chunks[chunks.length - 1]));
        currentChunk = [sentence];
        currentTokens = sentenceTokens;
      } else {
        currentChunk.push(sentence);
        currentTokens += sentenceTokens;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(this.applyOverlap(currentChunk.join(' '), chunks[chunks.length - 1]));
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private splitByLines(text: string): string[] {
    const lines = text.split(/\n+/);

    if (lines.length <= 1) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;

    for (const line of lines) {
      const lineTokens = this.countTokens(line);

      if (currentTokens + lineTokens > this.maxTokens && currentChunk.length > 0) {
        chunks.push(this.applyOverlap(currentChunk.join('\n'), chunks[chunks.length - 1]));
        currentChunk = [line];
        currentTokens = lineTokens;
      } else {
        currentChunk.push(line);
        currentTokens += lineTokens;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(this.applyOverlap(currentChunk.join('\n'), chunks[chunks.length - 1]));
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private characterSplit(
    segment: SemanticSegment,
    depth: number,
    segmentIndex: number
  ): TokenizedChunk[] {
    const chunks: TokenizedChunk[] = [];
    const text = segment.text;
    let startPos = 0;
    let chunkIdx = 0;

    while (startPos < text.length) {
      let endPos = Math.min(startPos + this.maxTokens * 4, text.length);
      let chunkText = text.substring(startPos, endPos);

      while (this.countTokens(chunkText) > this.maxTokens && endPos > startPos + 100) {
        endPos = Math.floor((startPos + endPos) / 2);
        chunkText = text.substring(startPos, endPos);
      }

      const finalText = this.prependContext(chunkText, segment.context);

      chunks.push({
        text: finalText,
        tokens: this.countTokens(finalText),
        index: segmentIndex * 1000 + chunkIdx++,
        semanticType: segment.semanticType,
        context: segment.context,
        metadata: {
          startChar: startPos,
          endChar: endPos,
          isOversized: true,
          splitDepth: depth + 1,
        },
        sourceReference: segment.sourceReference,
      });

      startPos = Math.max(startPos + 1, endPos - this.overlapTokens * 4);
    }

    return chunks;
  }

  private applyOverlap(currentChunk: string, previousChunk?: string): string {
    if (!previousChunk || this.overlapTokens === 0) {
      return currentChunk;
    }

    const sentences = previousChunk.split(/(?<=[.!?])\s+/);
    let overlapText = '';
    let overlapTokenCount = 0;

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      const tokens = this.countTokens(sentence);

      if (overlapTokenCount + tokens <= this.overlapTokens) {
        overlapText = sentence + ' ' + overlapText;
        overlapTokenCount += tokens;
      } else {
        break;
      }
    }

    return overlapText.trim() ? overlapText.trim() + ' ' + currentChunk : currentChunk;
  }

  private prependContext(text: string, context: string): string {
    return `[${context}]\n${text}`;
  }

  dispose(): void {
    this.encoder.free();
  }
}
