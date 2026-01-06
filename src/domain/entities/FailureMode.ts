import type { BaseEntity } from './base/Entity.js';

export interface FailureMode extends BaseEntity {
  type: 'FailureMode';
  code: string;
  description: string;
  severity?: number;
  occurrence?: number;
  detection?: number;
  rpn?: number;
}
