export const semanticSearchRequestSchema = {
  type: 'object',
  required: ['query'],
  properties: {
    query: { type: 'string', minLength: 1 },
    limit: { type: 'number', minimum: 1, maximum: 100 },
    expandDepth: { type: 'number', minimum: 0, maximum: 3 },
    filters: {
      type: 'object',
      properties: {
        semanticType: { type: 'array', items: { type: 'string' } },
        documentId: { type: 'string' },
      },
    },
  },
} as const;

export const entityContextParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
} as const;

export const analyticsQuerySchema = {
  type: 'object',
  required: ['groupBy'],
  properties: {
    groupBy: { type: 'string', enum: ['semanticType', 'context', 'documentId'] },
    includeGraphStats: { type: 'boolean' },
  },
} as const;

export const graphPatternRequestSchema = {
  type: 'object',
  properties: {
    entityType: { type: 'string' },
    filters: { type: 'object' },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          direction: { type: 'string', enum: ['in', 'out', 'both'] },
          targetType: { type: 'string' },
        },
      },
    },
    includeVectorContext: { type: 'boolean' },
    limit: { type: 'number', minimum: 1, maximum: 100 },
  },
} as const;
