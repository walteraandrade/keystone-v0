import type { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { AuditorAnalyticsService } from '../../services/analytics/AuditorAnalyticsService.js';

export function createPortfolioAnalyticsHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Portfolio analytics request');
      const result = await analyticsService.getPortfolioAnalytics();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Portfolio analytics handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createRiskExposureHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Risk exposure analytics request');
      const result = await analyticsService.getRiskExposure();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Risk exposure handler error');
      if (error instanceof GraphPersistenceError) {
        return reply.code(500).send({
          error: 'ANALYTICS_ERROR',
          message: error.message,
        });
      }
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createControlEffectivenessHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Control effectiveness analytics request');
      const result = await analyticsService.getControlEffectiveness();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Control effectiveness handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createFailureModeAnalysisHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Failure mode analysis request');
      const result = await analyticsService.getFailureModeAnalysis();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Failure mode analysis handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createFindingTrendsHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Finding trends analytics request');
      const result = await analyticsService.getFindingTrends();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Finding trends handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createComplianceStatusHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Compliance status analytics request');
      const result = await analyticsService.getComplianceStatus();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Compliance status handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createProcessHealthHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Process health analytics request');
      const result = await analyticsService.getProcessHealth();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Process health handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createCrossDocumentEntitiesHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Cross-document entities analytics request');
      const result = await analyticsService.getCrossDocumentEntities();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Cross-document entities handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createDocumentCoverageHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Document coverage analytics request');
      const result = await analyticsService.getDocumentCoverage();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Document coverage handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createSharedEntityNetworkHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('Shared entity network analytics request');
      const result = await analyticsService.getSharedEntityNetwork();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Shared entity network handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createEntityProvenanceHandler(analyticsService: AuditorAnalyticsService) {
  return async (request: FastifyRequest<{ Params: { entityId: string } }>, reply: FastifyReply) => {
    try {
      const { entityId } = request.params;
      logger.debug({ entityId }, 'Entity provenance request');
      const result = await analyticsService.getEntityProvenance(entityId);
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'Entity provenance handler error');
      if (error instanceof GraphPersistenceError && error.message.includes('not found')) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: error.message,
        });
      }
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

export function createFPSMaturityHandler(analyticsService: AuditorAnalyticsService) {
  return async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      logger.debug('FPS maturity analytics request');
      const result = await analyticsService.getFPSMaturity();
      return reply.code(200).send(result);
    } catch (error) {
      logger.error({ error }, 'FPS maturity handler error');
      return reply.code(500).send({
        error: 'ANALYTICS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
