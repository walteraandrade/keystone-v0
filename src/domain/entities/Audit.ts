import type { BaseEntity } from './base/Entity.js';

export interface Audit extends BaseEntity {
  type: 'Audit';
  auditor?: string;
  auditDate?: string;
  scope?: string;
}
