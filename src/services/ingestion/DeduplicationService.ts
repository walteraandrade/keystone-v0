import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/uuid.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';
import type { Entity } from '../../domain/entities/index.js';
import type { ExtractionCandidate } from '../../types/extraction.types.js';
import type { Provenance } from '../../domain/entities/base/Provenance.js';
import { RelationshipType } from '../../domain/relationships/types.js';

export interface DeduplicationResult {
  isNew: boolean;
  entityId: string;
  action: 'created' | 'found_identical' | 'created_version';
}

export class DeduplicationService {
  constructor(private graphRepo: GraphRepository) {}

  async deduplicateEntity(
    candidate: ExtractionCandidate,
    documentId: string,
    extractedBy: string
  ): Promise<DeduplicationResult> {
    const entity = this.candidateToEntity(candidate, documentId, extractedBy);

    const existingId = await this.graphRepo.findDuplicateEntity(entity);

    if (!existingId) {
      const id = await this.graphRepo.createEntity(entity);
      logger.debug({ entityType: entity.type, id }, 'Created new entity');
      return { isNew: true, entityId: id, action: 'created' };
    }

    const existing = await this.graphRepo.getEntity(existingId);
    if (!existing) {
      const id = await this.graphRepo.createEntity(entity);
      return { isNew: true, entityId: id, action: 'created' };
    }

    const hasChanges = this.detectPropertyChanges(existing, entity);

    if (!hasChanges) {
      logger.debug({ entityType: entity.type, id: existingId }, 'Found identical entity');
      return { isNew: false, entityId: existingId, action: 'found_identical' };
    }

    const newVersionId = await this.graphRepo.createEntity(entity);
    await this.graphRepo.createRelationship(
      newVersionId,
      existingId,
      RelationshipType.SUPERSEDES,
      1.0,
      candidate.sourceReference,
      {
        sourceDocumentId: documentId,
        extractedBy: extractedBy,
      },
      {
        reason: 'Property changes detected',
        date: new Date().toISOString(),
      }
    );

    logger.debug({ entityType: entity.type, newId: newVersionId, oldId: existingId }, 'Created new version');
    return { isNew: true, entityId: newVersionId, action: 'created_version' };
  }

  private candidateToEntity(
    candidate: ExtractionCandidate,
    documentId: string,
    extractedBy: string
  ): Entity {
    const provenance: Provenance = {
      sourceDocumentId: documentId,
      extractedBy,
      extractedAt: new Date().toISOString(),
      confidence: candidate.confidence,
      sourceReference: candidate.sourceReference,
    };

    const now = new Date().toISOString();

    return {
      id: generateId(),
      type: candidate.entityType,
      createdAt: now,
      updatedAt: now,
      provenance: [provenance],
      ...candidate.properties,
    } as Entity;
  }

  private detectPropertyChanges(existing: Entity, candidate: Entity): boolean {
    const existingProps = { ...existing };
    const candidateProps = { ...candidate };

    delete (existingProps as any).id;
    delete (existingProps as any).createdAt;
    delete (existingProps as any).updatedAt;
    delete (existingProps as any).provenance;

    delete (candidateProps as any).id;
    delete (candidateProps as any).createdAt;
    delete (candidateProps as any).updatedAt;
    delete (candidateProps as any).provenance;

    return JSON.stringify(existingProps) !== JSON.stringify(candidateProps);
  }
}
