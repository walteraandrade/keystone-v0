export interface VectorDocument {
  id: string;
  vector: number[];
  payload: {
    graphNodeId: string;
    documentId: string;
    chunkText: string;
    chunkIndex: number;
    metadata: Record<string, unknown>;
  };
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: VectorDocument['payload'];
}

export interface VectorStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;

  upsertDocuments(docs: VectorDocument[]): Promise<void>;
  search(query: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}
