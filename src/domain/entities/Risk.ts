import type { BaseEntity } from './base/Entity.js';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Risk extends BaseEntity {
  type: 'Risk';
  level: RiskLevel;
  description: string;
  likelihood?: number;
  impact?: number;
}
