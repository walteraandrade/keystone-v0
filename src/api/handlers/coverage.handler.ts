import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import type { CoverageQueryRegistry, CoverageQueryName } from '../../services/query/CoverageQueryRegistry.js';

interface CoverageParams {
  queryName: CoverageQueryName;
}

interface CoverageQuerystring {
  threshold?: number;
  documentId?: string;
  iparId?: string;
}

export function createCoverageHandler(coverageRegistry: CoverageQueryRegistry) {
  return async (
    request: FastifyRequest<{ Params: CoverageParams; Querystring: CoverageQuerystring }>,
    reply: FastifyReply
  ) => {
    try {
      const { queryName } = request.params;
      const { threshold, documentId, iparId } = request.query;

      logger.debug({ queryName, threshold, documentId, iparId }, 'Coverage query requested');

      const params: Record<string, unknown> = {};
      if (threshold !== undefined) params.threshold = threshold;
      if (documentId !== undefined) params.documentId = documentId;
      if (iparId !== undefined) params.iparId = iparId;

      const result = await coverageRegistry.execute(queryName, Object.keys(params).length > 0 ? params : undefined);

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Coverage handler error');

      if (error instanceof Error && (error.message.includes('Unknown coverage query') || error.message.includes('parameter is required'))) {
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
