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
}
