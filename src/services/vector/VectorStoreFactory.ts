import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { VectorStore } from './VectorStore.interface.js';
import { QdrantVectorStore } from './QdrantVectorStore.js';
import { Neo4jVectorStore } from './Neo4jVectorStore.js';

export const createVectorStore = (): VectorStore => {
  const provider = config.vectorStore.provider;
  logger.info({ provider }, 'Creating vector store');

  switch (provider) {
    case 'qdrant':
      logger.warn('Qdrant vector store is deprecated; migrate to neo4j');
      return new QdrantVectorStore();
    case 'neo4j':
    default:
      return new Neo4jVectorStore();
  }
};
