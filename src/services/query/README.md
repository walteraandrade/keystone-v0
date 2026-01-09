# Facade Pattern: Hybrid Query Service

## Pattern Overview

**Facade Pattern** provides a simplified interface to a complex subsystem. It hides complexity by coordinating multiple components behind a single, higher-level interface.

## Implementation

**HybridQueryService** coordinates graph (Neo4j) + vectors (Qdrant) + embeddings:

```typescript
class HybridQueryService {
  constructor(
    private graphRepo: GraphRepository,
    private vectorStore: VectorStore,
    private embeddingService: EmbeddingService
  ) {}

  // Facade method coordinating multiple subsystems
  async semanticSearchWithExpansion(params: SemanticSearchParams): Promise<SemanticSearchResult> {
    // 1. Generate embedding
    const embedding = await this.embeddingService.generateEmbedding(params.query);

    // 2. Search vectors
    const vectorResults = await this.vectorStore.search(embedding, params.limit, filters);

    // 3. Extract graph node IDs
    const nodeIds = vectorResults.map(r => r.payload.graphNodeId);

    // 4. Fetch entities from graph
    const entities = await this.graphRepo.getEntitiesByIds(nodeIds);

    // 5. Expand relationships
    const expanded = await this.graphRepo.expandRelationships(nodeIds, relationshipTypes);

    // 6. Combine results
    return { chunks: vectorResults, entities, relatedEntities: expanded };
  }
}
```

Without facade, consumers would need to:
1. Call EmbeddingService directly
2. Call VectorStore.search()
3. Parse results, extract IDs
4. Call GraphRepository.getEntitiesByIds()
5. Call GraphRepository.expandRelationships()
6. Manually combine results

## Why This Pattern?

- **Simplicity**: Single method call replaces 6+ operations
- **Coordination**: Handles cross-layer logic (vectors → graph)
- **Consistency**: Ensures results always combined correctly
- **Evolution**: Change internal coordination without affecting consumers

## Query Patterns

**1. Semantic Search → Graph Expansion**
```typescript
semanticSearchWithExpansion(params: SemanticSearchParams): Promise<SemanticSearchResult>
```
Find similar content → expand via relationships (FailureMode → Risk, Control)

**2. Entity → Context**
```typescript
getEntityWithContext(entityId: string, options?: ContextOptions): Promise<EntityContextResult>
```
Get entity + all vector chunks mentioning it + provenance

**3. Analytics**
```typescript
getOntologyAnalytics(params: AnalyticsParams): Promise<AnalyticsResult>
```
Aggregate vector stats + graph stats (counts, distributions)

**4. Graph Pattern**
```typescript
queryGraphPattern(params: GraphPatternParams): Promise<GraphPatternResult>
```
Query graph patterns, optionally fetch vector context

## Adding New Query Patterns

1. **Define types**:

```typescript
// src/services/query/types.ts
export interface NewQueryParams {
  filter: string;
  options?: Record<string, unknown>;
}

export interface NewQueryResult {
  data: Entity[];
  metadata: Record<string, unknown>;
}
```

2. **Implement facade method**:

```typescript
// src/services/query/HybridQueryService.ts
async newQueryPattern(params: NewQueryParams): Promise<NewQueryResult> {
  // Coordinate graph, vectors, embeddings as needed
  const graphData = await this.graphRepo.queryByPattern(params.filter);
  const vectorData = await this.vectorStore.search(/*...*/);

  return {
    data: combineResults(graphData, vectorData),
    metadata: { /* ... */ },
  };
}
```

3. **Create API handler**:

```typescript
// src/api/handlers/query.handler.ts
export function createNewQueryHandler(hybridQuery: HybridQueryService) {
  return async (request, reply) => {
    const params = request.body;
    const result = await hybridQuery.newQueryPattern(params);
    return reply.code(200).send(result);
  };
}
```

4. **Register route**:

```typescript
// src/api/routes.ts
fastify.post('/query/new-pattern', {
  schema: { body: newQueryRequestSchema },
  handler: createNewQueryHandler(hybridQuery),
});
```

## Keeping It Healthy

### ✅ Do
- Keep facade methods **high-level** (express intent, not mechanics)
- Return **combined results** (not raw subsystem outputs)
- Handle **cross-layer errors** gracefully (partial results if possible)
- Log coordination steps for debugging
- Make facade methods **idempotent** where possible

### ❌ Don't
- Expose subsystem internals in facade return types
- Let consumers bypass facade to call subsystems directly (defeats purpose)
- Add methods that only wrap single subsystem calls (no coordination = no facade)
- Make facade stateful (coordination logic should be stateless)

## Error Handling

Facade coordinates multiple systems, each can fail:

```typescript
async semanticSearchWithExpansion(params: SemanticSearchParams): Promise<SemanticSearchResult> {
  try {
    const embedding = await this.embeddingService.generateEmbedding(params.query);
    const vectorResults = await this.vectorStore.search(embedding, params.limit);

    // If graph fails, return vector results without expansion
    try {
      const nodeIds = vectorResults.map(r => r.payload.graphNodeId);
      const entities = await this.graphRepo.getEntitiesByIds(nodeIds);
      return { chunks: vectorResults, entities, relatedEntities: [] };
    } catch (graphError) {
      logger.warn({ graphError }, 'Graph expansion failed, returning vector results only');
      return { chunks: vectorResults, entities: [], relatedEntities: [] };
    }
  } catch (error) {
    logger.error({ error }, 'Semantic search failed');
    throw new Error('Hybrid query failed');
  }
}
```

## Testing

**Integration tests** verify cross-layer coordination:

```typescript
test('semantic search expands graph relationships', async () => {
  const hybridQuery = new HybridQueryService(graphRepo, vectorStore, embeddingService);

  const result = await hybridQuery.semanticSearchWithExpansion({
    query: 'medição incorreta',
    limit: 5,
    expandDepth: 1,
  });

  expect(result.chunks.length).toBeGreaterThan(0);
  expect(result.entities.length).toBeGreaterThan(0);
  expect(result.relatedEntities.length).toBeGreaterThan(0);
});
```

**Unit tests** use mocked subsystems:

```typescript
const mockGraphRepo = { getEntitiesByIds: jest.fn().mockResolvedValue([]) };
const mockVectorStore = { search: jest.fn().mockResolvedValue([]) };
const mockEmbedding = { generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]) };

const hybridQuery = new HybridQueryService(mockGraphRepo, mockVectorStore, mockEmbedding);
```

## Architecture Flow

```
API Handler → HybridQueryService (Facade)
           → Coordinates: GraphRepository + VectorStore + EmbeddingService
           → Returns unified result to handler
```

## References

- [Facade Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/facade)
- Related: `src/services/query/types.ts` (query contracts)
- Related: `src/api/handlers/query.handler.ts` (API integration)
