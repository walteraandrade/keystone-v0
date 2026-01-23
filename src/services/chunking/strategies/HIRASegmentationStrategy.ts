import type { SemanticSegment, SegmentationOptions } from '../types.js';
import type { SemanticSegmentationStrategy } from './SemanticSegmentationStrategy.js';
import { logger } from '../../../utils/logger.js';

const HAZARD_KEYWORDS = [
  'hazard', 'risk', 'danger', 'harm', 'injury', 'fatality',
  'perigo', 'risco', 'lesão', 'acidente', 'fatalidade',
  'chemical', 'electrical', 'mechanical', 'biological', 'physical',
  'químico', 'elétrico', 'mecânico', 'biológico', 'físico',
  'fall', 'slip', 'trip', 'crush', 'burn', 'cut',
  'queda', 'escorregão', 'tropeço', 'esmagamento', 'queimadura', 'corte',
];

const SEVERITY_KEYWORDS = ['catastrophic', 'critical', 'major', 'minor', 'negligible', 'high', 'medium', 'low'];
const LIKELIHOOD_KEYWORDS = ['frequent', 'probable', 'occasional', 'remote', 'improbable', 'likely', 'unlikely'];

interface HeaderInfo {
  area: string;
  activity: string;
  assessor: string;
  date: string;
  rawText: string;
}

interface HazardBlock {
  text: string;
  startLine: number;
  endLine: number;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export class HIRASegmentationStrategy implements SemanticSegmentationStrategy {
  async segment(content: string, _options?: SegmentationOptions): Promise<SemanticSegment[]> {
    const segments: SemanticSegment[] = [];

    const { header, headerSegment, bodyContent, bodyStartLine } = this.extractHeader(content);
    if (headerSegment) {
      segments.push(headerSegment);
    }

    const hazardBlocks = this.splitIntoHazardBlocks(bodyContent, bodyStartLine);
    logger.debug({ blockCount: hazardBlocks.length }, 'HIRA hazard blocks detected');

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

    logger.debug({ segmentCount: segments.length }, 'HIRA segmentation complete');
    return segments;
  }

  private extractHeader(content: string): { header: HeaderInfo; headerSegment: SemanticSegment | null; bodyContent: string; bodyStartLine: number } {
    const defaultHeader: HeaderInfo = {
      area: 'Unknown',
      activity: 'Unknown',
      assessor: '',
      date: '',
      rawText: '',
    };

    const headerPatterns = {
      area: /(?:area|department|setor|área)[:\s]*([^\n]+)/i,
      activity: /(?:activity|task|atividade|tarefa)[:\s]*([^\n]+)/i,
      assessor: /(?:assessor|evaluator|avaliador|responsável)[:\s]*([^\n]+)/i,
      date: /(?:date|data)[:\s]*([^\n]+)/i,
    };

    const lines = content.split('\n');
    let headerEndIndex = 0;
    const headerLines: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const line = lines[i];
      headerLines.push(line);

      const areaMatch = line.match(headerPatterns.area);
      if (areaMatch) defaultHeader.area = areaMatch[1].trim();

      const activityMatch = line.match(headerPatterns.activity);
      if (activityMatch) defaultHeader.activity = activityMatch[1].trim();

      const assessorMatch = line.match(headerPatterns.assessor);
      if (assessorMatch) defaultHeader.assessor = assessorMatch[1].trim();

      const dateMatch = line.match(headerPatterns.date);
      if (dateMatch) defaultHeader.date = dateMatch[1].trim();

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
          semanticType: 'hira_header',
          context: `HIRA: ${defaultHeader.area} - ${defaultHeader.activity}`,
          sourceReference: {
            section: 'Header',
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
    const severity = this.detectRiskLevel(block.text, SEVERITY_KEYWORDS);
    const likelihood = this.detectRiskLevel(block.text, LIKELIHOOD_KEYWORDS);

    const contextParts = [`Area: ${header.area}`, `Activity: ${header.activity}`];
    const riskInfo = [severity, likelihood].filter(Boolean).join(' / ');
    const enrichedText = [
      contextParts.join(' | '),
      `Hazard: ${hazardType}${riskInfo ? ` | Risk: ${riskInfo}` : ''}`,
      '',
      block.text,
    ].join('\n');

    if (estimateTokens(enrichedText) < 20) {
      return null;
    }

    return {
      text: enrichedText,
      semanticType: 'hira_hazard_block',
      context: `Hazard: ${hazardType}${riskInfo ? ` (${riskInfo})` : ''}`,
      sourceReference: {
        section: header.activity,
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
    return 'Unidentified';
  }

  private detectRiskLevel(block: string, keywords: string[]): string | null {
    const lower = block.toLowerCase();
    for (const kw of keywords) {
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
        text: `Area: ${header.area} | Activity: ${header.activity}\n\n${para.trim()}`,
        semanticType: 'hira_paragraph',
        context: `Paragraph ${idx + 1}`,
        sourceReference: {
          section: header.activity,
          lineRange: [idx * 5, idx * 5 + para.split('\n').length],
        },
      }));
  }
}
