import type { Entity } from '../../domain/entities/index.js';
import type { Relationship, RelationshipType, RelationshipStatus } from '../../domain/relationships/types.js';

export interface Transaction {
  id: string;
  session: unknown;
}

export interface AuditSummary {
  auditId: string;
  process?: {
    id: string;
    name: string;
    version: string;
  };
  documents: Array<{
    id: string;
    documentType: string;
    uploadedAt: string;
  }>;
  statistics: {
    totalFailureModes: number;
    highRisks: number;
    controlsImplemented: number;
    findings: number;
  };
  relationships: {
    failureModesToRisks: number;
    controlsToFailureModes: number;
  };
}

export interface GraphRepository {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;

  createEntity<T extends Entity>(entity: T): Promise<string>;
  getEntity<T extends Entity>(id: string): Promise<T | null>;
  updateEntity<T extends Entity>(id: string, updates: Partial<T>): Promise<void>;
  deleteEntity(id: string): Promise<void>;
  findDuplicateEntity<T extends Entity>(candidate: T): Promise<string | null>;

  createRelationship(
    from: string,
    to: string,
    type: RelationshipType,
    confidence: number,
    sourceReference: unknown,
    extractionContext: {
      sourceDocumentId: string;
      extractedBy: string;
    },
    properties?: Record<string, unknown>,
    status?: RelationshipStatus
  ): Promise<void>;
  getRelationships(entityId: string, direction?: 'in' | 'out' | 'both'): Promise<Relationship[]>;

  createSimpleRelationships(
    relationships: Array<{
      from: string;
      to: string;
      type: RelationshipType;
      confidence: number;
    }>
  ): Promise<void>;

  getAuditSummary(auditId: string): Promise<AuditSummary>;

  queryByPattern(params: {
    nodeLabel: string;
    properties?: Record<string, unknown>;
    limit?: number;
  }): Promise<Entity[]>;

  getEntitiesByIds(ids: string[]): Promise<Entity[]>;

  expandRelationships(entityIds: string[], relationshipTypes?: RelationshipType[]): Promise<{
    entities: Entity[];
    relationships: Relationship[];
  }>;

  beginTransaction(): Promise<Transaction>;
  commit(tx: Transaction): Promise<void>;
  rollback(tx: Transaction): Promise<void>;
}
