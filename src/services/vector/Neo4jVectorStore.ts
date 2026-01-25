import neo4j, { Driver, Session } from 'neo4j-driver';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { VectorStore, VectorDocument, VectorSearchResult } from './VectorStore.interface.js';

const VECTOR_INDEX_NAME = 'chunk_embedding';
const BATCH_SIZE = 100;

export class Neo4jVectorStore implements VectorStore {
  private driver: Driver | null = null;

  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
      );
      await this.driver.verifyConnectivity();
      await this.ensureIndexes();
      logger.info('Connected to Neo4j vector store');
    } catch (error) {
      logger.error('Failed to connect to Neo4j vector store', error);
      throw new GraphPersistenceError('Neo4j vector store connection failed', error);
    }
  }

  private async ensureIndexes(): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(`
        CREATE VECTOR INDEX ${VECTOR_INDEX_NAME} IF NOT EXISTS
        FOR (c:Chunk) ON c.embedding
        OPTIONS { indexConfig: {
          \`vector.dimensions\`: ${config.embedding.dimension},
          \`vector.similarity_function\`: 'cosine'
        }}
      `);

      await session.run(`
        CREATE INDEX chunk_documentId IF NOT EXISTS FOR (c:Chunk) ON (c.documentId)
      `);

      await session.run(`
        CREATE INDEX chunk_graphNodeId IF NOT EXISTS FOR (c:Chunk) ON (c.graphNodeId)
      `);

      logger.info('Neo4j vector indexes ensured');
    } catch (error) {
      logger.error('Failed to create vector indexes', error);
      throw new GraphPersistenceError('Vector index creation failed', error);
    } finally {
      await session.close();
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      logger.info('Disconnected from Neo4j vector store');
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

  async upsertDocuments(docs: VectorDocument[]): Promise<void> {
    const session = this.getSession();
    try {
      const chunks = docs.map(doc => ({
        id: doc.id,
        embedding: doc.vector,
        graphNodeId: doc.payload.graphNodeId,
        documentId: doc.payload.documentId,
        chunkText: doc.payload.chunkText,
        chunkIndex: doc.payload.chunkIndex,
        metadata: JSON.stringify(doc.payload.metadata),
      }));

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        await session.run(`
          UNWIND $chunks AS chunk
          MERGE (c:Chunk {id: chunk.id})
          SET c.embedding = chunk.embedding,
              c.graphNodeId = chunk.graphNodeId,
              c.documentId = chunk.documentId,
              c.chunkText = chunk.chunkText,
              c.chunkIndex = chunk.chunkIndex,
              c.metadata = chunk.metadata
        `, { chunks: batch });
      }

      logger.debug({ count: docs.length }, 'Upserted vectors to Neo4j');
    } catch (error) {
      logger.error({ error, count: docs.length }, 'Failed to upsert vectors to Neo4j');
      throw new GraphPersistenceError('Vector upsert failed', error);
    } finally {
      await session.close();
    }
  }

  async search(
    query: number[],
    limit: number,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    const session = this.getSession();
    try {
      let whereClause = '';
      const params: Record<string, unknown> = {
        queryVector: query,
        limit: neo4j.int(limit),
      };

      if (filter && Object.keys(filter).length > 0) {
        const conditions = Object.entries(filter).map(([key, value], idx) => {
          params[`filter_${idx}`] = value;
          return `chunk.${key} = $filter_${idx}`;
        });
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      const cypher = `
        CALL db.index.vector.queryNodes('${VECTOR_INDEX_NAME}', $limit * 2, $queryVector)
        YIELD node AS chunk, score
        ${whereClause}
        RETURN chunk, score
        ORDER BY score DESC
        LIMIT $limit
      `;

      const result = await session.run(cypher, params);

      return result.records.map(record => {
        const chunk = record.get('chunk').properties;
        const score = record.get('score');
        const metadata = chunk.metadata ? JSON.parse(chunk.metadata) : {};

        return {
          id: chunk.id,
          score,
          payload: {
            graphNodeId: chunk.graphNodeId,
            documentId: chunk.documentId,
            chunkText: chunk.chunkText,
            chunkIndex: typeof chunk.chunkIndex === 'object' && 'toNumber' in chunk.chunkIndex
              ? chunk.chunkIndex.toNumber()
              : chunk.chunkIndex,
            metadata,
          },
        };
      });
    } catch (error) {
      logger.error({ error, limit }, 'Vector search failed in Neo4j');
      throw new GraphPersistenceError('Vector search failed', error);
    } finally {
      await session.close();
    }
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(`
        MATCH (c:Chunk {documentId: $documentId})
        DELETE c
      `, { documentId });

      logger.debug({ documentId }, 'Deleted vectors by documentId from Neo4j');
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete vectors from Neo4j');
      throw new GraphPersistenceError('Vector deletion failed', error);
    } finally {
      await session.close();
    }
  }

  async getChunksByGraphNodeIds(graphNodeIds: string[]): Promise<VectorDocument[]> {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (c:Chunk)
        WHERE c.graphNodeId IN $graphNodeIds
        RETURN c
      `, { graphNodeIds });

      const chunks: VectorDocument[] = result.records.map(record => {
        const chunk = record.get('c').properties;
        const metadata = chunk.metadata ? JSON.parse(chunk.metadata) : {};

        return {
          id: chunk.id,
          vector: chunk.embedding,
          payload: {
            graphNodeId: chunk.graphNodeId,
            documentId: chunk.documentId,
            chunkText: chunk.chunkText,
            chunkIndex: typeof chunk.chunkIndex === 'object' && 'toNumber' in chunk.chunkIndex
              ? chunk.chunkIndex.toNumber()
              : chunk.chunkIndex,
            metadata,
          },
        };
      });

      logger.debug({ nodeCount: graphNodeIds.length, chunkCount: chunks.length }, 'Retrieved chunks by graph node IDs from Neo4j');
      return chunks;
    } catch (error) {
      logger.error({ error, nodeCount: graphNodeIds.length }, 'Failed to get chunks by graph node IDs from Neo4j');
      throw new GraphPersistenceError('Vector retrieval failed', error);
    } finally {
      await session.close();
    }
  }

  async scrollAll(callback: (chunk: VectorDocument) => void): Promise<void> {
    const session = this.getSession();
    try {
      let offset = 0;
      let totalProcessed = 0;

      while (true) {
        const result = await session.run(`
          MATCH (c:Chunk)
          RETURN c
          ORDER BY c.id
          SKIP $offset
          LIMIT $limit
        `, { offset: neo4j.int(offset), limit: neo4j.int(BATCH_SIZE) });

        if (result.records.length === 0) break;

        for (const record of result.records) {
          const chunk = record.get('c').properties;
          const metadata = chunk.metadata ? JSON.parse(chunk.metadata) : {};

          callback({
            id: chunk.id,
            vector: chunk.embedding,
            payload: {
              graphNodeId: chunk.graphNodeId,
              documentId: chunk.documentId,
              chunkText: chunk.chunkText,
              chunkIndex: typeof chunk.chunkIndex === 'object' && 'toNumber' in chunk.chunkIndex
                ? chunk.chunkIndex.toNumber()
                : chunk.chunkIndex,
              metadata,
            },
          });
          totalProcessed++;
        }

        offset += BATCH_SIZE;
      }

      logger.debug({ totalProcessed }, 'Scrolled all chunks from Neo4j');
    } catch (error) {
      logger.error({ error }, 'Failed to scroll all chunks from Neo4j');
      throw new GraphPersistenceError('Vector scroll failed', error);
    } finally {
      await session.close();
    }
  }

  async countByFilter(filter: Record<string, unknown>): Promise<number> {
    const session = this.getSession();
    try {
      const params: Record<string, unknown> = {};
      const conditions = Object.entries(filter).map(([key, value], idx) => {
        params[`filter_${idx}`] = value;
        return `c.${key} = $filter_${idx}`;
      });

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await session.run(`
        MATCH (c:Chunk)
        ${whereClause}
        RETURN count(c) AS count
      `, params);

      const count = result.records[0]?.get('count');
      const countNum = typeof count === 'object' && 'toNumber' in count ? count.toNumber() : count;

      logger.debug({ filter, count: countNum }, 'Counted chunks by filter in Neo4j');
      return countNum;
    } catch (error) {
      logger.error({ error, filter }, 'Failed to count by filter in Neo4j');
      throw new GraphPersistenceError('Vector count failed', error);
    } finally {
      await session.close();
    }
  }
}
