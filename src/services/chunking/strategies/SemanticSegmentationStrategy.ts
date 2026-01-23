import type { SemanticSegment, SegmentationOptions } from '../types.js';

export interface SemanticSegmentationStrategy {
  segment(content: string, options?: SegmentationOptions): Promise<SemanticSegment[]>;
}
