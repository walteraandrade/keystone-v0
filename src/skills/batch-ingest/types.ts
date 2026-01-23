import type { DocumentType } from '../../domain/entities/Document.js';

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  method: 'pattern' | 'llm';
  patterns?: string[];
}

export interface BatchConfig {
  folder: string;
  dryRun: boolean;
  format: 'table' | 'json';
  concurrency: number;
  skipExisting: boolean;
}

export interface FileInfo {
  path: string;
  name: string;
  size: number;
  extension: string;
}

export interface ClassifiedFile extends FileInfo {
  classification: ClassificationResult;
  contentHash?: string;
  skip?: boolean;
  skipReason?: string;
}

export interface BatchProgress {
  phase: 'scanning' | 'classifying' | 'checking' | 'ingesting';
  current: number;
  total: number;
  currentFile?: string;
}

export interface IngestionSummary {
  documentId: string;
  fileName: string;
  documentType: DocumentType;
  status: 'processed' | 'failed' | 'skipped';
  entitiesCreated?: Record<string, number>;
  relationshipsCreated?: number;
  error?: string;
}

export interface BatchResult {
  config: BatchConfig;
  files: ClassifiedFile[];
  ingested: IngestionSummary[];
  summary: {
    total: number;
    processed: number;
    skipped: number;
    failed: number;
    byType: Record<DocumentType, number>;
  };
}
