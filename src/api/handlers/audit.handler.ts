import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { GraphRepository } from '../../services/graph/GraphRepository.interface.js';

interface AuditParams {
  id: string;
}

export function createAuditSummaryHandler(graphRepo: GraphRepository) {
  return async (
    request: FastifyRequest<{ Params: AuditParams }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;

      logger.debug({ auditId: id }, 'Fetching audit summary');

      const summary = await graphRepo.getAuditSummary(id);

      return reply.code(200).send(summary);
    } catch (error) {
      logger.error({ error }, 'Audit summary handler error');

      if (error instanceof GraphPersistenceError) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: error.message,
        });
      }

      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
