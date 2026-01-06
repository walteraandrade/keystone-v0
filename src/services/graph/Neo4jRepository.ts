import neo4j, { Driver, Session } from 'neo4j-driver';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { Entity } from '../../domain/entities/index.js';
import type { Relationship, RelationshipType } from '../../domain/relationships/types.js';
import type { GraphRepository, Transaction, AuditSummary } from './GraphRepository.interface.js';

export class Neo4jRepository implements GraphRepository {
  private driver: Driver | null = null;

  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
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

  async createEntity<T extends Entity>(entity: T): Promise<string> {
    const session = this.getSession();
    try {
      const query = `
        CREATE (e:${entity.type}:Entity $props)
        RETURN e.id as id
      `;
      const result = await session.run(query, { props: entity });
      const id = result.records[0]?.get('id');
      if (!id) {
        throw new GraphPersistenceError('Failed to create entity');
      }
      logger.debug({ entityType: entity.type, id }, 'Created entity');
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
        RETURN e
      `;
      const result = await session.run(query, { id });
      if (result.records.length === 0) {
        return null;
      }
      return result.records[0].get('e').properties as T;
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
      const query = `
        MATCH (e:Entity {id: $id})
        SET e += $updates, e.updatedAt = datetime()
        RETURN e
      `;
      const result = await session.run(query, { id, updates });
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
      await session.run(query, { id });
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
        default:
          return null;
      }

      const result = await session.run(query, params);
      return result.records.length > 0 ? result.records[0].get('id') : null;
    } catch (error) {
      logger.error({ candidate, error }, 'Failed to find duplicate entity');
      throw new GraphPersistenceError('Duplicate check failed', error);
    } finally {
      await session.close();
    }
  }

  async createRelationship(
    from: string,
    to: string,
    type: RelationshipType,
    confidence: number,
    sourceReference: unknown,
    properties?: Record<string, unknown>
  ): Promise<void> {
    const session = this.getSession();
    try {
      const relProps = {
        confidence,
        sourceReference,
        ...properties,
      };

      const query = `
        MATCH (a:Entity {id: $from})
        MATCH (b:Entity {id: $to})
        CREATE (a)-[r:${type} $props]->(b)
        RETURN r
      `;
      const result = await session.run(query, { from, to, props: relProps });
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

  async getRelationships(entityId: string, direction: 'in' | 'out' | 'both' = 'both'): Promise<Relationship[]> {
    const session = this.getSession();
    try {
      let query = '';
      switch (direction) {
        case 'out':
          query = `
            MATCH (e:Entity {id: $entityId})-[r]->(target)
            RETURN type(r) as type, r as rel, target.id as targetId
          `;
          break;
        case 'in':
          query = `
            MATCH (source)-[r]->(e:Entity {id: $entityId})
            RETURN type(r) as type, r as rel, source.id as sourceId
          `;
          break;
        case 'both':
          query = `
            MATCH (e:Entity {id: $entityId})-[r]-(other)
            RETURN type(r) as type, r as rel, other.id as otherId
          `;
          break;
      }

      const result = await session.run(query, { entityId });
      return result.records.map(record => {
        const rel = record.get('rel').properties;
        return {
          from: direction === 'in' ? record.get('sourceId') : entityId,
          to: direction === 'out' ? record.get('targetId') : entityId,
          type: record.get('type') as RelationshipType,
          confidence: rel.confidence,
          sourceReference: rel.sourceReference,
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

      const result = await session.run(query, { auditId });
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
}
