import type { BaseEntity } from './base/Entity.js';

export type FindingStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type FindingPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Finding extends BaseEntity {
  type: 'Finding';
  status: FindingStatus;
  priority: FindingPriority;
  description: string;
}
