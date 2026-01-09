import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { VectorStore, VectorDocument, VectorSearchResult } from './VectorStore.interface.js';

export class QdrantVectorStore implements VectorStore {
  private client: QdrantClient | null = null;
  private collectionName: string;

  constructor() {
    this.collectionName = config.qdrant.collection;
  }

  async connect(): Promise<void> {
    try {
      this.client = new QdrantClient({ url: config.qdrant.url });

      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: config.embedding.dimension,
            distance: 'Cosine',
          },
        });
        logger.info({ collection: this.collectionName }, 'Created Qdrant collection');
      }

      logger.info('Connected to Qdrant');
    } catch (error) {
      logger.error('Failed to connect to Qdrant', error);
      throw new GraphPersistenceError('Qdrant connection failed', error);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    logger.info('Disconnected from Qdrant');
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  private getClient(): QdrantClient {
    if (!this.client) {
      throw new GraphPersistenceError('Qdrant client not initialized');
    }
    return this.client;
  }

  async upsertDocuments(docs: VectorDocument[]): Promise<void> {
    const client = this.getClient();
    try {
      const points = docs.map(doc => ({
        id: doc.id,
        vector: doc.vector,
        payload: doc.payload,
      }));

      await client.upsert(this.collectionName, {
        wait: true,
        points,
      });

      logger.debug({ count: docs.length }, 'Upserted vectors to Qdrant');
    } catch (error) {
      logger.error({ error, count: docs.length }, 'Failed to upsert vectors');
      throw new GraphPersistenceError('Vector upsert failed', error);
    }
  }

  async search(
    query: number[],
    limit: number,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    const client = this.getClient();
    try {
      const response = await client.search(this.collectionName, {
        vector: query,
        limit,
        filter: filter ? { must: Object.entries(filter).map(([key, value]) => ({
          key: `payload.${key}`,
          match: { value },
        }))} : undefined,
        with_payload: true,
      });

      return response.map(result => ({
        id: result.id as string,
        score: result.score,
        payload: result.payload as VectorDocument['payload'],
      }));
    } catch (error) {
      logger.error({ error, limit }, 'Vector search failed');
      throw new GraphPersistenceError('Vector search failed', error);
    }
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'payload.documentId',
              match: { value: documentId },
            },
          ],
        },
      });

      logger.debug({ documentId }, 'Deleted vectors by documentId');
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to delete vectors');
      throw new GraphPersistenceError('Vector deletion failed', error);
    }
  }

  async getChunksByGraphNodeIds(graphNodeIds: string[]): Promise<VectorDocument[]> {
    const client = this.getClient();
    try {
      const chunks: VectorDocument[] = [];

      for (const nodeId of graphNodeIds) {
        const response = await client.scroll(this.collectionName, {
          filter: {
            must: [
              {
                key: 'graphNodeId',
                match: { value: nodeId },
              },
            ],
          },
          with_payload: true,
          with_vector: true,
          limit: 100,
        });

        for (const point of response.points) {
          chunks.push({
            id: point.id as string,
            vector: point.vector as number[],
            payload: point.payload as VectorDocument['payload'],
          });
        }
      }

      logger.debug({ nodeCount: graphNodeIds.length, chunkCount: chunks.length }, 'Retrieved chunks by graph node IDs');
      return chunks;
    } catch (error) {
      logger.error({ error, nodeCount: graphNodeIds.length }, 'Failed to get chunks by graph node IDs');
      throw new GraphPersistenceError('Vector retrieval failed', error);
    }
  }

  async scrollAll(callback: (chunk: VectorDocument) => void): Promise<void> {
    const client = this.getClient();
    try {
      let offset: string | number | undefined = undefined;
      let hasMore = true;
      let totalProcessed = 0;

      while (hasMore) {
        const response = await client.scroll(this.collectionName, {
          offset,
          limit: 100,
          with_payload: true,
          with_vector: true,
        });

        for (const point of response.points) {
          callback({
            id: point.id as string,
            vector: point.vector as number[],
            payload: point.payload as VectorDocument['payload'],
          });
          totalProcessed++;
        }

        offset = response.next_page_offset;
        hasMore = offset !== null && offset !== undefined;
      }

      logger.debug({ totalProcessed }, 'Scrolled all chunks');
    } catch (error) {
      logger.error({ error }, 'Failed to scroll all chunks');
      throw new GraphPersistenceError('Vector scroll failed', error);
    }
  }

  async countByFilter(filter: Record<string, unknown>): Promise<number> {
    const client = this.getClient();
    try {
      const qdrantFilter = {
        must: Object.entries(filter).map(([key, value]) => ({
          key,
          match: { value },
        })),
      };

      const response = await client.scroll(this.collectionName, {
        filter: qdrantFilter,
        limit: 1,
        with_payload: false,
        with_vector: false,
      });

      let count = response.points.length;
      let offset = response.next_page_offset;

      while (offset !== null && offset !== undefined) {
        const nextResponse = await client.scroll(this.collectionName, {
          offset,
          filter: qdrantFilter,
          limit: 100,
          with_payload: false,
          with_vector: false,
        });
        count += nextResponse.points.length;
        offset = nextResponse.next_page_offset;
      }

      logger.debug({ filter, count }, 'Counted chunks by filter');
      return count;
    } catch (error) {
      logger.error({ error, filter }, 'Failed to count by filter');
      throw new GraphPersistenceError('Vector count failed', error);
    }
  }
}
