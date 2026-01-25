import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { Neo4jRepository } from '../../services/graph/Neo4jRepository.js';
import { FileSystemStorage } from '../../services/storage/FileSystemStorage.js';
import { createVectorStore } from '../../services/vector/VectorStoreFactory.js';
import type { VectorStore } from '../../services/vector/VectorStore.interface.js';
import { LLMServiceFactory } from '../../services/llm/LLMServiceFactory.js';
import type { LLMService } from '../../services/llm/LLMService.interface.js';
import { IngestionOrchestrator } from '../../services/ingestion/IngestionOrchestrator.js';
import { DocumentClassifier } from './classifier/DocumentClassifier.js';
import type { ProgressReporter } from './reporters/ProgressReporter.js';
import type {
  BatchConfig,
  BatchResult,
  FileInfo,
  ClassifiedFile,
  IngestionSummary,
  BatchProgress,
} from './types.js';
import type { DocumentType, Document } from '../../domain/entities/Document.js';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.txt', '.csv']);

export class BatchIngestor {
  private graphRepo: Neo4jRepository;
  private docStorage: FileSystemStorage;
  private vectorStore: VectorStore;
  private llmService: LLMService;
  private orchestrator!: IngestionOrchestrator;
  private classifier: DocumentClassifier;

  constructor() {
    this.graphRepo = new Neo4jRepository();
    this.docStorage = new FileSystemStorage();
    this.vectorStore = createVectorStore();
    this.llmService = LLMServiceFactory.createLLMService();
    this.classifier = new DocumentClassifier(this.llmService);
  }

  async initialize(): Promise<void> {
    await this.graphRepo.connect();
    await this.vectorStore.connect();
    this.orchestrator = new IngestionOrchestrator(
      this.graphRepo,
      this.docStorage,
      this.vectorStore,
      this.llmService
    );
    logger.info('BatchIngestor initialized');
  }

  async close(): Promise<void> {
    await this.graphRepo.disconnect();
    logger.info('BatchIngestor closed');
  }

  async run(config: BatchConfig, reporter: ProgressReporter): Promise<BatchResult> {
    reporter.update({ phase: 'scanning', current: 0, total: 0 });
    const files = await this.scanFolder(config.folder);
    reporter.complete(`Found ${files.length} files`);

    const classifiedFiles: ClassifiedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      reporter.update({
        phase: 'classifying',
        current: i + 1,
        total: files.length,
        currentFile: files[i].name,
      });

      const classification = await this.classifier.classify(files[i].path, files[i].name);
      const contentHash = await this.computeHash(files[i].path);

      classifiedFiles.push({
        ...files[i],
        classification,
        contentHash,
      });
    }
    reporter.complete(`Classified ${classifiedFiles.length} files`);

    if (config.skipExisting) {
      reporter.update({ phase: 'checking', current: 0, total: classifiedFiles.length });
      for (let i = 0; i < classifiedFiles.length; i++) {
        reporter.update({
          phase: 'checking',
          current: i + 1,
          total: classifiedFiles.length,
          currentFile: classifiedFiles[i].name,
        });

        const existing = await this.graphRepo.findDuplicateEntity({
          type: 'Document',
          contentHash: classifiedFiles[i].contentHash,
        } as Document);

        if (existing) {
          classifiedFiles[i].skip = true;
          classifiedFiles[i].skipReason = 'exists';
        }
      }
      reporter.complete(`Checked existing documents`);
    }

    const result: BatchResult = {
      config,
      files: classifiedFiles,
      ingested: [],
      summary: {
        total: classifiedFiles.length,
        processed: 0,
        skipped: 0,
        failed: 0,
        byType: {} as Record<DocumentType, number>,
      },
    };

    for (const file of classifiedFiles) {
      const type = file.classification.documentType;
      result.summary.byType[type] = (result.summary.byType[type] || 0) + 1;
    }

    if (config.dryRun) {
      return result;
    }

    const toIngest = classifiedFiles.filter(f => !f.skip);
    for (let i = 0; i < toIngest.length; i++) {
      const file = toIngest[i];
      reporter.update({
        phase: 'ingesting',
        current: i + 1,
        total: toIngest.length,
        currentFile: file.name,
      });

      try {
        const ingResult = await this.orchestrator.ingest(file.path, file.name);
        result.ingested.push({
          documentId: ingResult.documentId,
          fileName: file.name,
          documentType: file.classification.documentType,
          status: ingResult.status,
          entitiesCreated: ingResult.entitiesCreated,
          relationshipsCreated: ingResult.relationshipsCreated,
          error: ingResult.error,
        });

        if (ingResult.status === 'processed') {
          result.summary.processed++;
        } else {
          result.summary.failed++;
        }
      } catch (error) {
        result.ingested.push({
          documentId: '',
          fileName: file.name,
          documentType: file.classification.documentType,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        result.summary.failed++;
      }
    }

    result.summary.skipped = classifiedFiles.filter(f => f.skip).length;
    reporter.complete(`Ingestion complete: ${result.summary.processed} processed, ${result.summary.skipped} skipped, ${result.summary.failed} failed`);

    return result;
  }

  private async scanFolder(folder: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    const entries = await readdir(folder, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          const fullPath = join(folder, entry.name);
          const stats = await stat(fullPath);
          files.push({
            path: fullPath,
            name: entry.name,
            size: stats.size,
            extension: ext,
          });
        }
      }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  private async computeHash(filePath: string): Promise<string> {
    const buffer = await readFile(filePath);
    return createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
  }
}
