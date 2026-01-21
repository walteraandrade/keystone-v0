export const coverageParamsSchema = {
  type: 'object',
  required: ['queryName'],
  properties: {
    queryName: {
      type: 'string',
      enum: ['risks-without-controls', 'controls-without-steps', 'unmitigated-high-rpn'],
    },
  },
} as const;

export const coverageQuerystringSchema = {
  type: 'object',
  properties: {
    threshold: { type: 'number', minimum: 0 },
  },
} as const;

export const coverageResponseSchema = {
  type: 'object',
  properties: {
    queryName: { type: 'string' },
    entities: { type: 'array', items: { type: 'object' } },
    count: { type: 'number' },
    params: { type: 'object' },
  },
} as const;
