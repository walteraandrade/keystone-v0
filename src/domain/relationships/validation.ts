import { RelationshipType } from './types.js';

export interface RelationshipRule {
  from: string;
  to: string;
  allowedTypes: RelationshipType[];
}

export const relationshipRules: RelationshipRule[] = [
  { from: 'Audit', to: 'Process', allowedTypes: [RelationshipType.EVALUATES] },
  { from: 'Audit', to: 'Document', allowedTypes: [RelationshipType.USES] },
  { from: 'Document', to: 'FailureMode', allowedTypes: [RelationshipType.IDENTIFIES] },
  { from: 'Document', to: 'Requirement', allowedTypes: [RelationshipType.SATISFIES, RelationshipType.FAILS_TO_SATISFY] },
  { from: 'Document', to: 'Document', allowedTypes: [RelationshipType.SUPERSEDES] },
  { from: 'FailureMode', to: 'Risk', allowedTypes: [RelationshipType.IMPLIES] },
  { from: 'FailureMode', to: 'FailureMode', allowedTypes: [RelationshipType.SUPERSEDES] },
  { from: 'Control', to: 'FailureMode', allowedTypes: [RelationshipType.MITIGATES] },
  { from: 'Control', to: 'Control', allowedTypes: [RelationshipType.SUPERSEDES] },
  { from: 'Finding', to: 'FailureMode', allowedTypes: [RelationshipType.ADDRESSES] },
  { from: 'Finding', to: 'Control', allowedTypes: [RelationshipType.REFERENCES] },
  { from: 'Finding', to: 'Finding', allowedTypes: [RelationshipType.SUPERSEDES] },
  { from: 'Process', to: 'Process', allowedTypes: [RelationshipType.SUPERSEDES] },
  { from: 'Risk', to: 'Risk', allowedTypes: [RelationshipType.SUPERSEDES] },
  { from: 'Requirement', to: 'Requirement', allowedTypes: [RelationshipType.SUPERSEDES] },
];

export function validateRelationship(fromType: string, toType: string, relType: RelationshipType): boolean {
  return relationshipRules.some(
    rule => rule.from === fromType && rule.to === toType && rule.allowedTypes.includes(relType)
  );
}
