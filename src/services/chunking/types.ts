export interface PDFElement {
  type: 'Title' | 'NarrativeText' | 'ListItem' | 'Table';
  text: string;
  page: number;
  rows?: number;
  cols?: number;
}

export interface SegmentationOptions {
  structuredElements?: PDFElement[];
}

export interface SemanticSegment {
  text: string;
  semanticType: string;
  context: string;
  sourceReference: {
    section: string;
    lineRange?: [number, number];
    page?: number;
  };
}

export interface TokenizedChunk {
  text: string;
  tokens: number;
  index: number;
  semanticType: string;
  context: string;
  metadata: {
    startChar: number;
    endChar: number;
    isOversized: boolean;
    splitDepth: number;
  };
  sourceReference: {
    section: string;
    lineRange?: [number, number];
  };
}
