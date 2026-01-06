import type { ExtractionRequest, ExtractionResponse } from '../../types/extraction.types.js';

export interface LLMService {
  extract(request: ExtractionRequest): Promise<ExtractionResponse>;
  testConnection(): Promise<boolean>;
}
