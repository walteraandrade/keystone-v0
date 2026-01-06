import { logger } from '../../utils/logger.js';

export interface TextChunk {
  text: string;
  index: number;
  metadata: {
    startChar: number;
    endChar: number;
  };
}

export class ChunkingService {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize = 512, chunkOverlap = 50) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  chunkText(text: string): TextChunk[] {
    const chunks: TextChunk[] = [];

    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let currentStartChar = 0;
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) continue;

      if (currentChunk.length + trimmedParagraph.length > this.chunkSize && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
          metadata: {
            startChar: currentStartChar,
            endChar: currentStartChar + currentChunk.length,
          },
        });

        const overlapText = this.getOverlapText(currentChunk);
        currentStartChar += currentChunk.length - overlapText.length;
        currentChunk = overlapText + ' ' + trimmedParagraph;
      } else {
        if (currentChunk) {
          currentChunk += '\n\n' + trimmedParagraph;
        } else {
          currentChunk = trimmedParagraph;
          currentStartChar = text.indexOf(trimmedParagraph);
        }
      }

      if (currentChunk.length >= this.chunkSize) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
          metadata: {
            startChar: currentStartChar,
            endChar: currentStartChar + currentChunk.length,
          },
        });
        currentChunk = '';
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex,
        metadata: {
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.length,
        },
      });
    }

    logger.debug(
      { totalChunks: chunks.length, avgChunkSize: Math.round(text.length / chunks.length) },
      'Chunked text'
    );

    return chunks;
  }

  private getOverlapText(text: string): string {
    if (text.length <= this.chunkOverlap) return text;

    const overlapStart = text.length - this.chunkOverlap;
    const sentenceEnd = text.lastIndexOf('.', overlapStart);

    if (sentenceEnd > text.length - this.chunkOverlap * 2) {
      return text.substring(sentenceEnd + 1).trim();
    }

    return text.substring(overlapStart).trim();
  }
}
