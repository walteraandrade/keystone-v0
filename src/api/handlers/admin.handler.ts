import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import type { CleanupService } from '../../services/ingestion/CleanupService.js';

interface CleanupBody {
  olderThanHours?: number;
}

export function createCleanupHandler(cleanupService: CleanupService) {
  return async (
    request: FastifyRequest<{ Body: CleanupBody }>,
    reply: FastifyReply
  ) => {
    try {
      const { olderThanHours = 24 } = request.body || {};

      logger.info({ olderThanHours }, 'Admin cleanup requested');

      const deleted = await cleanupService.cleanupFailedDocuments(olderThanHours);

      return reply.code(200).send({
        success: true,
        deleted,
        message: `Cleaned up ${deleted} failed documents older than ${olderThanHours} hours`,
      });
    } catch (error) {
      logger.error({ error }, 'Admin cleanup handler error');

      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
