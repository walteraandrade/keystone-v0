import type { SourceReference } from '../domain/entities/base/Provenance.js';
import type { DocumentType } from '../domain/entities/Document.js';

export interface ExtractionRequest {
  documentType: DocumentType;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ExtractionCandidate {
  entityType: string;
  properties: Record<string, unknown>;
  confidence: number;
  sourceReference: SourceReference;
}

export interface RelationshipCandidate {
  from: string;
  to: string;
  type: string;
  confidence: number;
  properties?: Record<string, unknown>;
  sourceReference: SourceReference;
}

export interface ExtractionResponse {
  entities: ExtractionCandidate[];
  relationships: RelationshipCandidate[];
  metadata: {
    modelUsed: string;
    timestamp: string;
    tokensUsed?: number;
  };
}
