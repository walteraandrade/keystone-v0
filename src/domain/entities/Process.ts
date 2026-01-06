import type { BaseEntity } from './base/Entity.js';

export interface Process extends BaseEntity {
  type: 'Process';
  name: string;
  version: string;
  description?: string;
}
