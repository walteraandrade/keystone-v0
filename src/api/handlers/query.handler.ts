import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { HybridQueryService } from '../../services/query/HybridQueryService.js';
import type {
  SemanticSearchParams,
  ContextOptions,
  AnalyticsParams,
  GraphPatternParams,
} from '../../services/query/types.js';

export function createSemanticSearchHandler(hybridQuery: HybridQueryService) {
  return async (
    request: FastifyRequest<{ Body: SemanticSearchParams }>,
    reply: FastifyReply
  ) => {
    try {
      const params = request.body;
      logger.debug({ params }, 'Semantic search request');

      const result = await hybridQuery.semanticSearchWithExpansion(params);

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Semantic search handler error');

      return reply.code(500).send({
        error: 'SEARCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createEntityContextHandler(hybridQuery: HybridQueryService) {
  return async (
    request: FastifyRequest<{ Params: { id: string }; Querystring: ContextOptions }>,
    reply: FastifyReply
  ) => {
    try {
      const { id } = request.params;
      const options = request.query;

      logger.debug({ id, options }, 'Entity context request');

      const result = await hybridQuery.getEntityWithContext(id, options);

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Entity context handler error');

      if (error instanceof GraphPersistenceError && error.message.includes('not found')) {
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

export function createAnalyticsHandler(hybridQuery: HybridQueryService) {
  return async (
    request: FastifyRequest<{ Querystring: AnalyticsParams }>,
    reply: FastifyReply
  ) => {
    try {
      const params = request.query;
      logger.debug({ params }, 'Analytics request');

      const result = await hybridQuery.getOntologyAnalytics(params);

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Analytics handler error');

      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createGraphPatternHandler(hybridQuery: HybridQueryService) {
  return async (
    request: FastifyRequest<{ Body: GraphPatternParams }>,
    reply: FastifyReply
  ) => {
    try {
      const params = request.body;
      logger.debug({ params }, 'Graph pattern query request');

      const result = await hybridQuery.queryGraphPattern(params);

      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Graph pattern handler error');

      return reply.code(500).send({
        error: 'QUERY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
