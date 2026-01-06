import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import { validateRelationship } from '../../domain/relationships/validation.js';
import { RelationshipType } from '../../domain/relationships/types.js';
import type { ExtractionResponse, ExtractionCandidate, RelationshipCandidate } from '../../types/extraction.types.js';

export class ValidationService {
  private minConfidence: number;

  constructor() {
    this.minConfidence = config.extraction.minConfidenceThreshold;
  }

  validateExtraction(extraction: ExtractionResponse): void {
    logger.debug({ entityCount: extraction.entities.length, relCount: extraction.relationships.length }, 'Validating extraction');

    this.validateEntities(extraction.entities);
    this.validateRelationships(extraction.relationships, extraction.entities);

    logger.debug('Extraction validation passed');
  }

  private validateEntities(entities: ExtractionCandidate[]): void {
    const validEntityTypes = ['Process', 'Audit', 'Document', 'FailureMode', 'Risk', 'Control', 'Finding', 'Requirement'];

    for (const entity of entities) {
      if (!validEntityTypes.includes(entity.entityType)) {
        throw new ValidationError(`Invalid entity type: ${entity.entityType}`);
      }

      if (entity.confidence < this.minConfidence) {
        throw new ValidationError(`Entity confidence ${entity.confidence} below threshold ${this.minConfidence}`, {
          entityType: entity.entityType,
          confidence: entity.confidence,
        });
      }

      if (!entity.sourceReference?.section) {
        throw new ValidationError('Entity missing source reference section', { entityType: entity.entityType });
      }

      this.validateEntityProperties(entity);
    }
  }

  private validateEntityProperties(entity: ExtractionCandidate): void {
    switch (entity.entityType) {
      case 'Process':
        if (!entity.properties.name || !entity.properties.version) {
          throw new ValidationError('Process missing name or version', entity.properties);
        }
        break;
      case 'FailureMode':
        if (!entity.properties.code || !entity.properties.description) {
          throw new ValidationError('FailureMode missing code or description', entity.properties);
        }
        break;
      case 'Document':
        break;
      case 'Risk':
        if (!entity.properties.level || !entity.properties.description) {
          throw new ValidationError('Risk missing level or description', entity.properties);
        }
        break;
      case 'Control':
        if (!entity.properties.controlType || !entity.properties.description) {
          throw new ValidationError('Control missing controlType or description', entity.properties);
        }
        break;
      case 'Finding':
        if (!entity.properties.status || !entity.properties.priority || !entity.properties.description) {
          throw new ValidationError('Finding missing status, priority, or description', entity.properties);
        }
        break;
      case 'Requirement':
        if (!entity.properties.code || !entity.properties.description) {
          throw new ValidationError('Requirement missing code or description', entity.properties);
        }
        break;
    }
  }

  private validateRelationships(relationships: RelationshipCandidate[], entities: ExtractionCandidate[]): void {
    for (const rel of relationships) {
      if (rel.confidence < this.minConfidence) {
        throw new ValidationError(`Relationship confidence ${rel.confidence} below threshold ${this.minConfidence}`, {
          type: rel.type,
          confidence: rel.confidence,
        });
      }

      if (!rel.sourceReference?.section) {
        throw new ValidationError('Relationship missing source reference section', { type: rel.type });
      }

      const fromEntity = this.findEntityByReference(rel.from, entities);
      const toEntity = this.findEntityByReference(rel.to, entities);

      if (!fromEntity || !toEntity) {
        throw new ValidationError('Relationship references non-existent entity', {
          from: rel.from,
          to: rel.to,
        });
      }

      const relType = RelationshipType[rel.type as keyof typeof RelationshipType];
      if (!relType) {
        throw new ValidationError(`Invalid relationship type: ${rel.type}`);
      }

      if (!validateRelationship(fromEntity.entityType, toEntity.entityType, relType)) {
        throw new ValidationError('Invalid relationship for entity types', {
          from: fromEntity.entityType,
          to: toEntity.entityType,
          type: rel.type,
        });
      }
    }
  }

  private findEntityByReference(ref: string, entities: ExtractionCandidate[]): ExtractionCandidate | undefined {
    const [entityType, businessKey] = ref.split(':');
    return entities.find(e => {
      if (e.entityType !== entityType) return false;

      switch (entityType) {
        case 'Process':
          return `${e.properties.name}:${e.properties.version}` === businessKey;
        case 'FailureMode':
          return e.properties.code === businessKey;
        case 'Requirement':
          return e.properties.code === businessKey;
        default:
          return true;
      }
    });
  }
}
