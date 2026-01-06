import type { Entity } from '../../domain/entities/index.js';
import type { Relationship, RelationshipType } from '../../domain/relationships/types.js';

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
    properties?: Record<string, unknown>
  ): Promise<void>;
  getRelationships(entityId: string, direction?: 'in' | 'out' | 'both'): Promise<Relationship[]>;

  getAuditSummary(auditId: string): Promise<AuditSummary>;

  beginTransaction(): Promise<Transaction>;
  commit(tx: Transaction): Promise<void>;
  rollback(tx: Transaction): Promise<void>;
}
