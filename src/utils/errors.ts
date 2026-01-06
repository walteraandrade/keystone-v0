export class ValidationError extends Error {
  code = 'VALIDATION_ERROR';
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class LLMExtractionError extends Error {
  code = 'LLM_EXTRACTION_ERROR';
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'LLMExtractionError';
  }
}

export class GraphPersistenceError extends Error {
  code = 'GRAPH_PERSISTENCE_ERROR';
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'GraphPersistenceError';
  }
}

export class DuplicateEntityError extends Error {
  code = 'DUPLICATE_ENTITY';
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'DuplicateEntityError';
  }
}

export class DocumentStorageError extends Error {
  code = 'DOCUMENT_STORAGE_ERROR';
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'DocumentStorageError';
  }
}
