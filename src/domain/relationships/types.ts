import type { SourceReference } from '../entities/base/Provenance.js';

export enum RelationshipType {
  EVALUATES = 'EVALUATES',
  USES = 'USES',
  IDENTIFIES = 'IDENTIFIES',
  IMPLIES = 'IMPLIES',
  MITIGATES = 'MITIGATES',
  ADDRESSES = 'ADDRESSES',
  REFERENCES = 'REFERENCES',
  SATISFIES = 'SATISFIES',
  FAILS_TO_SATISFY = 'FAILS_TO_SATISFY',
  SUPERSEDES = 'SUPERSEDES',
}

export interface BaseRelationship {
  from: string;
  to: string;
  type: RelationshipType;
  confidence: number;
  sourceReference?: SourceReference;
  properties?: Record<string, unknown>;
}

export interface EvaluatesRelationship extends BaseRelationship {
  type: RelationshipType.EVALUATES;
  properties?: {
    date?: string;
    auditor?: string;
    scope?: string;
  };
}

export interface UsesRelationship extends BaseRelationship {
  type: RelationshipType.USES;
  properties?: {
    uploadedAt?: string;
  };
}

export interface IdentifiesRelationship extends BaseRelationship {
  type: RelationshipType.IDENTIFIES;
  properties?: {
    section?: string;
  };
}

export interface ImpliesRelationship extends BaseRelationship {
  type: RelationshipType.IMPLIES;
  properties?: {
    severity?: number;
    likelihood?: number;
  };
}

export interface MitigatesRelationship extends BaseRelationship {
  type: RelationshipType.MITIGATES;
  properties?: {
    effectiveness?: number;
  };
}

export interface AddressesRelationship extends BaseRelationship {
  type: RelationshipType.ADDRESSES;
  properties?: {
    status?: string;
    priority?: string;
  };
}

export interface ReferencesRelationship extends BaseRelationship {
  type: RelationshipType.REFERENCES;
  properties?: {
    compliance?: string;
  };
}

export interface SatisfiesRelationship extends BaseRelationship {
  type: RelationshipType.SATISFIES;
  properties?: {
    criteriaId?: string;
  };
}

export interface FailsToSatisfyRelationship extends BaseRelationship {
  type: RelationshipType.FAILS_TO_SATISFY;
  properties?: {
    gaps?: string;
  };
}

export interface SupersedesRelationship extends BaseRelationship {
  type: RelationshipType.SUPERSEDES;
  properties?: {
    reason?: string;
    date?: string;
  };
}

export type Relationship =
  | EvaluatesRelationship
  | UsesRelationship
  | IdentifiesRelationship
  | ImpliesRelationship
  | MitigatesRelationship
  | AddressesRelationship
  | ReferencesRelationship
  | SatisfiesRelationship
  | FailsToSatisfyRelationship
  | SupersedesRelationship;
