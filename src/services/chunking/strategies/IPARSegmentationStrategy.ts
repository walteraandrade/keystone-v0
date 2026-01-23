import type { SemanticSegment, SegmentationOptions } from '../types.js';
import type { SemanticSegmentationStrategy } from './SemanticSegmentationStrategy.js';
import { logger } from '../../../utils/logger.js';

const HAZARD_KEYWORDS = [
  'ruído', 'vibração', 'queda', 'atropelamento', 'aprisionamento',
  'projeção', 'queimadura', 'choque', 'esmagamento', 'exposição',
  'inalação', 'contato', 'corte', 'perfuração', 'explosão',
  'incêndio', 'intoxicação', 'radiação', 'ergonômico', 'ergonomico',
  'temperatura', 'pressão', 'elétrico', 'eletrico', 'químico', 'quimico',
  'biológico', 'biologico', 'mecânico', 'mecanico', 'físico', 'fisico',
];

const CLASSIFICATION_KEYWORDS = ['intolerável', 'intoleravel', 'moderado', 'trivial', 'tolerável', 'toleravel'];

interface HeaderInfo {
  process: string;
  unit: string;
  code: string;
  elaborator: string;
  rawText: string;
}

interface HazardBlock {
  text: string;
  startLine: number;
  endLine: number;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export class IPARSegmentationStrategy implements SemanticSegmentationStrategy {
  async segment(content: string, _options?: SegmentationOptions): Promise<SemanticSegment[]> {
    const segments: SemanticSegment[] = [];

    const { header, headerSegment, bodyContent, bodyStartLine } = this.extractHeader(content);
    if (headerSegment) {
      segments.push(headerSegment);
    }

    const hazardBlocks = this.splitIntoHazardBlocks(bodyContent, bodyStartLine);
    logger.debug({ blockCount: hazardBlocks.length }, 'IPAR hazard blocks detected');

    if (hazardBlocks.length === 0) {
      logger.warn('No hazard blocks detected, using fallback segmentation');
      segments.push(...this.fallbackSegmentation(bodyContent, header));
      return segments;
    }

    for (const block of hazardBlocks) {
      const segment = this.createHazardSegment(block, header);
      if (segment) {
        segments.push(segment);
      }
    }

    logger.debug({ segmentCount: segments.length }, 'IPAR hazard-block segmentation complete');
    return segments;
  }

  private extractHeader(content: string): { header: HeaderInfo; headerSegment: SemanticSegment | null; bodyContent: string; bodyStartLine: number } {
    const defaultHeader: HeaderInfo = {
      process: 'Desconhecido',
      unit: 'Desconhecida',
      code: '',
      elaborator: '',
      rawText: '',
    };

    const headerPatterns = {
      process: /(?:processo|process)[:\s]*([^\n]+)/i,
      unit: /(?:unidade|unit)[:\s]*([^\n]+)/i,
      code: /(?:código|codigo|code)[:\s]*([^\n]+)/i,
      elaborator: /(?:elaborador|elaborado por|autor|author)[:\s]*([^\n]+)/i,
    };

    const lines = content.split('\n');
    let headerEndIndex = 0;
    const headerLines: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i];
      headerLines.push(line);

      const processMatch = line.match(headerPatterns.process);
      if (processMatch) defaultHeader.process = processMatch[1].trim();

      const unitMatch = line.match(headerPatterns.unit);
      if (unitMatch) defaultHeader.unit = unitMatch[1].trim();

      const codeMatch = line.match(headerPatterns.code);
      if (codeMatch) defaultHeader.code = codeMatch[1].trim();

      const elaboratorMatch = line.match(headerPatterns.elaborator);
      if (elaboratorMatch) defaultHeader.elaborator = elaboratorMatch[1].trim();

      if (this.isHazardBoundary(line) && i > 5) {
        headerEndIndex = i;
        break;
      }

      if (i === Math.min(lines.length - 1, 29)) {
        headerEndIndex = i + 1;
      }
    }

    defaultHeader.rawText = headerLines.slice(0, headerEndIndex).join('\n');

    const headerSegment: SemanticSegment | null = defaultHeader.rawText.trim().length > 50
      ? {
          text: defaultHeader.rawText.trim(),
          semanticType: 'ipar_audit_header',
          context: `IPAR: ${defaultHeader.process}`,
          sourceReference: {
            section: 'Cabeçalho',
            lineRange: [1, headerEndIndex],
          },
        }
      : null;

    const bodyContent = lines.slice(headerEndIndex).join('\n');
    const bodyStartLine = headerEndIndex + 1;

    return { header: defaultHeader, headerSegment, bodyContent, bodyStartLine };
  }

  private splitIntoHazardBlocks(content: string, startLineOffset: number): HazardBlock[] {
    const lines = content.split('\n');
    const blocks: HazardBlock[] = [];
    let currentBlock: string[] = [];
    let blockStartLine = startLineOffset;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isHazardStart = this.isHazardBoundary(line);

      if (isHazardStart && currentBlock.length > 3) {
        const blockText = currentBlock.join('\n').trim();
        if (blockText.length > 50) {
          blocks.push({
            text: blockText,
            startLine: blockStartLine,
            endLine: startLineOffset + i - 1,
          });
        }
        currentBlock = [];
        blockStartLine = startLineOffset + i;
      }

      currentBlock.push(line);
    }

    if (currentBlock.length > 0) {
      const blockText = currentBlock.join('\n').trim();
      if (blockText.length > 50) {
        blocks.push({
          text: blockText,
          startLine: blockStartLine,
          endLine: startLineOffset + lines.length - 1,
        });
      }
    }

    return blocks;
  }

  private isHazardBoundary(line: string): boolean {
    const lower = line.toLowerCase().trim();
    if (lower.length < 3) return false;

    const numberedItemPattern = /^(?:item\s*:?\s*)?\d+[\s.:]+\w+/i;
    if (numberedItemPattern.test(lower)) {
      return true;
    }

    for (const kw of HAZARD_KEYWORDS) {
      const idx = lower.indexOf(kw);
      if (idx >= 0 && idx < 40) {
        return true;
      }
    }

    return false;
  }

  private createHazardSegment(block: HazardBlock, header: HeaderInfo): SemanticSegment | null {
    const hazardType = this.detectHazardType(block.text);
    const classification = this.detectClassification(block.text);

    const contextParts = [`Processo: ${header.process}`, `Unidade: ${header.unit}`];
    const enrichedText = [
      contextParts.join(' | '),
      `Perigo: ${hazardType}${classification ? ` | Classificação: ${classification}` : ''}`,
      '',
      block.text,
    ].join('\n');

    if (estimateTokens(enrichedText) < 20) {
      return null;
    }

    return {
      text: enrichedText,
      semanticType: 'ipar_hazard_block',
      context: `Perigo: ${hazardType}${classification ? ` (${classification})` : ''}`,
      sourceReference: {
        section: header.process,
        lineRange: [block.startLine, block.endLine],
      },
    };
  }

  private detectHazardType(block: string): string {
    const lower = block.toLowerCase();

    for (const kw of HAZARD_KEYWORDS) {
      if (lower.includes(kw)) {
        return kw.charAt(0).toUpperCase() + kw.slice(1);
      }
    }

    return 'Não identificado';
  }

  private detectClassification(block: string): string | null {
    const lower = block.toLowerCase();

    for (const kw of CLASSIFICATION_KEYWORDS) {
      if (lower.includes(kw)) {
        return kw.charAt(0).toUpperCase() + kw.slice(1);
      }
    }

    return null;
  }

  private fallbackSegmentation(content: string, header: HeaderInfo): SemanticSegment[] {
    const paragraphs = content.split(/\n\n+/);
    return paragraphs
      .filter(p => p.trim().length > 50)
      .map((para, idx) => ({
        text: `Processo: ${header.process} | Unidade: ${header.unit}\n\n${para.trim()}`,
        semanticType: 'ipar_paragraph',
        context: `Parágrafo ${idx + 1}`,
        sourceReference: {
          section: header.process,
          lineRange: [idx * 5, idx * 5 + para.split('\n').length],
        },
      }));
  }
}
