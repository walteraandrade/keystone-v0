import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { Neo4jRepository } from './services/graph/Neo4jRepository.js';
import { QdrantVectorStore } from './services/vector/QdrantVectorStore.js';
import { EmbeddingService } from './services/vector/EmbeddingService.js';
import { FileSystemStorage } from './services/storage/FileSystemStorage.js';
import { LLMServiceFactory } from './services/llm/LLMServiceFactory.js';
import { IngestionOrchestrator } from './services/ingestion/IngestionOrchestrator.js';
import { HybridQueryService } from './services/query/HybridQueryService.js';
import { BunSQLiteService } from './services/extraction/BunSQLiteService.js';
import { CleanupService } from './services/ingestion/CleanupService.js';
import { CoverageQueryRegistry } from './services/query/CoverageQueryRegistry.js';
import { registerRoutes } from './api/routes.js';

const fastify = Fastify({
  logger: logger as any,
});

await fastify.register(multipart, {
  limits: {
    fileSize: config.storage.maxUploadSizeMB * 1024 * 1024,
  },
});

logger.info('Initializing services...');

const graphRepo = new Neo4jRepository();
await graphRepo.connect();

const vectorStore = new QdrantVectorStore();
await vectorStore.connect();

const docStorage = new FileSystemStorage();
await docStorage.init();

const llmService = LLMServiceFactory.createLLMService();

const embeddingService = new EmbeddingService();

const extractionLogger = config.extractionLog.enabled
  ? new BunSQLiteService(config.extractionLog.dbPath)
  : undefined;

const orchestrator = new IngestionOrchestrator(
  graphRepo,
  docStorage,
  vectorStore,
  llmService,
  extractionLogger
);

const hybridQuery = new HybridQueryService(
  graphRepo,
  vectorStore,
  embeddingService
);

const cleanupService = new CleanupService(graphRepo);

const coverageRegistry = new CoverageQueryRegistry(graphRepo as any);

logger.info('Services initialized');

if (config.cleanup.enabled) {
  logger.info('Running startup cleanup...');
  const deleted = await cleanupService.cleanupFailedDocuments(config.cleanup.olderThanHours);
  logger.info({ deleted }, 'Startup cleanup complete');
}

fastify.get('/health', async () => {
  const neo4jOk = await graphRepo.testConnection();
  const qdrantOk = await vectorStore.testConnection();
  const llmOk = await llmService.testConnection();
  const sqliteOk = extractionLogger ? extractionLogger.testConnection() : true;

  return {
    status: neo4jOk && qdrantOk && llmOk && sqliteOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
    services: {
      neo4j: neo4jOk,
      qdrant: qdrantOk,
      llm: llmOk,
      sqlite: sqliteOk,
    },
  };
});

await registerRoutes(fastify as any, orchestrator, graphRepo, hybridQuery, cleanupService, coverageRegistry);

fastify.setErrorHandler((error, request, reply) => {
  logger.error({ error, url: request.url }, 'Request error');
  reply.code(500).send({
    error: 'INTERNAL_ERROR',
    message: error.message,
  });
});

const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  await fastify.close();
  await graphRepo.disconnect();
  await vectorStore.disconnect();
  extractionLogger?.close();
  logger.info('Shutdown complete');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await fastify.listen({
    port: config.server.port,
    host: '0.0.0.0',
  });
  logger.info(`Server listening on port ${config.server.port}`);
} catch (err) {
  logger.error(err);
  process.exit(1);
}
