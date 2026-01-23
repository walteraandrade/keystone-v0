export const portfolioAnalyticsResponseSchema = {
  type: 'object',
  properties: {
    riskExposure: {
      type: 'object',
      properties: {
        totalRisks: { type: 'number' },
        byLevel: {
          type: 'object',
          properties: {
            CRITICAL: { type: 'number' },
            HIGH: { type: 'number' },
            MEDIUM: { type: 'number' },
            LOW: { type: 'number' },
          },
        },
        unmitigated: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            byLevel: {
              type: 'object',
              properties: {
                CRITICAL: { type: 'number' },
                HIGH: { type: 'number' },
                MEDIUM: { type: 'number' },
                LOW: { type: 'number' },
              },
            },
            critical: { type: 'array' },
          },
        },
        trends: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              value: { type: 'number' },
              label: { type: 'string' },
            },
          },
        },
        impliedVsExplicit: {
          type: 'object',
          properties: {
            explicit: { type: 'number' },
            implied: { type: 'number' },
          },
        },
      },
    },
    controlEffectiveness: {
      type: 'object',
      properties: {
        totalControls: { type: 'number' },
        byType: {
          type: 'object',
          properties: {
            PREVENTIVE: { type: 'number' },
            DETECTIVE: { type: 'number' },
            CORRECTIVE: { type: 'number' },
          },
        },
        coverage: {
          type: 'object',
          properties: {
            risksCovered: { type: 'number' },
            risksUncovered: { type: 'number' },
            coveragePercentage: { type: 'number' },
          },
        },
        effectiveness: {
          type: 'object',
          properties: {
            average: { type: 'number' },
            byType: {
              type: 'object',
              properties: {
                PREVENTIVE: { type: 'number' },
                DETECTIVE: { type: 'number' },
                CORRECTIVE: { type: 'number' },
              },
            },
            highEffectiveness: { type: 'number' },
            lowEffectiveness: { type: 'number' },
          },
        },
        operationalized: {
          type: 'object',
          properties: {
            withSteps: { type: 'number' },
            withoutSteps: { type: 'number' },
          },
        },
      },
    },
    failureModeAnalysis: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        byRpnRange: {
          type: 'object',
          properties: {
            critical: { type: 'number' },
            high: { type: 'number' },
            medium: { type: 'number' },
            low: { type: 'number' },
          },
        },
        unmitigated: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            critical: { type: 'array' },
          },
        },
        mitigationCoverage: { type: 'number' },
      },
    },
    findingTrends: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        byStatus: {
          type: 'object',
          properties: {
            OPEN: { type: 'number' },
            IN_PROGRESS: { type: 'number' },
            RESOLVED: { type: 'number' },
            CLOSED: { type: 'number' },
          },
        },
        byPriority: {
          type: 'object',
          properties: {
            LOW: { type: 'number' },
            MEDIUM: { type: 'number' },
            HIGH: { type: 'number' },
            CRITICAL: { type: 'number' },
          },
        },
        resolutionRate: {
          type: 'object',
          properties: {
            last30Days: { type: 'number' },
            last90Days: { type: 'number' },
            allTime: { type: 'number' },
          },
        },
        averageResolutionTime: { type: 'number' },
        trends: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              value: { type: 'number' },
              label: { type: 'string' },
            },
          },
        },
      },
    },
    complianceStatus: {
      type: 'object',
      properties: {
        totalRequirements: { type: 'number' },
        byType: {
          type: 'object',
          properties: {
            REGULATORY: { type: 'number' },
            COMPLIANCE: { type: 'number' },
            INTERNAL: { type: 'number' },
            INDUSTRY_STANDARD: { type: 'number' },
          },
        },
        satisfaction: {
          type: 'object',
          properties: {
            satisfied: { type: 'number' },
            failed: { type: 'number' },
            unknown: { type: 'number' },
          },
        },
        gaps: { type: 'array' },
        byDocumentType: {
          type: 'object',
          properties: {
            fmea: { type: 'number' },
            ipar: { type: 'number' },
            hira: { type: 'number' },
            alert: { type: 'number' },
            fps: { type: 'number' },
            generic: { type: 'number' },
          },
        },
      },
    },
    processHealth: {
      type: 'object',
      properties: {
        totalProcesses: { type: 'number' },
        withProcedures: { type: 'number' },
        withoutProcedures: { type: 'number' },
        versionDistribution: { type: 'object' },
        riskExposure: {
          type: 'object',
          properties: {
            highRiskProcesses: { type: 'number' },
            processesWithCriticalRisks: { type: 'array' },
          },
        },
      },
    },
    generatedAt: { type: 'string' },
  },
} as const;

export const riskExposureResponseSchema = portfolioAnalyticsResponseSchema.properties.riskExposure;
export const controlEffectivenessResponseSchema = portfolioAnalyticsResponseSchema.properties.controlEffectiveness;
export const failureModeAnalysisResponseSchema = portfolioAnalyticsResponseSchema.properties.failureModeAnalysis;
export const findingTrendsResponseSchema = portfolioAnalyticsResponseSchema.properties.findingTrends;
export const complianceStatusResponseSchema = portfolioAnalyticsResponseSchema.properties.complianceStatus;
export const processHealthResponseSchema = portfolioAnalyticsResponseSchema.properties.processHealth;
