import type { Provenance } from './Provenance.js';

export interface BaseEntity {
  id: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  provenance: Provenance[];
}
