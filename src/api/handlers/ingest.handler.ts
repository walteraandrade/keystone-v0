import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';
import type { IngestionOrchestrator } from '../../services/ingestion/IngestionOrchestrator.js';

export function createIngestHandler(orchestrator: IngestionOrchestrator) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'No file uploaded',
        });
      }

      const buffer = await data.toBuffer();
      const tempPath = `/tmp/${Date.now()}_${data.filename}`;
      await require('fs/promises').writeFile(tempPath, buffer);

      const metadataField = (request.body as any)?.metadata;
      let metadata = {};
      if (metadataField) {
        try {
          metadata = typeof metadataField === 'string' ? JSON.parse(metadataField) : metadataField;
        } catch {
          logger.warn('Failed to parse metadata, using empty object');
        }
      }

      logger.info({ fileName: data.filename, size: buffer.length }, 'Received file upload');

      const result = await orchestrator.ingest(tempPath, data.filename, metadata);

      await require('fs/promises').unlink(tempPath).catch(() => {});

      if (result.status === 'failed') {
        return reply.code(500).send(result);
      }

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Ingest handler error');

      if (error instanceof ValidationError) {
        return reply.code(400).send({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
