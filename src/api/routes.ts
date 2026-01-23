import type { FastifyInstance } from 'fastify';
import { createIngestHandler } from './handlers/ingest.handler.js';
import { createAuditSummaryHandler } from './handlers/audit.handler.js';
import { createCleanupHandler } from './handlers/admin.handler.js';
import { createCoverageHandler, createCoverageListHandler } from './handlers/coverage.handler.js';
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
import type { CleanupService } from '../services/ingestion/CleanupService.js';
import type { CoverageQueryRegistry } from '../services/query/CoverageQueryRegistry.js';
import type { AuditorAnalyticsService } from '../services/analytics/AuditorAnalyticsService.js';
import {
  createPortfolioAnalyticsHandler,
  createRiskExposureHandler,
  createControlEffectivenessHandler,
  createFailureModeAnalysisHandler,
  createFindingTrendsHandler,
  createComplianceStatusHandler,
  createProcessHealthHandler,
  createCrossDocumentEntitiesHandler,
  createDocumentCoverageHandler,
  createSharedEntityNetworkHandler,
  createEntityProvenanceHandler,
  createFPSMaturityHandler,
} from './handlers/auditor-analytics.handler.js';
import {
  portfolioAnalyticsResponseSchema,
  riskExposureResponseSchema,
  controlEffectivenessResponseSchema,
  failureModeAnalysisResponseSchema,
  findingTrendsResponseSchema,
  complianceStatusResponseSchema,
  processHealthResponseSchema,
} from './schemas/auditor-analytics.schema.js';

export async function registerRoutes(
  fastify: FastifyInstance,
  orchestrator: IngestionOrchestrator,
  graphRepo: GraphRepository,
  hybridQuery: HybridQueryService,
  cleanupService?: CleanupService,
  coverageRegistry?: CoverageQueryRegistry,
  auditorAnalytics?: AuditorAnalyticsService
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

  if (cleanupService) {
    fastify.post('/admin/cleanup', {
      handler: createCleanupHandler(cleanupService),
    });
  }

  if (coverageRegistry) {
    fastify.get('/coverage', {
      handler: createCoverageListHandler(coverageRegistry),
    });

    fastify.get('/coverage/:queryName', {
      handler: createCoverageHandler(coverageRegistry),
    });
  }

  if (auditorAnalytics) {
    fastify.get('/analytics/audit/portfolio', {
      handler: createPortfolioAnalyticsHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/risk-exposure', {
      handler: createRiskExposureHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/control-effectiveness', {
      handler: createControlEffectivenessHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/failure-modes', {
      handler: createFailureModeAnalysisHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/findings', {
      handler: createFindingTrendsHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/compliance', {
      handler: createComplianceStatusHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/process-health', {
      handler: createProcessHealthHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/cross-document-entities', {
      handler: createCrossDocumentEntitiesHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/document-coverage', {
      handler: createDocumentCoverageHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/shared-network', {
      handler: createSharedEntityNetworkHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/provenance/:entityId', {
      handler: createEntityProvenanceHandler(auditorAnalytics),
    });

    fastify.get('/analytics/audit/fps-maturity', {
      handler: createFPSMaturityHandler(auditorAnalytics),
    });
  }
}
