import { logger } from '../../utils/logger.js';
import { GraphPersistenceError } from '../../utils/errors.js';
import type { GraphRepository } from '../graph/GraphRepository.interface.js';
import type {
  PortfolioRiskExposure,
  ControlEffectiveness,
  FailureModeAnalysis,
  FindingTrends,
  ComplianceStatus,
  ProcessHealth,
  PortfolioAnalytics,
  TimeSeriesData,
  CrossDocumentEntities,
  DocumentCoverageAnalysis,
  SharedEntityNetwork,
  EntityProvenance,
  FPSMaturity,
} from './types.js';
import type { Risk, RiskLevel } from '../../domain/entities/Risk.js';
import type { Control, ControlType } from '../../domain/entities/Control.js';
import type { FailureMode } from '../../domain/entities/FailureMode.js';
import type { Finding, FindingStatus, FindingPriority } from '../../domain/entities/Finding.js';
import type { Requirement, RequirementType } from '../../domain/entities/Requirement.js';
import type { Process } from '../../domain/entities/Process.js';
import type { DocumentType } from '../../domain/entities/Document.js';
import type { Entity } from '../../domain/entities/index.js';
import {
  RISK_EXPOSURE_QUERY,
  CONTROL_EFFECTIVENESS_QUERY,
  FAILURE_MODE_ANALYSIS_QUERY,
  FINDING_TRENDS_QUERY,
  COMPLIANCE_STATUS_QUERY,
  PROCESS_HEALTH_QUERY,
  RISK_TRENDS_QUERY,
  FINDING_RESOLUTION_TRENDS_QUERY,
  CROSS_DOCUMENT_ENTITIES_QUERY,
  DOCUMENT_COVERAGE_QUERY,
  SHARED_ENTITY_NETWORK_QUERY,
  ENTITY_PROVENANCE_QUERY,
  FPS_MATURITY_QUERY,
} from '../graph/queries/auditor-analytics-queries.js';

export class AuditorAnalyticsService {
  constructor(private graphRepo: GraphRepository) {}

  async getPortfolioAnalytics(): Promise<PortfolioAnalytics> {
    try {
      logger.debug('Generating portfolio analytics');

      const [
        riskExposure,
        controlEffectiveness,
        failureModeAnalysis,
        findingTrends,
        complianceStatus,
        processHealth,
      ] = await Promise.all([
        this.getRiskExposure(),
        this.getControlEffectiveness(),
        this.getFailureModeAnalysis(),
        this.getFindingTrends(),
        this.getComplianceStatus(),
        this.getProcessHealth(),
      ]);

      return {
        riskExposure,
        controlEffectiveness,
        failureModeAnalysis,
        findingTrends,
        complianceStatus,
        processHealth,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate portfolio analytics');
      throw new GraphPersistenceError('Portfolio analytics failed', error);
    }
  }

  async getRiskExposure(): Promise<PortfolioRiskExposure> {
    try {
      const results = await this.graphRepo.executeQuery<{
        r: any;
        level: RiskLevel;
        isImplied: boolean;
        hasControl: boolean;
      }>(RISK_EXPOSURE_QUERY);

      const risks: Risk[] = results.map(r => r.r as Risk);
      const byLevel: Record<RiskLevel, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      };

      let explicitCount = 0;
      let impliedCount = 0;
      const unmitigated: Risk[] = [];
      const unmitigatedByLevel: Record<RiskLevel, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      };

      results.forEach(result => {
        const level = result.level;
        byLevel[level] = (byLevel[level] || 0) + 1;

        if (result.isImplied) {
          impliedCount++;
        } else {
          explicitCount++;
        }

        if (!result.hasControl) {
          unmitigated.push(result.r as Risk);
          unmitigatedByLevel[level] = (unmitigatedByLevel[level] || 0) + 1;
        }
      });

      const trends = await this.getRiskTrends();

      return {
        totalRisks: risks.length,
        byLevel,
        unmitigated: {
          total: unmitigated.length,
          byLevel: unmitigatedByLevel,
          critical: unmitigated.filter(r => r.level === 'CRITICAL'),
        },
        trends,
        impliedVsExplicit: {
          explicit: explicitCount,
          implied: impliedCount,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get risk exposure');
      throw new GraphPersistenceError('Risk exposure analysis failed', error);
    }
  }

  async getControlEffectiveness(): Promise<ControlEffectiveness> {
    try {
      const results = await this.graphRepo.executeQuery<{
        c: any;
        controlType: ControlType;
        effectiveness?: number;
        riskCount: number;
        hasSteps: boolean;
      }>(CONTROL_EFFECTIVENESS_QUERY);

      const controls: Control[] = results.map(r => r.c as Control);
      const byType: Record<ControlType, number> = {
        PREVENTIVE: 0,
        DETECTIVE: 0,
        CORRECTIVE: 0,
      };

      let totalEffectiveness = 0;
      let effectivenessCount = 0;
      const effectivenessByType: Record<ControlType, { sum: number; count: number }> = {
        PREVENTIVE: { sum: 0, count: 0 },
        DETECTIVE: { sum: 0, count: 0 },
        CORRECTIVE: { sum: 0, count: 0 },
      };

      let risksCovered = 0;
      let withSteps = 0;
      let withoutSteps = 0;
      let highEffectiveness = 0;
      let lowEffectiveness = 0;

      results.forEach(result => {
        const type = result.controlType;
        byType[type] = (byType[type] || 0) + 1;

        if (result.effectiveness !== null && result.effectiveness !== undefined) {
          const eff = typeof result.effectiveness === 'string' 
            ? parseFloat(result.effectiveness) 
            : result.effectiveness;
          if (!isNaN(eff)) {
            totalEffectiveness += eff;
            effectivenessCount++;
            effectivenessByType[type].sum += eff;
            effectivenessByType[type].count++;

            if (eff > 80) highEffectiveness++;
            if (eff < 50) lowEffectiveness++;
          }
        }

        risksCovered += result.riskCount;

        if (result.hasSteps) {
          withSteps++;
        } else {
          withoutSteps++;
        }
      });

      const allRisks = await this.graphRepo.queryByPattern({ nodeLabel: 'Risk', limit: 10000 });
      const totalRisks = allRisks.length;
      const risksUncovered = totalRisks - risksCovered;
      const coveragePercentage = totalRisks > 0 ? (risksCovered / totalRisks) * 100 : 0;

      const avgByType: Record<ControlType, number> = {
        PREVENTIVE: effectivenessByType.PREVENTIVE.count > 0
          ? effectivenessByType.PREVENTIVE.sum / effectivenessByType.PREVENTIVE.count
          : 0,
        DETECTIVE: effectivenessByType.DETECTIVE.count > 0
          ? effectivenessByType.DETECTIVE.sum / effectivenessByType.DETECTIVE.count
          : 0,
        CORRECTIVE: effectivenessByType.CORRECTIVE.count > 0
          ? effectivenessByType.CORRECTIVE.sum / effectivenessByType.CORRECTIVE.count
          : 0,
      };

      return {
        totalControls: controls.length,
        byType,
        coverage: {
          risksCovered,
          risksUncovered,
          coveragePercentage: Math.round(coveragePercentage * 100) / 100,
        },
        effectiveness: {
          average: effectivenessCount > 0 ? totalEffectiveness / effectivenessCount : 0,
          byType: avgByType,
          highEffectiveness,
          lowEffectiveness,
        },
        operationalized: {
          withSteps,
          withoutSteps,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get control effectiveness');
      throw new GraphPersistenceError('Control effectiveness analysis failed', error);
    }
  }

  async getFailureModeAnalysis(): Promise<FailureModeAnalysis> {
    try {
      const results = await this.graphRepo.executeQuery<{
        fm: any;
        rpn?: number;
        rpnCategory: string;
        hasControl: boolean;
      }>(FAILURE_MODE_ANALYSIS_QUERY);

      const failureModes: FailureMode[] = results.map(r => r.fm as FailureMode);
      const byRpnRange = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      };

      const unmitigated: FailureMode[] = [];
      const criticalUnmitigated: FailureMode[] = [];
      let mitigatedCount = 0;

      results.forEach(result => {
        const category = result.rpnCategory;
        if (category === 'critical') byRpnRange.critical++;
        else if (category === 'high') byRpnRange.high++;
        else if (category === 'medium') byRpnRange.medium++;
        else if (category === 'low') byRpnRange.low++;

        if (result.hasControl) {
          mitigatedCount++;
        } else {
          unmitigated.push(result.fm as FailureMode);
          if (category === 'critical') {
            criticalUnmitigated.push(result.fm as FailureMode);
          }
        }
      });

      const mitigationCoverage = failureModes.length > 0
        ? (mitigatedCount / failureModes.length) * 100
        : 0;

      return {
        total: failureModes.length,
        byRpnRange,
        unmitigated: {
          total: unmitigated.length,
          critical: criticalUnmitigated,
        },
        mitigationCoverage: Math.round(mitigationCoverage * 100) / 100,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get failure mode analysis');
      throw new GraphPersistenceError('Failure mode analysis failed', error);
    }
  }

  async getFindingTrends(): Promise<FindingTrends> {
    try {
      const results = await this.graphRepo.executeQuery<{
        f: any;
        status: FindingStatus;
        priority: FindingPriority;
        createdAt: string;
        updatedAt: string;
      }>(FINDING_TRENDS_QUERY);

      const findings: Finding[] = results.map(r => r.f as Finding);
      const byStatus: Record<FindingStatus, number> = {
        OPEN: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        CLOSED: 0,
      };

      const byPriority: Record<FindingPriority, number> = {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      };

      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

      let resolvedLast30Days = 0;
      let resolvedLast90Days = 0;
      let totalResolved = 0;
      let totalResolutionTime = 0;
      let resolutionCount = 0;

      results.forEach(result => {
        byStatus[result.status]++;
        byPriority[result.priority]++;

        if (result.status === 'RESOLVED' || result.status === 'CLOSED') {
          totalResolved++;
          const updatedAt = new Date(result.updatedAt).getTime();
          if (updatedAt >= thirtyDaysAgo) resolvedLast30Days++;
          if (updatedAt >= ninetyDaysAgo) resolvedLast90Days++;

          const createdAt = new Date(result.createdAt).getTime();
          const resolutionDays = (updatedAt - createdAt) / (1000 * 60 * 60 * 24);
          if (resolutionDays > 0) {
            totalResolutionTime += resolutionDays;
            resolutionCount++;
          }
        }
      });

      const resolutionTrends = await this.getFindingResolutionTrends();

      return {
        total: findings.length,
        byStatus,
        byPriority,
        resolutionRate: {
          last30Days: totalResolved > 0 ? (resolvedLast30Days / totalResolved) * 100 : 0,
          last90Days: totalResolved > 0 ? (resolvedLast90Days / totalResolved) * 100 : 0,
          allTime: findings.length > 0 ? (totalResolved / findings.length) * 100 : 0,
        },
        averageResolutionTime: resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0,
        trends: resolutionTrends,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get finding trends');
      throw new GraphPersistenceError('Finding trends analysis failed', error);
    }
  }

  async getComplianceStatus(): Promise<ComplianceStatus> {
    try {
      const results = await this.graphRepo.executeQuery<{
        req: any;
        requirementType: RequirementType;
        satisfactionStatus: string;
        documentType?: DocumentType;
      }>(COMPLIANCE_STATUS_QUERY);

      const requirements: Requirement[] = results.map(r => r.req as Requirement);
      const byType: Record<RequirementType, number> = {
        REGULATORY: 0,
        COMPLIANCE: 0,
        INTERNAL: 0,
        INDUSTRY_STANDARD: 0,
      };

      const satisfaction = {
        satisfied: 0,
        failed: 0,
        unknown: 0,
      };

      const gaps: Requirement[] = [];
      const byDocumentType: Record<DocumentType, number> = {
        fmea: 0,
        ipar: 0,
        hira: 0,
        alert: 0,
        fps: 0,
        generic: 0,
      };

      results.forEach(result => {
        byType[result.requirementType] = (byType[result.requirementType] || 0) + 1;

        if (result.satisfactionStatus === 'satisfied') {
          satisfaction.satisfied++;
        } else if (result.satisfactionStatus === 'failed') {
          satisfaction.failed++;
          gaps.push(result.req as Requirement);
        } else {
          satisfaction.unknown++;
          gaps.push(result.req as Requirement);
        }

        if (result.documentType) {
          byDocumentType[result.documentType] = (byDocumentType[result.documentType] || 0) + 1;
        }
      });

      return {
        totalRequirements: requirements.length,
        byType,
        satisfaction,
        gaps,
        byDocumentType,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get compliance status');
      throw new GraphPersistenceError('Compliance status analysis failed', error);
    }
  }

  async getProcessHealth(): Promise<ProcessHealth> {
    try {
      const results = await this.graphRepo.executeQuery<{
        p: any;
        name: string;
        version: string;
        hasProcedures: boolean;
        criticalRiskCount: number;
      }>(PROCESS_HEALTH_QUERY);

      const processes: Process[] = results.map(r => r.p as Process);
      let withProcedures = 0;
      let withoutProcedures = 0;
      const versionDistribution: Record<string, number> = {};
      let highRiskProcesses = 0;
      const processesWithCriticalRisks: Process[] = [];

      results.forEach(result => {
        if (result.hasProcedures) {
          withProcedures++;
        } else {
          withoutProcedures++;
        }

        const versionKey = `${result.name}:${result.version}`;
        versionDistribution[versionKey] = (versionDistribution[versionKey] || 0) + 1;

        if (result.criticalRiskCount > 0) {
          highRiskProcesses++;
          processesWithCriticalRisks.push(result.p as Process);
        }
      });

      return {
        totalProcesses: processes.length,
        withProcedures,
        withoutProcedures,
        versionDistribution,
        riskExposure: {
          highRiskProcesses,
          processesWithCriticalRisks,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get process health');
      throw new GraphPersistenceError('Process health analysis failed', error);
    }
  }

  private async getRiskTrends(): Promise<TimeSeriesData[]> {
    try {
      const results = await this.graphRepo.executeQuery<{
        riskDate: { year: { low: number }; month: { low: number }; day: { low: number } } | { year: number; month: number; day: number };
        level: RiskLevel;
        count: number | { toNumber: () => number };
      }>(RISK_TRENDS_QUERY);

      return results.map(r => {
        const date = r.riskDate;
        const year = typeof date.year === 'object' && 'low' in date.year ? date.year.low : date.year;
        const month = typeof date.month === 'object' && 'low' in date.month ? date.month.low : date.month;
        const day = typeof date.day === 'object' && 'low' in date.day ? date.day.low : date.day;
        const count = typeof r.count === 'object' && 'toNumber' in r.count ? r.count.toNumber() : r.count;
        
        return {
          date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          value: count,
          label: r.level,
        };
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to get risk trends, returning empty array');
      return [];
    }
  }

  private async getFindingResolutionTrends(): Promise<TimeSeriesData[]> {
    try {
      const results = await this.graphRepo.executeQuery<{
        resolvedDate: { year: { low: number }; month: { low: number }; day: { low: number } } | { year: number; month: number; day: number };
        count: number | { toNumber: () => number };
      }>(FINDING_RESOLUTION_TRENDS_QUERY);

      return results.map(r => {
        const date = r.resolvedDate;
        const year = typeof date.year === 'object' && 'low' in date.year ? date.year.low : date.year;
        const month = typeof date.month === 'object' && 'low' in date.month ? date.month.low : date.month;
        const day = typeof date.day === 'object' && 'low' in date.day ? date.day.low : date.day;
        const count = typeof r.count === 'object' && 'toNumber' in r.count ? r.count.toNumber() : r.count;
        
        return {
          date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          value: count,
          label: 'Resolved',
        };
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to get finding resolution trends, returning empty array');
      return [];
    }
  }

  async getCrossDocumentEntities(): Promise<CrossDocumentEntities> {
    try {
      const results = await this.graphRepo.executeQuery<{
        e: any;
        entityType: string;
        documentCount: number | { toNumber: () => number };
        documents: Array<{ id: string; fileName: string; documentType: DocumentType }>;
      }>(CROSS_DOCUMENT_ENTITIES_QUERY);

      const entities = results.map(r => {
        const docCount = typeof r.documentCount === 'object' && 'toNumber' in r.documentCount 
          ? r.documentCount.toNumber() 
          : r.documentCount;
        
        return {
          entity: r.e as Entity,
          entityType: r.entityType,
          documentCount: docCount,
          documents: r.documents || [],
        };
      });

      const byEntityType: Record<string, number> = {};
      entities.forEach(e => {
        byEntityType[e.entityType] = (byEntityType[e.entityType] || 0) + 1;
      });

      return {
        entities,
        total: entities.length,
        byEntityType,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get cross-document entities');
      throw new GraphPersistenceError('Cross-document entities analysis failed', error);
    }
  }

  async getDocumentCoverage(): Promise<DocumentCoverageAnalysis> {
    try {
      const results = await this.graphRepo.executeQuery<{
        documentId: string;
        fileName: string;
        documentType: DocumentType;
        riskCount: number | { toNumber: () => number };
        controlCount: number | { toNumber: () => number };
        failureModeCount: number | { toNumber: () => number };
        extractedEntityCount: number | { toNumber: () => number };
        risks: Array<{ id: string; level?: RiskLevel; description?: string }>;
        controls: Array<{ id: string; controlType?: ControlType; description?: string }>;
      }>(DOCUMENT_COVERAGE_QUERY);

      const documents = results.map(r => ({
        documentId: r.documentId,
        fileName: r.fileName,
        documentType: r.documentType,
        riskCount: typeof r.riskCount === 'object' && 'toNumber' in r.riskCount ? r.riskCount.toNumber() : r.riskCount,
        controlCount: typeof r.controlCount === 'object' && 'toNumber' in r.controlCount ? r.controlCount.toNumber() : r.controlCount,
        failureModeCount: typeof r.failureModeCount === 'object' && 'toNumber' in r.failureModeCount ? r.failureModeCount.toNumber() : r.failureModeCount,
        extractedEntityCount: typeof r.extractedEntityCount === 'object' && 'toNumber' in r.extractedEntityCount ? r.extractedEntityCount.toNumber() : r.extractedEntityCount,
        risks: r.risks || [],
        controls: r.controls || [],
      }));

      const totalRisks = documents.reduce((sum, d) => sum + d.riskCount, 0);
      const totalControls = documents.reduce((sum, d) => sum + d.controlCount, 0);

      return {
        documents,
        totalDocuments: documents.length,
        totalRisks,
        totalControls,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get document coverage');
      throw new GraphPersistenceError('Document coverage analysis failed', error);
    }
  }

  async getSharedEntityNetwork(): Promise<SharedEntityNetwork> {
    try {
      const results = await this.graphRepo.executeQuery<{
        doc1Id: string;
        doc1FileName: string;
        doc1Type: DocumentType;
        doc2Id: string;
        doc2FileName: string;
        doc2Type: DocumentType;
        sharedCount: number | { toNumber: () => number };
        sharedEntities: Array<{ id: string; type: string }>;
      }>(SHARED_ENTITY_NETWORK_QUERY);

      const links = results.map(r => ({
        doc1Id: r.doc1Id,
        doc1FileName: r.doc1FileName,
        doc1Type: r.doc1Type,
        doc2Id: r.doc2Id,
        doc2FileName: r.doc2FileName,
        doc2Type: r.doc2Type,
        sharedCount: typeof r.sharedCount === 'object' && 'toNumber' in r.sharedCount ? r.sharedCount.toNumber() : r.sharedCount,
        sharedEntities: r.sharedEntities || [],
      }));

      const documentMap = new Map<string, { id: string; fileName: string; documentType: DocumentType; connectionCount: number }>();
      
      links.forEach(link => {
        const doc1 = documentMap.get(link.doc1Id) || { id: link.doc1Id, fileName: link.doc1FileName, documentType: link.doc1Type, connectionCount: 0 };
        doc1.connectionCount++;
        documentMap.set(link.doc1Id, doc1);

        const doc2 = documentMap.get(link.doc2Id) || { id: link.doc2Id, fileName: link.doc2FileName, documentType: link.doc2Type, connectionCount: 0 };
        doc2.connectionCount++;
        documentMap.set(link.doc2Id, doc2);
      });

      return {
        links,
        totalLinks: links.length,
        documents: Array.from(documentMap.values()),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get shared entity network');
      throw new GraphPersistenceError('Shared entity network analysis failed', error);
    }
  }

  async getEntityProvenance(entityId: string): Promise<EntityProvenance> {
    try {
      const results = await this.graphRepo.executeQuery<{
        e: any;
        provenance: Array<{
          extractionId: string;
          sourceDocumentId: string;
          fileName: string;
          documentType: DocumentType;
          extractedBy: string;
          extractedAt: string;
          confidence: number;
          section: string;
          pageNumber?: number;
          lineRangeStart?: number;
          lineRangeEnd?: number;
        }>;
      }>(ENTITY_PROVENANCE_QUERY, { entityId });

      if (results.length === 0) {
        throw new GraphPersistenceError(`Entity not found: ${entityId}`);
      }

      const result = results[0];
      const provenance = (result.provenance || []).map(p => ({
        extractionId: p.extractionId,
        sourceDocumentId: p.sourceDocumentId,
        fileName: p.fileName,
        documentType: p.documentType,
        extractedBy: p.extractedBy,
        extractedAt: p.extractedAt,
        confidence: p.confidence,
        section: p.section,
        pageNumber: p.pageNumber,
        lineRangeStart: p.lineRangeStart,
        lineRangeEnd: p.lineRangeEnd,
      }));

      return {
        entity: result.e as Entity,
        provenance,
      };
    } catch (error) {
      logger.error({ entityId, error }, 'Failed to get entity provenance');
      throw new GraphPersistenceError('Entity provenance retrieval failed', error);
    }
  }

  async getFPSMaturity(): Promise<FPSMaturity> {
    try {
      const results = await this.graphRepo.executeQuery<{
        documentId: string;
        fileName: string;
        documentType: DocumentType;
        totalProcedures: number | { toNumber: () => number };
        auditedProcedures: number | { toNumber: () => number };
        nonCompliantCount: number | { toNumber: () => number };
      }>(FPS_MATURITY_QUERY);

      const extractStandardCode = (fileName: string): string | null => {
        const stMatch = fileName.match(/ST\s*0*(\d+)/i);
        if (stMatch) {
          const num = parseInt(stMatch[1], 10);
          return `ST${String(num).padStart(3, '0')}`;
        }
        return null;
      };

      const standardMap = new Map<string, {
        documents: Array<{ id: string; fileName: string }>;
        totalProcedures: number;
        totalAudited: number;
        totalNonCompliant: number;
      }>();

      results.forEach(r => {
        const standardCode = extractStandardCode(r.fileName);
        if (!standardCode) return;

        const totalProcedures = typeof r.totalProcedures === 'object' && 'toNumber' in r.totalProcedures 
          ? r.totalProcedures.toNumber() 
          : r.totalProcedures;
        const auditedProcedures = typeof r.auditedProcedures === 'object' && 'toNumber' in r.auditedProcedures 
          ? r.auditedProcedures.toNumber() 
          : r.auditedProcedures;
        const nonCompliantCount = typeof r.nonCompliantCount === 'object' && 'toNumber' in r.nonCompliantCount 
          ? r.nonCompliantCount.toNumber() 
          : r.nonCompliantCount;

        const existing = standardMap.get(standardCode);
        if (existing) {
          existing.documents.push({ id: r.documentId, fileName: r.fileName });
          existing.totalProcedures += totalProcedures;
          existing.totalAudited += auditedProcedures;
          existing.totalNonCompliant += nonCompliantCount;
        } else {
          standardMap.set(standardCode, {
            documents: [{ id: r.documentId, fileName: r.fileName }],
            totalProcedures,
            totalAudited: auditedProcedures,
            totalNonCompliant: nonCompliantCount,
          });
        }
      });

      const standards = Array.from(standardMap.entries()).map(([standardCode, data]) => {
        const auditCoverage = data.totalProcedures > 0 
          ? (data.totalAudited / data.totalProcedures) * 100 
          : 0;
        const nonCompliance = data.totalProcedures > 0 
          ? (data.totalNonCompliant / data.totalProcedures) * 100 
          : 0;

        return {
          standardCode,
          documents: data.documents,
          totalProcedures: data.totalProcedures,
          totalAudited: data.totalAudited,
          totalNonCompliant: data.totalNonCompliant,
          auditCoveragePercentage: Math.round(auditCoverage * 100) / 100,
          nonCompliancePercentage: Math.round(nonCompliance * 100) / 100,
        };
      }).sort((a, b) => a.standardCode.localeCompare(b.standardCode));

      return {
        standards,
        total: standards.length,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get FPS maturity');
      throw new GraphPersistenceError('FPS maturity analysis failed', error);
    }
  }
}
