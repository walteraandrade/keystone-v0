import type { BaseEntity } from './base/Entity.js';

export type RequirementType = 'REGULATORY' | 'COMPLIANCE' | 'INTERNAL' | 'INDUSTRY_STANDARD';

export interface Requirement extends BaseEntity {
  type: 'Requirement';
  requirementType: RequirementType;
  code: string;
  description: string;
  source?: string;
}
