import type { Entity } from '../../domain/entities/index.js';
import type { Relationship, RelationshipType } from '../../domain/relationships/types.js';
import type { SourceReference } from '../../domain/entities/base/Provenance.js';

export interface SemanticSearchParams {
  query: string;
  limit?: number;
  expandDepth?: number;
  filters?: {
    semanticType?: string[];
    documentId?: string;
  };
}

export interface SemanticSearchResult {
  chunks: Array<{
    chunkId: string;
    text: string;
    score: number;
    semanticType: string;
    context: string;
    entity?: Entity;
    relatedEntities?: Entity[];
  }>;
  aggregations: {
    totalChunks: number;
    uniqueEntities: number;
    semanticTypes: Record<string, number>;
  };
}

export interface ContextOptions {
  includeRelationships?: boolean;
  maxChunks?: number;
}

export interface EntityContextResult {
  entity: Entity;
  chunks: Array<{
    chunkId: string;
    text: string;
    context: string;
    sourceReference: SourceReference;
  }>;
  relationships?: Relationship[];
  provenance: {
    documentId: string;
    fileName?: string;
    extractedBy?: string;
    confidence: number;
  };
}

export type AnalyticsGroupBy = 'semanticType' | 'context' | 'documentId';

export interface AnalyticsParams {
  groupBy: AnalyticsGroupBy;
  includeGraphStats?: boolean;
}

export interface AnalyticsResult {
  vectorStats: {
    totalChunks: number;
    avgTokens: number;
    byGroup: Record<string, {
      count: number;
      avgTokens: number;
      oversizedCount: number;
    }>;
  };
  graphStats?: {
    totalEntities: number;
    byType: Record<string, number>;
    highRiskFailureModes: number;
    openFindings: number;
  };
}

export interface GraphPatternParams {
  entityType?: string;
  filters?: Record<string, unknown>;
  relationships?: Array<{
    type: RelationshipType;
    direction: 'in' | 'out' | 'both';
    targetType?: string;
  }>;
  includeVectorContext?: boolean;
  limit?: number;
}

export interface GraphPatternResult {
  entities: Entity[];
  relationships: Relationship[];
  chunks?: Array<{
    entityId: string;
    chunkText: string;
    context: string;
  }>;
}
