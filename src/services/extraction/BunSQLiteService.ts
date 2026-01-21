import { Database } from 'bun:sqlite';
import { generateId } from '../../utils/uuid.js';
import { logger } from '../../utils/logger.js';

export interface ExtractionLogEntry {
  id: string;
  documentId: string;
  model: string;
  timestamp: string;
  rawOutput: string;
  tokensUsed: number;
  confidenceAvg: number;
  entityCount: number;
  relationshipCount: number;
  status: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
}

export class BunSQLiteService {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
    logger.info({ dbPath }, 'SQLite extraction log initialized');
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS extraction_log (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        model TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        raw_output TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        confidence_avg REAL DEFAULT 0,
        entity_count INTEGER DEFAULT 0,
        relationship_count INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        error_message TEXT
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_extraction_document_id ON extraction_log(document_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_extraction_model ON extraction_log(model)`);
  }

  log(entry: Omit<ExtractionLogEntry, 'id'>): string {
    const id = generateId('extlog');
    const stmt = this.db.prepare(`
      INSERT INTO extraction_log (id, document_id, model, timestamp, raw_output, tokens_used, confidence_avg, entity_count, relationship_count, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, entry.documentId, entry.model, entry.timestamp, entry.rawOutput, entry.tokensUsed, entry.confidenceAvg, entry.entityCount, entry.relationshipCount, entry.status, entry.errorMessage || null);
    return id;
  }

  getByDocumentId(documentId: string): ExtractionLogEntry[] {
    return this.db.prepare(`SELECT * FROM extraction_log WHERE document_id = ?`).all(documentId) as ExtractionLogEntry[];
  }

  testConnection(): boolean {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.db.close();
  }
}
