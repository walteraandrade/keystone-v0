export const auditSummaryParamsSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
  required: ['id'],
} as const;

export const auditSummaryResponseSchema = {
  type: 'object',
  properties: {
    auditId: { type: 'string' },
    process: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'string' },
      },
    },
    documents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          documentType: { type: 'string' },
          uploadedAt: { type: 'string' },
        },
      },
    },
    statistics: {
      type: 'object',
      properties: {
        totalFailureModes: { type: 'number' },
        highRisks: { type: 'number' },
        controlsImplemented: { type: 'number' },
        findings: { type: 'number' },
      },
      required: ['totalFailureModes', 'highRisks', 'controlsImplemented', 'findings'],
    },
    relationships: {
      type: 'object',
      properties: {
        failureModesToRisks: { type: 'number' },
        controlsToFailureModes: { type: 'number' },
      },
      required: ['failureModesToRisks', 'controlsToFailureModes'],
    },
  },
  required: ['auditId', 'documents', 'statistics', 'relationships'],
} as const;
