import type { SemanticSegment } from '../types.js';

export interface SemanticSegmentationStrategy {
  segment(content: string): SemanticSegment[];
}
