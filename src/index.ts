import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const fastify = Fastify({
  logger,
});

await fastify.register(multipart, {
  limits: {
    fileSize: config.storage.maxUploadSizeMB * 1024 * 1024,
  },
});

fastify.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
  };
});

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
