import type { BaseEntity } from './base/Entity.js';

export interface ProcedureStep extends BaseEntity {
  type: 'ProcedureStep';
  stepNumber: number;
  processId: string;
  description: string;
  responsibleRole?: string;
  frequency?: string;
  evidence?: string;
}
