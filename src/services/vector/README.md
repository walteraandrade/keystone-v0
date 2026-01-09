# Repository Pattern: Vector Database Abstraction

## Pattern Overview

**Repository Pattern** mediates between the domain and data mapping layers. For vector stores, it abstracts similarity search and metadata filtering behind a domain-centric interface.

## Implementation

```typescript
interface VectorStore {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;

  // Vector operations
  upsertDocuments(docs: VectorDocument[]): Promise<void>;
  search(query: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;
  deleteByDocumentId(documentId: string): Promise<void>;

  // Domain-specific queries
  getChunksByGraphNodeIds(graphNodeIds: string[]): Promise<VectorDocument[]>;
  scrollAll(callback: (chunk: VectorDocument) => void): Promise<void>;
  countByFilter(filter: Record<string, unknown>): Promise<number>;
}

class QdrantVectorStore implements VectorStore {
  private client: QdrantClient | null = null;
  private collectionName: string;

  async search(query: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]> {
    const client = this.getClient();
    const response = await client.search(this.collectionName, {
      vector: query,
      limit,
      filter: this.buildFilter(filter),
      with_payload: true,
    });

    return response.map(result => ({
      id: result.id as string,
      score: result.score,
      payload: result.payload as VectorDocument['payload'],
    }));
  }
}
```

## Why This Pattern?

- **Abstraction**: Domain code independent of vector DB (Qdrant, Pinecone, Weaviate)
- **Testability**: Mock VectorStore for unit tests
- **Metadata filtering**: Encapsulate provider-specific filter syntax
- **Batch operations**: Hide pagination/scroll complexity
- **Graceful degradation**: Vectors disposable, system works without them

## Domain-Specific Operations

**getChunksByGraphNodeIds**: Retrieve all vector chunks for graph entities

```typescript
async getChunksByGraphNodeIds(graphNodeIds: string[]): Promise<VectorDocument[]> {
  const chunks: VectorDocument[] = [];

  for (const nodeId of graphNodeIds) {
    const response = await client.scroll(this.collectionName, {
      filter: {
        must: [{ key: 'graphNodeId', match: { value: nodeId } }],  // No 'payload.' prefix!
      },
      with_payload: true,
      with_vector: true,
      limit: 100,
    });

    chunks.push(...response.points.map(point => ({
      id: point.id as string,
      vector: point.vector as number[],
      payload: point.payload as VectorDocument['payload'],
    })));
  }

  return chunks;
}
```

**Why domain-specific?** Entity context retrieval is a business operation, not generic search.

**scrollAll**: Process all chunks without loading into memory

```typescript
async scrollAll(callback: (chunk: VectorDocument) => void): Promise<void> {
  let offset: string | number | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await client.scroll(this.collectionName, {
      offset,
      limit: 100,
      with_payload: true,
      with_vector: true,
    });

    response.points.forEach(point => {
      callback({
        id: point.id as string,
        vector: point.vector as number[],
        payload: point.payload as VectorDocument['payload'],
      });
    });

    offset = response.next_page_offset;
    hasMore = offset !== null && offset !== undefined;
  }
}
```

**Why domain-specific?** Analytics needs to iterate all chunks without OOM, encapsulates pagination.

## Adding New Operations

1. **Identify domain need**:

> "Need to find chunks by semantic type with similarity threshold"

2. **Add interface method**:

```typescript
// src/services/vector/VectorStore.interface.ts
interface VectorStore {
  searchBySemanticType(
    query: number[],
    semanticType: string,
    minScore: number,
    limit: number
  ): Promise<VectorSearchResult[]>;
}
```

3. **Implement in QdrantVectorStore**:

```typescript
// src/services/vector/QdrantVectorStore.ts
async searchBySemanticType(
  query: number[],
  semanticType: string,
  minScore: number,
  limit: number
): Promise<VectorSearchResult[]> {
  const client = this.getClient();
  const response = await client.search(this.collectionName, {
    vector: query,
    limit,
    filter: {
      must: [{ key: 'semanticType', match: { value: semanticType } }],
    },
    score_threshold: minScore,
    with_payload: true,
  });

  return response.map(result => ({
    id: result.id as string,
    score: result.score,
    payload: result.payload as VectorDocument['payload'],
  }));
}
```

## Critical: Qdrant Filter Keys

**Qdrant expects payload fields WITHOUT `payload.` prefix**:

```typescript
// ❌ Wrong
filter: { must: [{ key: 'payload.graphNodeId', match: { value: nodeId } }] }

// ✅ Correct
filter: { must: [{ key: 'graphNodeId', match: { value: nodeId } }] }
```

**Why?** Qdrant automatically scopes filters to payload, explicit prefix causes empty results.

**But**: In `search()` method, metadata filters use `payload.` prefix:

```typescript
// search() method - prefix required for dynamic filters
filter: {
  must: Object.entries(filter).map(([key, value]) => ({
    key: `payload.${key}`,  // Prefix here because filter is generic
    match: { value },
  }))
}
```

**Rule**: Hardcoded keys (graphNodeId, semanticType) → no prefix. Dynamic keys from params → add prefix.

## Keeping It Healthy

### ✅ Do
- Return **domain types** (VectorDocument), not provider types (QdrantPoint)
- Handle **pagination** internally (scrollAll, getChunksByGraphNodeIds)
- Use **domain-specific filters** (graphNodeId, documentId, semanticType)
- Keep repository **stateless** (client OK, no request state)
- **Close sessions** in finally blocks (if applicable)

### ❌ Don't
- Expose provider types (QdrantClient, PineconeIndex) in interface
- Return raw search results (wrap in VectorSearchResult)
- Let consumers write provider-specific filters
- Assume chunks fit in memory (use scrollAll for large datasets)
- Store request state in repository instance

## Metadata Schema

All vector documents include:

```typescript
interface VectorDocument {
  id: string;              // UUID (no prefix)
  vector: number[];        // Embedding (1536 dims for text-embedding-3-small)
  payload: {
    graphNodeId: string;   // Reference to graph entity
    documentId: string;    // Source document
    chunkText: string;     // Full chunk content
    chunkIndex: number;    // Position in document
    semanticType: string;  // fmea_row_group, ipar_finding, generic_paragraph
    context: string;       // Sheet: X, Row Y | Section: Z
    tokens: number;        // Token count (tiktoken)
    isOversized: boolean;  // Split due to token limit
    splitDepth: number;    // Recursive split depth
  };
}
```

**graphNodeId** enables vector → graph traversal (hybrid queries).

## Error Handling

Repository translates provider errors to domain errors:

```typescript
async search(query: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]> {
  try {
    const client = this.getClient();
    const response = await client.search(/* ... */);
    return this.mapResults(response);
  } catch (error) {
    logger.error({ error, limit }, 'Vector search failed');
    throw new GraphPersistenceError('Vector search failed', error);  // Domain error
  }
}
```

Consumers catch `GraphPersistenceError`, not `QdrantError`.

## Testing

**Unit tests** use mock:

```typescript
const mockVectorStore: VectorStore = {
  upsertDocuments: jest.fn().mockResolvedValue(undefined),
  search: jest.fn().mockResolvedValue([
    { id: 'chunk-1', score: 0.95, payload: { chunkText: 'test' } },
  ]),
};

const hybridQuery = new HybridQueryService(graphRepo, mockVectorStore, embeddingService);
```

**Integration tests** use real Qdrant:

```typescript
test('search filters by semanticType', async () => {
  const vectorStore = new QdrantVectorStore();
  await vectorStore.connect();

  const results = await vectorStore.search(
    embedding,
    10,
    { semanticType: 'fmea_row_group' }
  );

  expect(results.every(r => r.payload.semanticType === 'fmea_row_group')).toBe(true);

  await vectorStore.disconnect();
});
```

## Architecture Flow

```
HybridQueryService → VectorStore (interface)
                  → QdrantVectorStore (implementation)
                  → Qdrant Client
                  → Qdrant Database
```

Domain depends on interface, not implementation (Dependency Inversion).

## Vectors as Auxiliary Layer

**Critical principle**: Vectors are disposable. Deleting Qdrant should not invalidate any audit conclusion.

```typescript
// Graph is source of truth
const entity = await graphRepo.getEntity(entityId);  // Always works

// Vectors provide context (optional)
try {
  const chunks = await vectorStore.getChunksByGraphNodeIds([entityId]);
  return { entity, chunks };  // Enhanced with context
} catch (vectorError) {
  logger.warn('Vector retrieval failed, returning entity only');
  return { entity, chunks: [] };  // Graceful degradation
}
```

**Provenance chain**: Chunk → graphNodeId → Entity → sourceReference → Document

## References

- [Repository Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/repository)
- [Martin Fowler on Repository](https://martinfowler.com/eaaCatalog/repository.html)
- Related: `src/services/vector/VectorStore.interface.ts` (contract)
- Related: `src/services/vector/QdrantVectorStore.ts` (implementation)
- Related: `src/services/vector/EmbeddingService.ts` (vector generation)
