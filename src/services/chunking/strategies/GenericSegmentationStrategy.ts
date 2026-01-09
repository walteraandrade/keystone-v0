import type { SemanticSegment } from '../types.js';
import type { SemanticSegmentationStrategy } from './SemanticSegmentationStrategy.js';

export class GenericSegmentationStrategy implements SemanticSegmentationStrategy {
  segment(content: string): SemanticSegment[] {
    const sections = this.detectSections(content);

    if (sections.length > 1) {
      return this.segmentBySections(sections);
    }

    return this.segmentByParagraphs(content, 'Document');
  }

  private detectSections(content: string): Array<{ heading: string; content: string; start: number }> {
    const sections: Array<{ heading: string; content: string; start: number }> = [];

    const markdownHeadings = content.match(/^#{1,6}\s+.+$/gm);
    const underlineHeadings = content.match(/^.+\n[=\-]{3,}$/gm);

    if (!markdownHeadings && !underlineHeadings) {
      return [];
    }

    const headingPattern = /^(#{1,6}\s+.+|.+\n[=\-]{3,})$/gm;
    let match;
    const headings: Array<{ heading: string; position: number }> = [];

    while ((match = headingPattern.exec(content)) !== null) {
      const headingText = match[0].includes('\n')
        ? match[0].split('\n')[0].trim()
        : match[0].replace(/^#+\s*/, '').trim();

      headings.push({
        heading: headingText,
        position: match.index,
      });
    }

    for (let i = 0; i < headings.length; i++) {
      const current = headings[i];
      const next = headings[i + 1];

      const sectionContent = content.substring(
        current.position,
        next ? next.position : content.length
      );

      sections.push({
        heading: current.heading,
        content: sectionContent.trim(),
        start: current.position,
      });
    }

    return sections;
  }

  private segmentBySections(sections: Array<{ heading: string; content: string; start: number }>): SemanticSegment[] {
    const segments: SemanticSegment[] = [];

    for (const section of sections) {
      const paragraphSegments = this.segmentByParagraphs(section.content, section.heading);
      segments.push(...paragraphSegments);
    }

    return segments;
  }

  private segmentByParagraphs(content: string, sectionHeading: string): SemanticSegment[] {
    const paragraphs = content.split(/\n\n+/);
    const segments: SemanticSegment[] = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();

      if (para.length < 20) continue;

      if (this.isHeading(para)) continue;

      const lineNumber = this.getLineNumber(content, content.indexOf(para));

      segments.push({
        text: para,
        semanticType: 'paragraph',
        context: `Section: ${sectionHeading}`,
        sourceReference: {
          section: sectionHeading,
          lineRange: [lineNumber, lineNumber + para.split('\n').length],
        },
      });
    }

    return segments;
  }

  private isHeading(text: string): boolean {
    if (text.match(/^#{1,6}\s+/)) return true;
    if (text.includes('\n') && text.match(/\n[=\-]{3,}$/)) return true;
    return false;
  }

  private getLineNumber(content: string, position: number): number {
    return content.substring(0, position).split('\n').length;
  }
}
