import type { BaseEntity } from './base/Entity.js';

export type DocumentType = 'fmea' | 'ipar' | 'hira' | 'alert' | 'fps' | 'generic';
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export interface Document extends BaseEntity {
  type: 'Document';
  documentType: DocumentType;
  status: DocumentStatus;
  storagePath: string;
  contentHash: string;
  fileName: string;
  uploadedAt: string;
  error?: string;
}
