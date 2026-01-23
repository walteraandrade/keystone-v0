import type { Entity } from '../../domain/entities/index.js';
import type { Risk, RiskLevel } from '../../domain/entities/Risk.js';
import type { Control, ControlType } from '../../domain/entities/Control.js';
import type { FailureMode } from '../../domain/entities/FailureMode.js';
import type { Finding, FindingStatus, FindingPriority } from '../../domain/entities/Finding.js';
import type { Requirement, RequirementType } from '../../domain/entities/Requirement.js';
import type { Process } from '../../domain/entities/Process.js';
import type { DocumentType } from '../../domain/entities/Document.js';

export interface TimeSeriesData {
  date: string;
  value: number;
  label?: string;
}

export interface PortfolioRiskExposure {
  totalRisks: number;
  byLevel: Record<RiskLevel, number>;
  unmitigated: {
    total: number;
    byLevel: Record<RiskLevel, number>;
    critical: Risk[];
  };
  trends: TimeSeriesData[];
  impliedVsExplicit: {
    explicit: number;
    implied: number;
  };
}

export interface ControlEffectiveness {
  totalControls: number;
  byType: Record<ControlType, number>;
  coverage: {
    risksCovered: number;
    risksUncovered: number;
    coveragePercentage: number;
  };
  effectiveness: {
    average: number;
    byType: Record<ControlType, number>;
    highEffectiveness: number;
    lowEffectiveness: number;
  };
  operationalized: {
    withSteps: number;
    withoutSteps: number;
  };
}

export interface FailureModeAnalysis {
  total: number;
  byRpnRange: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  unmitigated: {
    total: number;
    critical: FailureMode[];
  };
  mitigationCoverage: number;
}

export interface FindingTrends {
  total: number;
  byStatus: Record<FindingStatus, number>;
  byPriority: Record<FindingPriority, number>;
  resolutionRate: {
    last30Days: number;
    last90Days: number;
    allTime: number;
  };
  averageResolutionTime: number;
  trends: TimeSeriesData[];
}

export interface ComplianceStatus {
  totalRequirements: number;
  byType: Record<RequirementType, number>;
  satisfaction: {
    satisfied: number;
    failed: number;
    unknown: number;
  };
  gaps: Requirement[];
  byDocumentType: Record<DocumentType, number>;
}

export interface ProcessHealth {
  totalProcesses: number;
  withProcedures: number;
  withoutProcedures: number;
  versionDistribution: Record<string, number>;
  riskExposure: {
    highRiskProcesses: number;
    processesWithCriticalRisks: Process[];
  };
}

export interface PortfolioAnalytics {
  riskExposure: PortfolioRiskExposure;
  controlEffectiveness: ControlEffectiveness;
  failureModeAnalysis: FailureModeAnalysis;
  findingTrends: FindingTrends;
  complianceStatus: ComplianceStatus;
  processHealth: ProcessHealth;
  generatedAt: string;
}

export interface CrossDocumentEntity {
  entity: Entity;
  entityType: string;
  documentCount: number;
  documents: Array<{
    id: string;
    fileName: string;
    documentType: DocumentType;
  }>;
}

export interface CrossDocumentEntities {
  entities: CrossDocumentEntity[];
  total: number;
  byEntityType: Record<string, number>;
}

export interface DocumentCoverage {
  documentId: string;
  fileName: string;
  documentType: DocumentType;
  riskCount: number;
  controlCount: number;
  failureModeCount: number;
  extractedEntityCount: number;
  risks: Array<{
    id: string;
    level?: RiskLevel;
    description?: string;
  }>;
  controls: Array<{
    id: string;
    controlType?: ControlType;
    description?: string;
  }>;
}

export interface DocumentCoverageAnalysis {
  documents: DocumentCoverage[];
  totalDocuments: number;
  totalRisks: number;
  totalControls: number;
}

export interface SharedEntityLink {
  doc1Id: string;
  doc1FileName: string;
  doc1Type: DocumentType;
  doc2Id: string;
  doc2FileName: string;
  doc2Type: DocumentType;
  sharedCount: number;
  sharedEntities: Array<{
    id: string;
    type: string;
  }>;
}

export interface SharedEntityNetwork {
  links: SharedEntityLink[];
  totalLinks: number;
  documents: Array<{
    id: string;
    fileName: string;
    documentType: DocumentType;
    connectionCount: number;
  }>;
}

export interface ProvenanceRecord {
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
}

export interface EntityProvenance {
  entity: Entity;
  provenance: ProvenanceRecord[];
}

export interface FPSStandard {
  standardCode: string;
  documents: Array<{
    id: string;
    fileName: string;
  }>;
  totalProcedures: number;
  totalAudited: number;
  totalNonCompliant: number;
  auditCoveragePercentage: number;
  nonCompliancePercentage: number;
}

export interface FPSMaturity {
  standards: FPSStandard[];
  total: number;
}
