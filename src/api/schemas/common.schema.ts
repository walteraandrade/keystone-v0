export const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
  },
} as const;

export const paginationQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'number', minimum: 1, maximum: 1000 },
    offset: { type: 'number', minimum: 0 },
  },
} as const;

export const byLevelSchema = {
  type: 'object',
  properties: {
    LOW: { type: 'number' },
    MEDIUM: { type: 'number' },
    HIGH: { type: 'number' },
    CRITICAL: { type: 'number' },
  },
} as const;

export const timeSeriesSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      period: { type: 'string' },
      value: { type: 'number' },
      metadata: { type: 'object' },
    },
  },
} as const;

