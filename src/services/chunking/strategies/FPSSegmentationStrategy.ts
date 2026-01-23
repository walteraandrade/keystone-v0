import type { SemanticSegment, SegmentationOptions, PDFElement } from '../types.js';
import type { SemanticSegmentationStrategy } from './SemanticSegmentationStrategy.js';
import { logger } from '../../../utils/logger.js';

export class FPSSegmentationStrategy implements SemanticSegmentationStrategy {
  async segment(content: string, options?: SegmentationOptions): Promise<SemanticSegment[]> {
    if (options?.structuredElements?.length) {
      logger.debug({ elementCount: options.structuredElements.length }, 'Using structured PDF elements for FPS segmentation');
      return this.segmentFromStructured(options.structuredElements);
    }
    
    logger.debug('Falling back to text-based FPS segmentation');
    return this.segmentFromText(content);
  }

  private segmentFromStructured(elements: PDFElement[]): SemanticSegment[] {
    const segments: SemanticSegment[] = [];
    let currentSection: string | null = null;
    let currentContent: string[] = [];
    let currentPage = 1;

    const flushSection = () => {
      if (currentContent.length > 0) {
        const text = currentContent.join('\n\n');
        if (text.trim().length > 50) {
          segments.push({
            text,
            semanticType: this.detectSemanticType(currentSection || 'content'),
            context: currentSection || 'FPS Document',
            sourceReference: {
              section: currentSection || 'Body',
              page: currentPage,
            },
          });
        }
        currentContent = [];
      }
    };

    for (const element of elements) {
      if (element.type === 'Title') {
        flushSection();
        currentSection = element.text.trim();
        currentPage = element.page;
        currentContent.push(element.text);
      } else if (element.type === 'Table') {
        flushSection();
        segments.push({
          text: element.text,
          semanticType: 'fps_table',
          context: currentSection || 'Table',
          sourceReference: {
            section: currentSection || 'Table',
            page: element.page,
          },
        });
      } else {
        currentContent.push(element.text);
      }
    }

    flushSection();

    logger.debug({ segmentCount: segments.length }, 'FPS structured segmentation complete');
    return segments;
  }

  private segmentFromText(content: string): SemanticSegment[] {
    const segments: SemanticSegment[] = [];
    const lines = content.split('\n');
    
    let currentSection: { title: string; content: string[]; startLine: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (this.isSectionTitle(line)) {
        if (currentSection && currentSection.content.length > 0) {
          const text = currentSection.content.join('\n');
          if (text.trim().length > 50) {
            segments.push({
              text,
              semanticType: this.detectSemanticType(currentSection.title),
              context: currentSection.title,
              sourceReference: {
                section: currentSection.title,
                lineRange: [currentSection.startLine, i - 1],
              },
            });
          }
        }
        currentSection = { title: line, content: [line], startLine: i };
      } else if (currentSection) {
        currentSection.content.push(line);
      }
    }

    if (currentSection && currentSection.content.length > 0) {
      const text = currentSection.content.join('\n');
      if (text.trim().length > 50) {
        segments.push({
          text,
          semanticType: this.detectSemanticType(currentSection.title),
          context: currentSection.title,
          sourceReference: {
            section: currentSection.title,
            lineRange: [currentSection.startLine, lines.length - 1],
          },
        });
      }
    }

    if (segments.length === 0) {
      segments.push({
        text: content,
        semanticType: 'fps_document',
        context: 'FPS Document',
        sourceReference: {
          section: 'Full Document',
        },
      });
    }

    logger.debug({ segmentCount: segments.length }, 'FPS text-based segmentation complete');
    return segments;
  }

  private isSectionTitle(line: string): boolean {
    if (line.length < 3 || line.length > 100) return false;
    
    if (/^\d+\.?\s*[–\-:.]?\s*[A-ZÁÊÔÇ]/.test(line)) return true;
    
    const keywords = ['escopo', 'definições', 'procedimentos', 'responsabilidades', 'objetivo', 'anexo'];
    const lower = line.toLowerCase();
    for (const kw of keywords) {
      if (lower.startsWith(kw)) return true;
    }
    
    return false;
  }

  private detectSemanticType(sectionTitle: string): string {
    const lower = sectionTitle.toLowerCase();
    
    if (lower.includes('escopo')) return 'fps_scope';
    if (lower.includes('definição') || lower.includes('definicao')) return 'fps_definitions';
    if (lower.includes('procedimento')) return 'fps_procedures';
    if (lower.includes('responsabilidade')) return 'fps_responsibilities';
    if (lower.includes('objetivo')) return 'fps_objective';
    if (lower.includes('anexo') || lower.includes('apêndice')) return 'fps_appendix';
    
    return 'fps_section';
  }
}
