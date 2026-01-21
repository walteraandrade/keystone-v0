import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import { generateId } from '../../utils/uuid.js';
import type { Entity } from '../../domain/entities/index.js';
import type { Relationship, RelationshipType, RelationshipStatus } from '../../domain/relationships/types.js';
import type { Provenance, SourceReference } from '../../domain/entities/base/Provenance.js';
import type { GraphRepository, Transaction, AuditSummary } from './GraphRepository.interface.js';

export class Neo4jRepository implements GraphRepository {
  private driver: Driver | null = null;

  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
        {
          maxConnectionLifetime: 30 * 60 * 1000,
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 30 * 1000,
          connectionTimeout: 30 * 1000,
        }
      );
      await this.driver.verifyConnectivity();
      logger.info('Connected to Neo4j');
    } catch (error) {
      logger.error('Failed to connect to Neo4j', error);
      throw new GraphPersistenceError('Neo4j connection failed', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      logger.info('Disconnected from Neo4j');
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.driver) return false;
    try {
      await this.driver.verifyConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  private getSession(): Session {
    if (!this.driver) {
      throw new GraphPersistenceError('Neo4j driver not initialized');
    }
    return this.driver.session();
  }

  private async runWithTimeout(
    session: Session,
    query: string,
    params: Record<string, unknown> = {},
    timeoutMs = 30000
  ): Promise<Result> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new GraphPersistenceError(`Query timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([session.run(query, params), timeoutPromise]);
  }

  async createEntity<T extends Entity>(entity: T): Promise<string> {
    const session = this.getSession();
    try {
      const { provenance, ...entityProps } = entity;

      const query = `
        CREATE (e:${entity.type}:Entity $props)
        RETURN e.id as id
      `;
      const result = await this.runWithTimeout(session,query, { props: entityProps });
      const id = result.records[0]?.get('id');
      if (!id) {
        throw new GraphPersistenceError('Failed to create entity');
      }

      for (const prov of provenance || []) {
        const extractionId = generateId('ext');

        await this.runWithTimeout(session,`
          CREATE (ex:Extraction {
            id: $extractionId,
            sourceDocumentId: $sourceDocumentId,
            extractedBy: $extractedBy,
            extractedAt: $extractedAt,
            confidence: $confidence,
            section: $section,
            pageNumber: $pageNumber,
            lineRangeStart: $lineRangeStart,
            lineRangeEnd: $lineRangeEnd
          })
        `, {
          extractionId,
          sourceDocumentId: prov.sourceDocumentId,
          extractedBy: prov.extractedBy,
          extractedAt: prov.extractedAt,
          confidence: prov.confidence,
          section: prov.sourceReference.section,
          pageNumber: prov.sourceReference.pageNumber ?? null,
          lineRangeStart: prov.sourceReference.lineRange?.[0] ?? null,
          lineRangeEnd: prov.sourceReference.lineRange?.[1] ?? null,
        });

        await this.runWithTimeout(session,`
          MATCH (e:Entity {id: $entityId})
          MATCH (ex:Extraction {id: $extractionId})
          CREATE (e)-[:EXTRACTED_FROM]->(ex)
        `, { entityId: id, extractionId });

        await this.runWithTimeout(session,`
          MATCH (ex:Extraction {id: $extractionId})
          MATCH (doc:Document {id: $sourceDocumentId})
          CREATE (ex)-[:SOURCED_FROM]->(doc)
        `, { extractionId, sourceDocumentId: prov.sourceDocumentId });
      }

      logger.debug({ entityType: entity.type, id }, 'Created entity with extractions');
      return id;
    } catch (error) {
      logger.error({ entity, error }, 'Failed to create entity');
      throw new GraphPersistenceError('Entity creation failed', error);
    } finally {
      await session.close();
    }
  }

  async getEntity<T extends Entity>(id: string): Promise<T | null> {
    const session = this.getSession();
    try {
      const query = `
        MATCH (e:Entity {id: $id})
        OPTIONAL MATCH (e)-[:EXTRACTED_FROM]->(ex:Extraction)
        RETURN e, collect(ex) as extractions
      `;
      const result = await this.runWithTimeout(session,query, { id });
      if (result.records.length === 0) {
        return null;
      }

      const entityProps = result.records[0].get('e').properties;
      const extractions = result.records[0].get('extractions');

      const provenance: Provenance[] = extractions
        .filter((ex: any) => ex.properties)
        .map((ex: any) => ({
          sourceDocumentId: ex.properties.sourceDocumentId,
          extractedBy: ex.properties.extractedBy,
          extractedAt: ex.properties.extractedAt,
          confidence: ex.properties.confidence,
          sourceReference: {
            section: ex.properties.section,
            pageNumber: ex.properties.pageNumber,
            lineRange: ex.properties.lineRangeStart && ex.properties.lineRangeEnd
              ? [ex.properties.lineRangeStart, ex.properties.lineRangeEnd]
              : undefined,
          },
        }));

      return { ...entityProps, provenance } as T;
    } catch (error) {
      logger.error({ id, error }, 'Failed to get entity');
      throw new GraphPersistenceError('Entity retrieval failed', error);
    } finally {
      await session.close();
    }
  }

  async updateEntity<T extends Entity>(id: string, updates: Partial<T>): Promise<void> {
    const session = this.getSession();
    try {
      const updatesWithTimestamp = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      const query = `
        MATCH (e:Entity {id: $id})
        SET e += $updates
        RETURN e
      `;
      const result = await this.runWithTimeout(session, query, { id, updates: updatesWithTimestamp });
      if (result.records.length === 0) {
        throw new GraphPersistenceError(`Entity not found: ${id}`);
      }
      logger.debug({ id, updates }, 'Updated entity');
    } catch (error) {
      logger.error({ id, updates, error }, 'Failed to update entity');
      throw new GraphPersistenceError('Entity update failed', error);
    } finally {
      await session.close();
    }
  }

  async deleteEntity(id: string): Promise<void> {
    const session = this.getSession();
    try {
      const query = `
        MATCH (e:Entity {id: $id})
        DETACH DELETE e
      `;
      await this.runWithTimeout(session,query, { id });
      logger.debug({ id }, 'Deleted entity');
    } catch (error) {
      logger.error({ id, error }, 'Failed to delete entity');
      throw new GraphPersistenceError('Entity deletion failed', error);
    } finally {
      await session.close();
    }
  }

  async findDuplicateEntity<T extends Entity>(candidate: T): Promise<string | null> {
    const session = this.getSession();
    try {
      let query = '';
      let params: Record<string, unknown> = {};

      switch (candidate.type) {
        case 'Process':
          query = `
            MATCH (p:Process {name: $name, version: $version})
            WHERE NOT (p)-[:SUPERSEDES]->()
            RETURN p.id as id
            LIMIT 1
          `;
          params = { name: (candidate as any).name, version: (candidate as any).version };
          break;
        case 'Audit':
          query = `
            MATCH (a:Audit {auditDate: $auditDate})
            WHERE NOT (a)-[:SUPERSEDES]->()
            RETURN a.id as id
            LIMIT 1
          `;
          params = { auditDate: (candidate as any).auditDate };
          break;
        case 'FailureMode':
          query = `
            MATCH (fm:FailureMode {code: $code})
            WHERE NOT (fm)-[:SUPERSEDES]->()
            RETURN fm.id as id
            LIMIT 1
          `;
          params = { code: (candidate as any).code };
          break;
        case 'Document':
          query = `
            MATCH (d:Document {contentHash: $contentHash})
            RETURN d.id as id
            LIMIT 1
          `;
          params = { contentHash: (candidate as any).contentHash };
          break;
        case 'Requirement':
          query = `
            MATCH (req:Requirement {code: $code})
            WHERE NOT (req)-[:SUPERSEDES]->()
            RETURN req.id as id
            LIMIT 1
          `;
          params = { code: (candidate as any).code };
          break;
        case 'ProcedureStep':
          query = `
            MATCH (ps:ProcedureStep {stepNumber: $stepNumber, processId: $processId})
            WHERE NOT (ps)-[:SUPERSEDES]->()
            RETURN ps.id as id
            LIMIT 1
          `;
          params = { stepNumber: (candidate as any).stepNumber, processId: (candidate as any).processId };
          break;
        default:
          return null;
      }

      const result = await this.runWithTimeout(session,query, params);
      return result.records.length > 0 ? result.records[0].get('id') : null;
    } catch (error) {
      logger.error({ candidate, error }, 'Failed to find duplicate entity');
      throw new GraphPersistenceError('Duplicate check failed', error);
    } finally {
      await session.close();
    }
  }

  async createRelationship( // status param added
    from: string,
    to: string,
    type: RelationshipType,
    confidence: number,
    sourceReference: unknown,
    extractionContext: {
      sourceDocumentId: string;
      extractedBy: string;
    },
    properties?: Record<string, unknown>,
    status?: RelationshipStatus
  ): Promise<void> {
    const session = this.getSession();
    try {
      const sr = sourceReference as SourceReference;
      const extractionId = generateId('ext');

      await this.runWithTimeout(session,`
        CREATE (ex:Extraction {
          id: $extractionId,
          sourceDocumentId: $sourceDocumentId,
          extractedBy: $extractedBy,
          extractedAt: $extractedAt,
          confidence: $confidence,
          section: $section,
          pageNumber: $pageNumber,
          lineRangeStart: $lineRangeStart,
          lineRangeEnd: $lineRangeEnd
        })
      `, {
        extractionId,
        sourceDocumentId: extractionContext.sourceDocumentId,
        extractedBy: extractionContext.extractedBy,
        extractedAt: new Date().toISOString(),
        confidence,
        section: sr.section,
        pageNumber: sr.pageNumber ?? null,
        lineRangeStart: sr.lineRange?.[0] ?? null,
        lineRangeEnd: sr.lineRange?.[1] ?? null,
      });

      await this.runWithTimeout(session,`
        MATCH (ex:Extraction {id: $extractionId})
        MATCH (doc:Document {id: $sourceDocumentId})
        CREATE (ex)-[:SOURCED_FROM]->(doc)
      `, { extractionId, sourceDocumentId: extractionContext.sourceDocumentId });

      const relProps = {
        confidence,
        extractionId,
        ...properties,
        ...(status && { status }),
      };

      const query = `
        MATCH (a:Entity {id: $from})
        MATCH (b:Entity {id: $to})
        CREATE (a)-[r:${type} $props]->(b)
        RETURN r
      `;
      const result = await this.runWithTimeout(session,query, { from, to, props: relProps });
      if (result.records.length === 0) {
        throw new GraphPersistenceError('Failed to create relationship');
      }
      logger.debug({ from, to, type }, 'Created relationship');
    } catch (error) {
      logger.error({ from, to, type, error }, 'Failed to create relationship');
      throw new GraphPersistenceError('Relationship creation failed', error);
    } finally {
      await session.close();
    }
  }

  async createSimpleRelationships(
    relationships: Array<{
      from: string;
      to: string;
      type: RelationshipType;
      confidence: number;
    }>
  ): Promise<void> {
    if (relationships.length === 0) return;

    const session = this.getSession();
    try {
      for (let i = 0; i < relationships.length; i++) {
        const rel = relationships[i];
        logger.debug({
          index: i + 1,
          total: relationships.length,
          from: rel.from,
          to: rel.to,
          type: rel.type
        }, 'Creating simple relationship');

        const query = `
          MATCH (from {id: $from})
          MATCH (to {id: $to})
          CREATE (from)-[r:${rel.type} {confidence: $confidence}]->(to)
        `;
        await this.runWithTimeout(session,query, {
          from: rel.from,
          to: rel.to,
          confidence: rel.confidence,
        });

        logger.debug({ index: i + 1 }, 'Simple relationship created');
      }

      logger.debug({ count: relationships.length }, 'All simple relationships created');
    } catch (error) {
      logger.error({ count: relationships.length, error }, 'Failed to create simple relationships');
      throw new GraphPersistenceError('Simple relationship creation failed', error);
    } finally {
      await session.close();
    }
  }

  async getRelationships(entityId: string, direction: 'in' | 'out' | 'both' = 'both'): Promise<Relationship[]> {
    const session = this.getSession();
    try {
      let query = '';
      switch (direction) {
        case 'out':
          query = `
            MATCH (e:Entity {id: $entityId})-[r]->(target)
            OPTIONAL MATCH (ex:Extraction {id: r.extractionId})
            RETURN type(r) as type, r as rel, target.id as targetId, ex
          `;
          break;
        case 'in':
          query = `
            MATCH (source)-[r]->(e:Entity {id: $entityId})
            OPTIONAL MATCH (ex:Extraction {id: r.extractionId})
            RETURN type(r) as type, r as rel, source.id as sourceId, ex
          `;
          break;
        case 'both':
          query = `
            MATCH (e:Entity {id: $entityId})-[r]-(other)
            OPTIONAL MATCH (ex:Extraction {id: r.extractionId})
            RETURN type(r) as type, r as rel, other.id as otherId, ex
          `;
          break;
      }

      const result = await this.runWithTimeout(session,query, { entityId });
      return result.records.map(record => {
        const rel = record.get('rel').properties;
        const ex = record.get('ex')?.properties;

        const sourceReference: SourceReference | undefined = ex ? {
          section: ex.section,
          pageNumber: ex.pageNumber,
          lineRange: ex.lineRangeStart && ex.lineRangeEnd
            ? [ex.lineRangeStart, ex.lineRangeEnd]
            : undefined,
        } : undefined;

        return {
          from: direction === 'in' ? record.get('sourceId') : entityId,
          to: direction === 'out' ? record.get('targetId') : entityId,
          type: record.get('type') as RelationshipType,
          confidence: rel.confidence,
          sourceReference,
          properties: rel,
        };
      });
    } catch (error) {
      logger.error({ entityId, direction, error }, 'Failed to get relationships');
      throw new GraphPersistenceError('Relationship retrieval failed', error);
    } finally {
      await session.close();
    }
  }

  async getAuditSummary(auditId: string): Promise<AuditSummary> {
    const session = this.getSession();
    try {
      const query = `
        MATCH (a:Audit {id: $auditId})
        OPTIONAL MATCH (a)-[:EVALUATES]->(p:Process)
        OPTIONAL MATCH (a)-[:USES]->(d:Document)
        OPTIONAL MATCH (d)-[:IDENTIFIES]->(fm:FailureMode)
        OPTIONAL MATCH (fm)-[:IMPLIES]->(r:Risk {level: 'HIGH'})
        OPTIONAL MATCH (c:Control)-[:MITIGATES]->(fm)
        OPTIONAL MATCH (f:Finding)
        RETURN
          a,
          p.id as processId, p.name as processName, p.version as processVersion,
          collect(DISTINCT {id: d.id, documentType: d.documentType, uploadedAt: d.uploadedAt}) as documents,
          count(DISTINCT fm) as failureModeCount,
          count(DISTINCT r) as highRiskCount,
          count(DISTINCT c) as controlCount,
          count(DISTINCT f) as findingCount
      `;

      const result = await this.runWithTimeout(session,query, { auditId });
      if (result.records.length === 0) {
        throw new GraphPersistenceError(`Audit not found: ${auditId}`);
      }

      const record = result.records[0];
      return {
        auditId,
        process: record.get('processId')
          ? {
              id: record.get('processId'),
              name: record.get('processName'),
              version: record.get('processVersion'),
            }
          : undefined,
        documents: record.get('documents').filter((d: any) => d.id),
        statistics: {
          totalFailureModes: record.get('failureModeCount').toNumber(),
          highRisks: record.get('highRiskCount').toNumber(),
          controlsImplemented: record.get('controlCount').toNumber(),
          findings: record.get('findingCount').toNumber(),
        },
        relationships: {
          failureModesToRisks: 0,
          controlsToFailureModes: 0,
        },
      };
    } catch (error) {
      logger.error({ auditId, error }, 'Failed to get audit summary');
      throw new GraphPersistenceError('Audit summary retrieval failed', error);
    } finally {
      await session.close();
    }
  }

  async queryByPattern(params: {
    nodeLabel: string;
    properties?: Record<string, unknown>;
    limit?: number;
  }): Promise<Entity[]> {
    const session = this.getSession();
    try {
      const { nodeLabel, properties = {}, limit = 20 } = params;

      const whereClause = Object.keys(properties).length > 0
        ? 'WHERE ' + Object.keys(properties).map(key => `n.${key} = $${key}`).join(' AND ')
        : '';

      const query = `
        MATCH (n:${nodeLabel})
        ${whereClause}
        OPTIONAL MATCH (n)-[:EXTRACTED_FROM]->(ex:Extraction)
        RETURN n, collect(ex) as extractions
        LIMIT $limit
      `;

      const result = await this.runWithTimeout(session,query, { ...properties, limit: neo4j.int(limit) });
      return result.records.map(record => {
        const entityProps = record.get('n').properties;
        const extractions = record.get('extractions');

        const provenance: Provenance[] = extractions
          .filter((ex: any) => ex.properties)
          .map((ex: any) => ({
            sourceDocumentId: ex.properties.sourceDocumentId,
            extractedBy: ex.properties.extractedBy,
            extractedAt: ex.properties.extractedAt,
            confidence: ex.properties.confidence,
            sourceReference: {
              section: ex.properties.section,
              pageNumber: ex.properties.pageNumber,
              lineRange: ex.properties.lineRangeStart && ex.properties.lineRangeEnd
                ? [ex.properties.lineRangeStart, ex.properties.lineRangeEnd]
                : undefined,
            },
          }));

        return { ...entityProps, provenance } as Entity;
      });
    } catch (error) {
      logger.error({ params, error }, 'Failed to query by pattern');
      throw new GraphPersistenceError('Pattern query failed', error);
    } finally {
      await session.close();
    }
  }

  async getEntitiesByIds(ids: string[]): Promise<Entity[]> {
    const session = this.getSession();
    try {
      const query = `
        MATCH (n)
        WHERE n.id IN $ids
        OPTIONAL MATCH (n)-[:EXTRACTED_FROM]->(ex:Extraction)
        RETURN n, collect(ex) as extractions
      `;

      const result = await this.runWithTimeout(session,query, { ids });
      return result.records.map(record => {
        const entityProps = record.get('n').properties;
        const extractions = record.get('extractions');

        const provenance: Provenance[] = extractions
          .filter((ex: any) => ex.properties)
          .map((ex: any) => ({
            sourceDocumentId: ex.properties.sourceDocumentId,
            extractedBy: ex.properties.extractedBy,
            extractedAt: ex.properties.extractedAt,
            confidence: ex.properties.confidence,
            sourceReference: {
              section: ex.properties.section,
              pageNumber: ex.properties.pageNumber,
              lineRange: ex.properties.lineRangeStart && ex.properties.lineRangeEnd
                ? [ex.properties.lineRangeStart, ex.properties.lineRangeEnd]
                : undefined,
            },
          }));

        return { ...entityProps, provenance } as Entity;
      });
    } catch (error) {
      logger.error({ count: ids.length, error }, 'Failed to get entities by IDs');
      throw new GraphPersistenceError('Batch entity retrieval failed', error);
    } finally {
      await session.close();
    }
  }

  async expandRelationships(entityIds: string[], relationshipTypes?: RelationshipType[]): Promise<{
    entities: Entity[];
    relationships: Relationship[];
  }> {
    const session = this.getSession();
    try {
      const typeFilter = relationshipTypes && relationshipTypes.length > 0
        ? relationshipTypes.map(t => `type(r) = '${t}'`).join(' OR ')
        : '';

      const whereClause = typeFilter ? `WHERE ${typeFilter}` : '';

      const query = `
        MATCH (source)
        WHERE source.id IN $entityIds
        MATCH (source)-[r]-(target)
        ${whereClause}
        OPTIONAL MATCH (source)-[:EXTRACTED_FROM]->(sourceEx:Extraction)
        OPTIONAL MATCH (target)-[:EXTRACTED_FROM]->(targetEx:Extraction)
        OPTIONAL MATCH (relEx:Extraction {id: r.extractionId})
        RETURN source, collect(DISTINCT sourceEx) as sourceExtractions,
               target, collect(DISTINCT targetEx) as targetExtractions,
               r, relEx
      `;

      const result = await this.runWithTimeout(session,query, { entityIds });

      const entities = new Map<string, Entity>();
      const relationships: Relationship[] = [];

      const reconstructProvenance = (extractions: any[]): Provenance[] => {
        return extractions
          .filter((ex: any) => ex.properties)
          .map((ex: any) => ({
            sourceDocumentId: ex.properties.sourceDocumentId,
            extractedBy: ex.properties.extractedBy,
            extractedAt: ex.properties.extractedAt,
            confidence: ex.properties.confidence,
            sourceReference: {
              section: ex.properties.section,
              pageNumber: ex.properties.pageNumber,
              lineRange: ex.properties.lineRangeStart && ex.properties.lineRangeEnd
                ? [ex.properties.lineRangeStart, ex.properties.lineRangeEnd]
                : undefined,
            },
          }));
      };

      for (const record of result.records) {
        const sourceProps = record.get('source').properties;
        const targetProps = record.get('target').properties;
        const sourceExtractions = record.get('sourceExtractions');
        const targetExtractions = record.get('targetExtractions');

        const sourceEntity = {
          ...sourceProps,
          provenance: reconstructProvenance(sourceExtractions),
        } as Entity;

        const targetEntity = {
          ...targetProps,
          provenance: reconstructProvenance(targetExtractions),
        } as Entity;

        entities.set(sourceEntity.id, sourceEntity);
        entities.set(targetEntity.id, targetEntity);

        const rel = record.get('r').properties;
        const relType = record.get('r').type;
        const relEx = record.get('relEx')?.properties;

        const sourceReference: SourceReference | undefined = relEx ? {
          section: relEx.section,
          pageNumber: relEx.pageNumber,
          lineRange: relEx.lineRangeStart && relEx.lineRangeEnd
            ? [relEx.lineRangeStart, relEx.lineRangeEnd]
            : undefined,
        } : undefined;

        relationships.push({
          from: sourceEntity.id,
          to: targetEntity.id,
          type: relType as RelationshipType,
          confidence: rel.confidence,
          sourceReference,
          properties: rel,
        });
      }

      return {
        entities: Array.from(entities.values()),
        relationships,
      };
    } catch (error) {
      logger.error({ entityCount: entityIds.length, error }, 'Failed to expand relationships');
      throw new GraphPersistenceError('Relationship expansion failed', error);
    } finally {
      await session.close();
    }
  }

  async beginTransaction(): Promise<Transaction> {
    if (!this.driver) {
      throw new GraphPersistenceError('Neo4j driver not initialized');
    }
    const session = this.driver.session();
    const tx = session.beginTransaction();
    return {
      id: Math.random().toString(36).substring(7),
      session: { session, tx },
    };
  }

  async commit(transaction: Transaction): Promise<void> {
    try {
      const { session, tx } = transaction.session as any;
      await tx.commit();
      await session.close();
      logger.debug({ txId: transaction.id }, 'Transaction committed');
    } catch (error) {
      logger.error({ txId: transaction.id, error }, 'Transaction commit failed');
      throw new GraphPersistenceError('Transaction commit failed', error);
    }
  }

  async rollback(transaction: Transaction): Promise<void> {
    try {
      const { session, tx } = transaction.session as any;
      await tx.rollback();
      await session.close();
      logger.debug({ txId: transaction.id }, 'Transaction rolled back');
    } catch (error) {
      logger.error({ txId: transaction.id, error }, 'Transaction rollback failed');
      throw new GraphPersistenceError('Transaction rollback failed', error);
    }
  }

  async deleteFailedDocumentsOlderThan(hours: number): Promise<number> {
    const session = this.getSession();
    try {
      const threshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const result = await this.runWithTimeout(session, `
        MATCH (d:Document {status: 'FAILED'})
        WHERE d.updatedAt < $threshold
        OPTIONAL MATCH (ex:Extraction)-[:SOURCED_FROM]->(d)
        DETACH DELETE ex, d
        RETURN count(DISTINCT d) as deleted
      `, { threshold });
      return result.records[0]?.get('deleted')?.toNumber() || 0;
    } finally {
      await session.close();
    }
  }

  async runCoverageQuery(query: string, params?: Record<string, unknown>): Promise<Entity[]> {
    const session = this.getSession();
    try {
      const result = await this.runWithTimeout(session, query, params || {});
      return result.records.map(record => {
        const node = record.get(0);
        const props = node.properties;
        return {
          id: props.id,
          type: node.labels.find((l: string) => l !== 'Entity') || props.type,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
          provenance: [],
          ...props,
        } as Entity;
      });
    } finally {
      await session.close();
    }
  }
}
