export const ingestResponseSchema = {
  type: 'object',
  properties: {
    documentId: { type: 'string' },
    status: { type: 'string', enum: ['processed', 'failed'] },
    entitiesCreated: { type: 'object' },
    relationshipsCreated: { type: 'number' },
    processingTime: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['documentId', 'status', 'entitiesCreated', 'relationshipsCreated', 'processingTime'],
} as const;

export const ingestErrorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    details: { type: 'object' },
  },
  required: ['error', 'message'],
} as const;
