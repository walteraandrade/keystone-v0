import { Database } from 'bun:sqlite';
import { generateId } from '../../utils/uuid.js';
import { logger } from '../../utils/logger.js';
import type { GoldenQuestion, QuestionType } from './types.js';

export class EvalChunkingDB {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
    logger.info({ dbPath }, 'Eval chunking DB initialized');
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS golden_questions (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        question TEXT NOT NULL,
        type TEXT NOT NULL,
        source_line_start INTEGER NOT NULL,
        source_line_end INTEGER NOT NULL,
        expected_facts TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_gq_document_id ON golden_questions(document_id)`);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS eval_runs (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunker_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        retrieval_hit_rate_1 REAL,
        retrieval_hit_rate_3 REAL,
        retrieval_hit_rate_5 REAL,
        retrieval_mrr REAL,
        retrieval_iou REAL,
        intrinsic_concept_unity REAL,
        intrinsic_boundary_rate REAL,
        intrinsic_standalone REAL,
        preservation_score REAL,
        overall_score REAL,
        report_json TEXT
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_eval_document_id ON eval_runs(document_id)`);
  }

  saveGoldenQuestion(q: Omit<GoldenQuestion, 'id' | 'createdAt'>): string {
    const id = generateId('gq');
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO golden_questions (id, document_id, question, type, source_line_start, source_line_end, expected_facts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      q.documentId,
      q.question,
      q.type,
      q.sourceLineRange[0],
      q.sourceLineRange[1],
      JSON.stringify(q.expectedFacts),
      createdAt
    );
    return id;
  }

  saveGoldenQuestions(questions: Omit<GoldenQuestion, 'id' | 'createdAt'>[]): string[] {
    const ids: string[] = [];
    const createdAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO golden_questions (id, document_id, question, type, source_line_start, source_line_end, expected_facts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of questions) {
      const id = generateId('gq');
      stmt.run(
        id,
        q.documentId,
        q.question,
        q.type,
        q.sourceLineRange[0],
        q.sourceLineRange[1],
        JSON.stringify(q.expectedFacts),
        createdAt
      );
      ids.push(id);
    }
    return ids;
  }

  getGoldenQuestionsByDocument(documentId: string): GoldenQuestion[] {
    const rows = this.db.prepare(`
      SELECT * FROM golden_questions WHERE document_id = ?
    `).all(documentId) as Array<{
      id: string;
      document_id: string;
      question: string;
      type: string;
      source_line_start: number;
      source_line_end: number;
      expected_facts: string;
      created_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      question: row.question,
      type: row.type as QuestionType,
      sourceLineRange: [row.source_line_start, row.source_line_end] as [number, number],
      expectedFacts: JSON.parse(row.expected_facts),
      createdAt: row.created_at,
    }));
  }

  deleteGoldenQuestionsByDocument(documentId: string): number {
    const result = this.db.prepare(`DELETE FROM golden_questions WHERE document_id = ?`).run(documentId);
    return result.changes;
  }

  saveEvalRun(
    documentId: string,
    chunkerType: string,
    metrics: {
      retrievalHitRate1: number;
      retrievalHitRate3: number;
      retrievalHitRate5: number;
      retrievalMrr: number;
      retrievalIou: number;
      intrinsicConceptUnity: number;
      intrinsicBoundaryRate: number;
      intrinsicStandalone: number;
      preservationScore: number;
      overallScore: number;
    },
    reportJson: string
  ): string {
    const id = generateId('eval');
    const timestamp = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO eval_runs (id, document_id, chunker_type, timestamp, retrieval_hit_rate_1, retrieval_hit_rate_3, retrieval_hit_rate_5, retrieval_mrr, retrieval_iou, intrinsic_concept_unity, intrinsic_boundary_rate, intrinsic_standalone, preservation_score, overall_score, report_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      documentId,
      chunkerType,
      timestamp,
      metrics.retrievalHitRate1,
      metrics.retrievalHitRate3,
      metrics.retrievalHitRate5,
      metrics.retrievalMrr,
      metrics.retrievalIou,
      metrics.intrinsicConceptUnity,
      metrics.intrinsicBoundaryRate,
      metrics.intrinsicStandalone,
      metrics.preservationScore,
      metrics.overallScore,
      reportJson
    );
    return id;
  }

  getLatestEvalRun(documentId: string, chunkerType?: string): { id: string; reportJson: string } | null {
    let query = `SELECT id, report_json FROM eval_runs WHERE document_id = ?`;
    const params: string[] = [documentId];

    if (chunkerType) {
      query += ` AND chunker_type = ?`;
      params.push(chunkerType);
    }
    query += ` ORDER BY timestamp DESC LIMIT 1`;

    const row = this.db.prepare(query).get(...params) as { id: string; report_json: string } | undefined;
    return row ? { id: row.id, reportJson: row.report_json } : null;
  }

  close(): void {
    this.db.close();
  }
}
