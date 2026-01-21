import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import type { CoverageQueryRegistry, CoverageQueryName } from '../../services/query/CoverageQueryRegistry.js';

interface CoverageParams {
  queryName: CoverageQueryName;
}

interface CoverageQuerystring {
  threshold?: number;
}

export function createCoverageHandler(coverageRegistry: CoverageQueryRegistry) {
  return async (
    request: FastifyRequest<{ Params: CoverageParams; Querystring: CoverageQuerystring }>,
    reply: FastifyReply
  ) => {
    try {
      const { queryName } = request.params;
      const { threshold } = request.query;

      logger.debug({ queryName, threshold }, 'Coverage query requested');

      const params = threshold !== undefined ? { threshold } : undefined;
      const result = await coverageRegistry.execute(queryName, params);

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Coverage handler error');

      if (error instanceof Error && error.message.includes('Unknown coverage query')) {
        return reply.code(400).send({
          error: 'BAD_REQUEST',
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

export function createCoverageListHandler(coverageRegistry: CoverageQueryRegistry) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    const queries = coverageRegistry.getAvailableQueries();
    return reply.code(200).send({ queries });
  };
}
