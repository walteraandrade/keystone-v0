import type { SemanticSegment, SegmentationOptions } from '../types.js';
import type { SemanticSegmentationStrategy } from './SemanticSegmentationStrategy.js';
import { logger } from '../../../utils/logger.js';

const ALERT_SECTION_KEYWORDS = [
  'description', 'descrição', 'descrição do evento',
  'root cause', 'causa raiz', 'causa principal',
  'contributing factors', 'fatores contribuintes',
  'corrective action', 'ação corretiva', 'medidas corretivas',
  'lesson learned', 'lição aprendida', 'aprendizado',
  'recommendation', 'recomendação', 'recomendações',
  'timeline', 'cronologia', 'sequência de eventos',
  'impact', 'impacto', 'consequências',
  'investigation', 'investigação', 'análise',
];

interface AlertHeader {
  alertNumber: string;
  title: string;
  date: string;
  location: string;
  severity: string;
  rawText: string;
}

interface AlertSection {
  title: string;
  text: string;
  startLine: number;
  endLine: number;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export class AlertSegmentationStrategy implements SemanticSegmentationStrategy {
  async segment(content: string, _options?: SegmentationOptions): Promise<SemanticSegment[]> {
    const segments: SemanticSegment[] = [];

    const { header, headerSegment, bodyContent, bodyStartLine } = this.extractHeader(content);
    if (headerSegment) {
      segments.push(headerSegment);
    }

    const sections = this.splitIntoSections(bodyContent, bodyStartLine);
    logger.debug({ sectionCount: sections.length }, 'Alert sections detected');

    if (sections.length === 0) {
      logger.warn('No sections detected, using fallback segmentation');
      segments.push(...this.fallbackSegmentation(bodyContent, header));
      return segments;
    }

    for (const section of sections) {
      const segment = this.createSectionSegment(section, header);
      if (segment) {
        segments.push(segment);
      }
    }

    logger.debug({ segmentCount: segments.length }, 'Alert segmentation complete');
    return segments;
  }

  private extractHeader(content: string): { header: AlertHeader; headerSegment: SemanticSegment | null; bodyContent: string; bodyStartLine: number } {
    const defaultHeader: AlertHeader = {
      alertNumber: '',
      title: 'Safety Alert',
      date: '',
      location: '',
      severity: '',
      rawText: '',
    };

    const headerPatterns = {
      alertNumber: /(?:alert|alerta|gppm|incident)[#:\s]*([A-Z0-9\-]+)/i,
      title: /(?:title|título|subject|assunto)[:\s]*([^\n]+)/i,
      date: /(?:date|data|occurred|ocorrido)[:\s]*([^\n]+)/i,
      location: /(?:location|local|site|unidade)[:\s]*([^\n]+)/i,
      severity: /(?:severity|gravidade|priority|prioridade)[:\s]*([^\n]+)/i,
    };

    const lines = content.split('\n');
    let headerEndIndex = 0;
    const headerLines: string[] = [];

    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      const line = lines[i];
      headerLines.push(line);

      const alertMatch = line.match(headerPatterns.alertNumber);
      if (alertMatch) defaultHeader.alertNumber = alertMatch[1].trim();

      const titleMatch = line.match(headerPatterns.title);
      if (titleMatch) defaultHeader.title = titleMatch[1].trim();

      const dateMatch = line.match(headerPatterns.date);
      if (dateMatch) defaultHeader.date = dateMatch[1].trim();

      const locationMatch = line.match(headerPatterns.location);
      if (locationMatch) defaultHeader.location = locationMatch[1].trim();

      const severityMatch = line.match(headerPatterns.severity);
      if (severityMatch) defaultHeader.severity = severityMatch[1].trim();

      if (this.isSectionBoundary(line) && i > 3) {
        headerEndIndex = i;
        break;
      }

      if (i === Math.min(lines.length - 1, 24)) {
        headerEndIndex = i + 1;
      }
    }

    defaultHeader.rawText = headerLines.slice(0, headerEndIndex).join('\n');

    const headerSegment: SemanticSegment | null = defaultHeader.rawText.trim().length > 30
      ? {
          text: defaultHeader.rawText.trim(),
          semanticType: 'alert_header',
          context: `Alert: ${defaultHeader.alertNumber || defaultHeader.title}`,
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

  private splitIntoSections(content: string, startLineOffset: number): AlertSection[] {
    const lines = content.split('\n');
    const sections: AlertSection[] = [];
    let currentSection: { title: string; lines: string[]; startLine: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionTitle = this.detectSectionTitle(line);

      if (sectionTitle) {
        if (currentSection && currentSection.lines.length > 0) {
          const text = currentSection.lines.join('\n').trim();
          if (text.length > 30) {
            sections.push({
              title: currentSection.title,
              text,
              startLine: currentSection.startLine,
              endLine: startLineOffset + i - 1,
            });
          }
        }
        currentSection = {
          title: sectionTitle,
          lines: [],
          startLine: startLineOffset + i,
        };
      } else if (currentSection) {
        currentSection.lines.push(line);
      } else {
        if (!currentSection) {
          currentSection = {
            title: 'Introduction',
            lines: [line],
            startLine: startLineOffset + i,
          };
        }
      }
    }

    if (currentSection && currentSection.lines.length > 0) {
      const text = currentSection.lines.join('\n').trim();
      if (text.length > 30) {
        sections.push({
          title: currentSection.title,
          text,
          startLine: currentSection.startLine,
          endLine: startLineOffset + lines.length - 1,
        });
      }
    }

    return sections;
  }

  private isSectionBoundary(line: string): boolean {
    return this.detectSectionTitle(line) !== null;
  }

  private detectSectionTitle(line: string): string | null {
    const lower = line.toLowerCase().trim();
    if (lower.length < 3 || lower.length > 100) return null;

    const headerPattern = /^(?:\d+[\.\)]\s*)?([A-Za-zÀ-ú\s]+)[:.\s]*$/;
    const match = line.match(headerPattern);

    if (match) {
      const potentialTitle = match[1].toLowerCase().trim();
      for (const kw of ALERT_SECTION_KEYWORDS) {
        if (potentialTitle.includes(kw)) {
          return match[1].trim();
        }
      }
    }

    for (const kw of ALERT_SECTION_KEYWORDS) {
      if (lower.startsWith(kw) && lower.length < 60) {
        return line.trim();
      }
    }

    return null;
  }

  private createSectionSegment(section: AlertSection, header: AlertHeader): SemanticSegment | null {
    const semanticTypeMap: Record<string, string> = {
      description: 'alert_description',
      'root cause': 'alert_root_cause',
      'causa raiz': 'alert_root_cause',
      'corrective action': 'alert_corrective_action',
      'ação corretiva': 'alert_corrective_action',
      'lesson learned': 'alert_lesson_learned',
      'lição aprendida': 'alert_lesson_learned',
      recommendation: 'alert_recommendation',
      recomendação: 'alert_recommendation',
    };

    const sectionLower = section.title.toLowerCase();
    let semanticType = 'alert_section';
    for (const [key, type] of Object.entries(semanticTypeMap)) {
      if (sectionLower.includes(key)) {
        semanticType = type;
        break;
      }
    }

    const contextParts = [];
    if (header.alertNumber) contextParts.push(`Alert: ${header.alertNumber}`);
    if (header.location) contextParts.push(`Location: ${header.location}`);

    const enrichedText = [
      contextParts.length > 0 ? contextParts.join(' | ') : `Alert: ${header.title}`,
      `Section: ${section.title}`,
      '',
      section.text,
    ].join('\n');

    if (estimateTokens(enrichedText) < 20) {
      return null;
    }

    return {
      text: enrichedText,
      semanticType,
      context: `${section.title}`,
      sourceReference: {
        section: section.title,
        lineRange: [section.startLine, section.endLine],
      },
    };
  }

  private fallbackSegmentation(content: string, header: AlertHeader): SemanticSegment[] {
    const paragraphs = content.split(/\n\n+/);
    return paragraphs
      .filter(p => p.trim().length > 50)
      .map((para, idx) => ({
        text: `Alert: ${header.alertNumber || header.title}\n\n${para.trim()}`,
        semanticType: 'alert_paragraph',
        context: `Paragraph ${idx + 1}`,
        sourceReference: {
          section: 'Content',
          lineRange: [idx * 5, idx * 5 + para.split('\n').length],
        },
      }));
  }
}
