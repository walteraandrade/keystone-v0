import { generateId } from '../../utils/uuid.js';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';
import type { DocumentStorage } from '../storage/DocumentStorage.interface.js';
import type { VectorStore } from '../vector/VectorStore.interface.js';
import type { LLMService } from '../llm/LLMService.interface.js';
import type { BunSQLiteService } from '../extraction/BunSQLiteService.js';
import { DocumentProcessor } from './DocumentProcessor.js';
import { ValidationService } from './ValidationService.js';
import { DeduplicationService } from './DeduplicationService.js';
import { EmbeddingService } from '../vector/EmbeddingService.js';
import { SemanticChunker } from '../chunking/SemanticChunker.js';
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
  private semanticChunker: SemanticChunker;

  constructor(
    private graphRepo: GraphRepository,
    private docStorage: DocumentStorage,
    private vectorStore: VectorStore,
    private llmService: LLMService,
    private extractionLogger?: BunSQLiteService
  ) {
    this.docProcessor = new DocumentProcessor();
    this.validationService = new ValidationService();
    this.deduplicationService = new DeduplicationService(graphRepo);
    this.embeddingService = new EmbeddingService();
    this.semanticChunker = new SemanticChunker(this.embeddingService);
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
      logger.info({ documentId, entityCount: extraction.entities.length, relationshipCount: extraction.relationships.length }, 'LLM extraction complete');

      this.validationService.validateExtraction(extraction);
      logger.info({ documentId }, 'Validation complete');

      let entityCounts: Record<string, number> = {};
      let relationshipCount = 0;

      try {
        logger.info({ documentId, totalEntities: extraction.entities.length }, 'Starting graph persistence');
        const entityMap = new Map<string, string>();

        for (let i = 0; i < extraction.entities.length; i++) {
          const entityCandidate = extraction.entities[i];
          if (i % 10 === 0) {
            logger.info({ documentId, progress: `${i}/${extraction.entities.length}` }, 'Processing entities');
          }
          const result = await this.deduplicationService.deduplicateEntity(
            entityCandidate,
            documentId,
            extraction.metadata.modelUsed
          );

          const businessKey = this.getBusinessKey(entityCandidate.entityType, entityCandidate.properties);
          entityMap.set(`${entityCandidate.entityType}:${businessKey}`, result.entityId);

          entityCounts[entityCandidate.entityType] = (entityCounts[entityCandidate.entityType] || 0) + 1;
        }

        logger.info({ documentId, entityCounts }, 'All entities processed, creating relationships');

        for (const relCandidate of extraction.relationships) {
          if (relCandidate.from.startsWith('Document:') || relCandidate.to.startsWith('Document:')) {
            logger.debug({ relationship: relCandidate }, 'Skipping Document relationship - will be auto-created');
            continue;
          }

          const fromId = entityMap.get(relCandidate.from);
          const toId = entityMap.get(relCandidate.to);

          if (fromId && toId) {
            await this.graphRepo.createRelationship(
              fromId,
              toId,
              RelationshipType[relCandidate.type as keyof typeof RelationshipType],
              relCandidate.confidence,
              relCandidate.sourceReference,
              {
                sourceDocumentId: documentId,
                extractedBy: extraction.metadata.modelUsed,
              },
              relCandidate.properties
            );
            relationshipCount++;
          }
        }

        logger.info({ documentId }, 'Creating implicit Document relationships');
        const auditIds: string[] = [];
        const failureModeIds: string[] = [];

        for (const [entityRef, entityId] of entityMap.entries()) {
          const [entityType] = entityRef.split(':');
          if (entityType === 'Audit') {
            auditIds.push(entityId);
          } else if (entityType === 'FailureMode') {
            failureModeIds.push(entityId);
          }
        }

        logger.info({ documentId, auditCount: auditIds.length, failureModeCount: failureModeIds.length }, 'Starting implicit relationship creation');

        const implicitRelCount = await this.createImplicitDocumentRelationships(
          documentId,
          auditIds,
          failureModeIds
        );

        logger.info({ documentId, implicitRelCount }, 'Completed implicit relationship creation');
        relationshipCount += implicitRelCount;

        logger.info({ documentId }, 'About to update entity status to PROCESSED');
        await this.graphRepo.updateEntity(documentId, { status: 'PROCESSED' });
        logger.info({ documentId, entityCounts, relationshipCount }, 'Graph persistence complete');
      } catch (error) {
        logger.error({ documentId, error }, 'Graph persistence failed');
        throw error;
      }

      try {
        logger.info({ documentId }, 'Starting semantic chunking and embedding');
        const allChunks = await this.semanticChunker.chunk(processed.content, processed.type, {
          structuredElements: processed.structuredElements,
        });
        const validChunks = allChunks.filter(c => c.text && c.text.trim().length > 0);

        if (validChunks.length === 0) {
          logger.warn({ documentId }, 'No valid chunks to embed, skipping vector storage');
          return {
            documentId,
            status: 'processed',
            entitiesCreated: entityCounts,
            relationshipsCreated: relationshipCount,
            processingTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          };
        }

        if (validChunks.length !== allChunks.length) {
          logger.warn(
            { documentId, total: allChunks.length, valid: validChunks.length },
            'Filtered out empty chunks before embedding'
          );
        }

        const embeddings = await this.embeddingService.generateEmbeddings(validChunks.map(c => c.text));
        logger.info({ documentId, embeddingCount: embeddings.length }, 'Embeddings generated');

        if (embeddings.length !== validChunks.length) {
          throw new Error(`Embedding count mismatch: ${embeddings.length} embeddings for ${validChunks.length} chunks`);
        }

        const vectorDocs = validChunks.map((chunk, idx) => ({
          id: generateId(),
          vector: embeddings[idx],
          payload: {
            graphNodeId: documentId,
            documentId,
            chunkText: chunk.text,
            chunkIndex: chunk.index,
            semanticType: chunk.semanticType,
            context: chunk.context,
            tokens: chunk.tokens,
            isOversized: chunk.metadata.isOversized,
            splitDepth: chunk.metadata.splitDepth,
            metadata: {
              startChar: chunk.metadata.startChar,
              endChar: chunk.metadata.endChar,
              documentType: processed.type,
            },
          },
        }));

        await this.vectorStore.upsertDocuments(vectorDocs);
        logger.info({ documentId, vectorCount: vectorDocs.length }, 'Vector storage complete');
      } catch (error) {
        logger.error({ documentId, error }, 'Embedding/vector storage failed, continuing without vectors');
      }

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

  private async createImplicitDocumentRelationships(
    documentId: string,
    auditIds: string[],
    failureModeIds: string[]
  ): Promise<number> {
    logger.info({ documentId, auditIds, failureModeIds }, 'Building implicit relationships');
    const relationships = [];

    for (const auditId of auditIds) {
      relationships.push({
        from: auditId,
        to: documentId,
        type: RelationshipType.USES,
        confidence: 1.0,
      });
    }

    for (const fmId of failureModeIds) {
      relationships.push({
        from: documentId,
        to: fmId,
        type: RelationshipType.IDENTIFIES,
        confidence: 1.0,
      });
    }

    logger.info({ documentId, relationshipCount: relationships.length }, 'Calling createSimpleRelationships');
    if (relationships.length > 0) {
      await this.graphRepo.createSimpleRelationships(relationships);
    }

    logger.info({ documentId, auditCount: auditIds.length, failureModeCount: failureModeIds.length }, 'Finished creating implicit Document relationships');
    return relationships.length;
  }

  private getBusinessKey(entityType: string, properties: Record<string, unknown>): string {
    switch (entityType) {
      case 'Process':
        return `${properties.name}:${properties.version}`;
      case 'FailureMode':
      case 'Requirement':
        return properties.code as string;
      case 'Audit':
        return properties.auditDate as string;
      default:
        return Math.random().toString(36);
    }
  }
}
