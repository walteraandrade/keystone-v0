import type { BaseEntity } from './base/Entity.js';

export type ControlType = 'PREVENTIVE' | 'DETECTIVE' | 'CORRECTIVE';

export interface Control extends BaseEntity {
  type: 'Control';
  controlType: ControlType;
  description: string;
  effectiveness?: number;
}
