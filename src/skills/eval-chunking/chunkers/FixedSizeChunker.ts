import { get_encoding, type Tiktoken } from 'tiktoken';
import { logger } from '../../../utils/logger.js';
import { generateId } from '../../../utils/uuid.js';

export interface FixedChunk {
  id: string;
  text: string;
  tokens: number;
  index: number;
  lineRange: [number, number];
  charRange: [number, number];
}

export class FixedSizeChunker {
  private encoder: Tiktoken;
  private maxTokens: number;
  private overlapTokens: number;

  constructor(maxTokens = 512, overlapTokens = 50) {
    this.encoder = get_encoding('cl100k_base');
    this.maxTokens = maxTokens;
    this.overlapTokens = overlapTokens;
  }

  chunk(content: string): FixedChunk[] {
    const lines = content.split('\n');
    const chunks: FixedChunk[] = [];

    let currentChunkLines: string[] = [];
    let currentTokens = 0;
    let chunkStartLine = 0;
    let chunkStartChar = 0;
    let currentCharPos = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineTokens = this.countTokens(line + '\n');

      if (currentTokens + lineTokens > this.maxTokens && currentChunkLines.length > 0) {
        const chunkText = currentChunkLines.join('\n');
        chunks.push({
          id: generateId('fc'),
          text: chunkText,
          tokens: this.countTokens(chunkText),
          index: chunks.length,
          lineRange: [chunkStartLine + 1, lineIdx],
          charRange: [chunkStartChar, currentCharPos - 1],
        });

        const overlapLines = this.getOverlapLines(currentChunkLines);
        const overlapTokenCount = this.countTokens(overlapLines.join('\n'));

        currentChunkLines = overlapLines;
        currentTokens = overlapTokenCount;
        chunkStartLine = lineIdx - overlapLines.length;
        chunkStartChar = currentCharPos - overlapLines.join('\n').length - overlapLines.length;
      }

      currentChunkLines.push(line);
      currentTokens += lineTokens;
      currentCharPos += line.length + 1;
    }

    if (currentChunkLines.length > 0) {
      const chunkText = currentChunkLines.join('\n');
      chunks.push({
        id: generateId('fc'),
        text: chunkText,
        tokens: this.countTokens(chunkText),
        index: chunks.length,
        lineRange: [chunkStartLine + 1, lines.length],
        charRange: [chunkStartChar, content.length],
      });
    }

    logger.debug(
      { chunkCount: chunks.length, maxTokens: this.maxTokens, overlapTokens: this.overlapTokens },
      'Fixed-size chunking complete'
    );

    return chunks;
  }

  private getOverlapLines(lines: string[]): string[] {
    if (this.overlapTokens === 0) return [];

    const overlapLines: string[] = [];
    let tokens = 0;

    for (let i = lines.length - 1; i >= 0 && tokens < this.overlapTokens; i--) {
      const lineTokens = this.countTokens(lines[i]);
      if (tokens + lineTokens <= this.overlapTokens) {
        overlapLines.unshift(lines[i]);
        tokens += lineTokens;
      } else {
        break;
      }
    }

    return overlapLines;
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  dispose(): void {
    this.encoder.free();
  }
}
