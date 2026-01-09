import type { FastifyInstance } from 'fastify';
import { createIngestHandler } from './handlers/ingest.handler.js';
import { createAuditSummaryHandler } from './handlers/audit.handler.js';
import {
  createSemanticSearchHandler,
  createEntityContextHandler,
  createAnalyticsHandler,
  createGraphPatternHandler,
} from './handlers/query.handler.js';
import { ingestResponseSchema, ingestErrorSchema } from './schemas/ingest.schema.js';
import { auditSummaryParamsSchema, auditSummaryResponseSchema } from './schemas/audit.schema.js';
import {
  semanticSearchRequestSchema,
  entityContextParamsSchema,
  analyticsQuerySchema,
  graphPatternRequestSchema,
} from './schemas/query.schema.js';
import type { IngestionOrchestrator } from '../services/ingestion/IngestionOrchestrator.js';
import type { GraphRepository } from '../services/graph/GraphRepository.interface.js';
import type { HybridQueryService } from '../services/query/HybridQueryService.js';

export async function registerRoutes(
  fastify: FastifyInstance,
  orchestrator: IngestionOrchestrator,
  graphRepo: GraphRepository,
  hybridQuery: HybridQueryService
) {
  fastify.post('/ingest', {
    schema: {
      response: {
        200: ingestResponseSchema,
        400: ingestErrorSchema,
        500: ingestErrorSchema,
      },
    },
    handler: createIngestHandler(orchestrator),
  });

  fastify.get('/audit/:id/summary', {
    schema: {
      params: auditSummaryParamsSchema,
      response: {
        200: auditSummaryResponseSchema,
        404: ingestErrorSchema,
        500: ingestErrorSchema,
      },
    },
    handler: createAuditSummaryHandler(graphRepo),
  });

  fastify.post('/query/semantic', {
    schema: {
      body: semanticSearchRequestSchema,
    },
    handler: createSemanticSearchHandler(hybridQuery),
  });

  fastify.get('/entities/:id/context', {
    schema: {
      params: entityContextParamsSchema,
    },
    handler: createEntityContextHandler(hybridQuery),
  });

  fastify.get('/analytics/ontology', {
    schema: {
      querystring: analyticsQuerySchema,
    },
    handler: createAnalyticsHandler(hybridQuery),
  });

  fastify.post('/query/graph', {
    schema: {
      body: graphPatternRequestSchema,
    },
    handler: createGraphPatternHandler(hybridQuery),
  });
}
