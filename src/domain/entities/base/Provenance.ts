export interface SourceReference {
  section: string;
  pageNumber?: number;
  lineRange?: [number, number];
}

export interface Provenance {
  sourceDocumentId: string;
  extractedBy: string;
  extractedAt: string;
  confidence: number;
  sourceReference: SourceReference;
}
