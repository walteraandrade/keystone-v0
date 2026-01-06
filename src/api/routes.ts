import type { FastifyInstance } from 'fastify';
import { createIngestHandler } from './handlers/ingest.handler.js';
import { createAuditSummaryHandler } from './handlers/audit.handler.js';
import { ingestResponseSchema, ingestErrorSchema } from './schemas/ingest.schema.js';
import { auditSummaryParamsSchema, auditSummaryResponseSchema } from './schemas/audit.schema.js';
import type { IngestionOrchestrator } from '../services/ingestion/IngestionOrchestrator.js';
import type { GraphRepository } from '../services/graph/GraphRepository.interface.js';

export async function registerRoutes(
  fastify: FastifyInstance,
  orchestrator: IngestionOrchestrator,
  graphRepo: GraphRepository
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
}
