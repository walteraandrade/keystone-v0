import type { SemanticSegment } from '../types.js';
import type { SemanticSegmentationStrategy } from './SemanticSegmentationStrategy.js';

export class IPARSegmentationStrategy implements SemanticSegmentationStrategy {
  segment(content: string): SemanticSegment[] {
    const segments: SemanticSegment[] = [];

    const auditHeader = this.extractAuditHeader(content);
    if (auditHeader) {
      segments.push(auditHeader);
    }

    const findingBlocks = this.extractFindingBlocks(content);
    segments.push(...findingBlocks);

    const requirements = this.extractRequirements(content);
    segments.push(...requirements);

    if (segments.length === 0) {
      return this.fallbackSegmentation(content);
    }

    return segments;
  }

  private extractAuditHeader(content: string): SemanticSegment | null {
    const headerPatterns = [
      /(?:auditoria|audit|inspeção|inspection)[\s\S]{0,500}?(?:data|date|auditor|scope|escopo)/i,
      /^[\s\S]{0,500}?(?:data|date).*?(?:auditor|auditado|scope|escopo)/im,
    ];

    for (const pattern of headerPatterns) {
      const match = content.match(pattern);
      if (match) {
        const headerEnd = match.index! + match[0].length;
        const nextSectionStart = content.indexOf('\n\n', headerEnd);
        const headerText = content.substring(
          match.index!,
          nextSectionStart > 0 ? nextSectionStart : Math.min(headerEnd + 300, content.length)
        );

        return {
          text: headerText.trim(),
          semanticType: 'ipar_audit_header',
          context: 'Audit Header',
          sourceReference: {
            section: 'Audit Metadata',
            lineRange: [1, headerText.split('\n').length],
          },
        };
      }
    }

    return null;
  }

  private extractFindingBlocks(content: string): SemanticSegment[] {
    const segments: SemanticSegment[] = [];
    const findingPatterns = [
      /(?:finding|achado|constatação|nc|não conformidade)\s*[:#]?\s*([A-Z0-9-]+)/gi,
      /(?:f|nc|ac)-?\d{2,4}/gi,
    ];

    for (const pattern of findingPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const findingCode = match[1] || match[0];
        const startPos = match.index;

        const nextFindingMatch = content.substring(startPos + match[0].length).match(findingPatterns[0]);
        const endPos = nextFindingMatch
          ? startPos + match[0].length + nextFindingMatch.index!
          : content.indexOf('\n\n\n', startPos + match[0].length);

        const findingText = content.substring(
          startPos,
          endPos > startPos ? endPos : Math.min(startPos + 2000, content.length)
        ).trim();

        if (findingText.length > 50) {
          const lines = findingText.split('\n').length;
          segments.push({
            text: findingText,
            semanticType: 'ipar_finding',
            context: `Finding: ${findingCode}`,
            sourceReference: {
              section: `Finding: ${findingCode}`,
              lineRange: [this.getLineNumber(content, startPos), this.getLineNumber(content, startPos) + lines],
            },
          });
        }
      }
    }

    return segments;
  }

  private extractRequirements(content: string): SemanticSegment[] {
    const segments: SemanticSegment[] = [];
    const requirementPatterns = [
      /(?:requirement|requisito|norma|standard)\s*[:#]?\s*([A-Z0-9.-]+)/gi,
      /(?:ISO|ASME|API|ABNT)\s*\d+/gi,
    ];

    for (const pattern of requirementPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const reqCode = match[1] || match[0];
        const startPos = match.index;

        const contextStart = Math.max(0, startPos - 100);
        const contextEnd = Math.min(content.length, startPos + match[0].length + 400);
        const reqText = content.substring(contextStart, contextEnd).trim();

        if (reqText.length > 30) {
          const lines = reqText.split('\n').length;
          segments.push({
            text: reqText,
            semanticType: 'ipar_requirement',
            context: `Requirement: ${reqCode}`,
            sourceReference: {
              section: `Requirement: ${reqCode}`,
              lineRange: [this.getLineNumber(content, contextStart), this.getLineNumber(content, contextStart) + lines],
            },
          });
        }
      }
    }

    return segments;
  }

  private fallbackSegmentation(content: string): SemanticSegment[] {
    const paragraphs = content.split(/\n\n+/);
    return paragraphs
      .filter(p => p.trim().length > 50)
      .map((para, idx) => ({
        text: para.trim(),
        semanticType: 'ipar_paragraph',
        context: `Paragraph ${idx + 1}`,
        sourceReference: {
          section: 'IPAR Document',
          lineRange: [idx * 5, idx * 5 + para.split('\n').length],
        },
      }));
  }

  private getLineNumber(content: string, position: number): number {
    return content.substring(0, position).split('\n').length;
  }
}
