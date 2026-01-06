import { generateId } from '../../utils/uuid.js';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';
import type { DocumentStorage } from '../storage/DocumentStorage.interface.js';
import type { VectorStore } from '../vector/VectorStore.interface.js';
import type { LLMService } from '../llm/LLMService.interface.js';
import { DocumentProcessor } from './DocumentProcessor.js';
import { ValidationService } from './ValidationService.js';
import { DeduplicationService } from './DeduplicationService.js';
import { EmbeddingService } from '../vector/EmbeddingService.js';
import { ChunkingService } from '../vector/ChunkingService.js';
import type { Document } from '../../domain/entities/Document.js';
import { RelationshipType } from '../../domain/relationships/types.js';

export interface IngestionResult {
  documentId: string;
  status: 'processed' | 'failed';
  entitiesCreated: Record<string, number>;
  relationshipsCreated: number;
  processingTime: string;
  error?: string;
}

export class IngestionOrchestrator {
  private docProcessor: DocumentProcessor;
  private validationService: ValidationService;
  private deduplicationService: DeduplicationService;
  private embeddingService: EmbeddingService;
  private chunkingService: ChunkingService;

  constructor(
    private graphRepo: GraphRepository,
    private docStorage: DocumentStorage,
    private vectorStore: VectorStore,
    private llmService: LLMService
  ) {
    this.docProcessor = new DocumentProcessor();
    this.validationService = new ValidationService();
    this.deduplicationService = new DeduplicationService(graphRepo);
    this.embeddingService = new EmbeddingService();
    this.chunkingService = new ChunkingService();
  }

  async ingest(filePath: string, fileName: string, metadata: Record<string, unknown> = {}): Promise<IngestionResult> {
    const startTime = Date.now();
    const documentId = generateId('doc');

    try {
      logger.info({ fileName, documentId }, 'Starting ingestion');

      const fileBuffer = await require('fs/promises').readFile(filePath);
      const stored = await this.docStorage.store(fileName, fileBuffer);

      const docEntity: Document = {
        id: documentId,
        type: 'Document',
        documentType: 'generic',
        status: 'PENDING',
        storagePath: stored.path,
        contentHash: stored.hash,
        fileName,
        uploadedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provenance: [],
      };

      await this.graphRepo.createEntity(docEntity);
      logger.debug({ documentId }, 'Created Document entity');

      await this.graphRepo.updateEntity(documentId, { status: 'PROCESSING' });

      const processed = await this.docProcessor.processFile(stored.path, fileName);
      logger.debug({ documentId, type: processed.type }, 'Processed document');

      await this.graphRepo.updateEntity(documentId, { documentType: processed.type });

      const extraction = await this.llmService.extract({
        documentType: processed.type,
        content: processed.content,
        metadata: { ...metadata, ...processed.metadata },
      });
      logger.debug({ documentId, entityCount: extraction.entities.length }, 'Extracted entities');

      this.validationService.validateExtraction(extraction);
      logger.debug({ documentId }, 'Validated extraction');

      const tx = await this.graphRepo.beginTransaction();

      try {
        const entityMap = new Map<string, string>();
        const entityCounts: Record<string, number> = {};

        for (const entityCandidate of extraction.entities) {
          const result = await this.deduplicationService.deduplicateEntity(
            entityCandidate,
            documentId,
            extraction.metadata.modelUsed
          );

          const businessKey = this.getBusinessKey(entityCandidate.entityType, entityCandidate.properties);
          entityMap.set(`${entityCandidate.entityType}:${businessKey}`, result.entityId);

          entityCounts[entityCandidate.entityType] = (entityCounts[entityCandidate.entityType] || 0) + 1;
        }

        let relationshipCount = 0;
        for (const relCandidate of extraction.relationships) {
          const fromId = entityMap.get(relCandidate.from);
          const toId = entityMap.get(relCandidate.to);

          if (fromId && toId) {
            await this.graphRepo.createRelationship(
              fromId,
              toId,
              RelationshipType[relCandidate.type as keyof typeof RelationshipType],
              relCandidate.confidence,
              relCandidate.sourceReference,
              relCandidate.properties
            );
            relationshipCount++;
          }
        }

        await this.graphRepo.updateEntity(documentId, { status: 'PROCESSED' });

        await this.graphRepo.commit(tx);
        logger.debug({ documentId }, 'Committed graph transaction');

        const chunks = this.chunkingService.chunkText(processed.content);
        const embeddings = await this.embeddingService.generateEmbeddings(chunks.map(c => c.text));

        const vectorDocs = chunks.map((chunk, idx) => ({
          id: generateId('vec'),
          vector: embeddings[idx],
          payload: {
            graphNodeId: documentId,
            documentId,
            chunkText: chunk.text,
            chunkIndex: chunk.index,
            metadata: chunk.metadata,
          },
        }));

        await this.vectorStore.upsertDocuments(vectorDocs);
        logger.debug({ documentId, vectorCount: vectorDocs.length }, 'Stored vectors');

        const processingTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
        logger.info({ documentId, processingTime, entityCounts, relationshipCount }, 'Ingestion complete');

        return {
          documentId,
          status: 'processed',
          entitiesCreated: entityCounts,
          relationshipsCreated: relationshipCount,
          processingTime,
        };
      } catch (error) {
        await this.graphRepo.rollback(tx);
        throw error;
      }
    } catch (error) {
      logger.error({ documentId, error }, 'Ingestion failed');

      try {
        await this.graphRepo.updateEntity(documentId, {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch {}

      return {
        documentId,
        status: 'failed',
        entitiesCreated: {},
        relationshipsCreated: 0,
        processingTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private getBusinessKey(entityType: string, properties: Record<string, unknown>): string {
    switch (entityType) {
      case 'Process':
        return `${properties.name}:${properties.version}`;
      case 'FailureMode':
      case 'Requirement':
        return properties.code as string;
      default:
        return Math.random().toString(36);
    }
  }
}
