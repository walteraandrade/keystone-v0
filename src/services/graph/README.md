# Repository Pattern: Graph Database Abstraction

## Pattern Overview

**Repository Pattern** mediates between the domain and data mapping layers, acting like an in-memory collection of domain objects. It encapsulates data access logic and provides a domain-centric API.

## Implementation

```typescript
interface GraphRepository {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;

  // Entity CRUD
  createEntity<T extends Entity>(entity: T): Promise<string>;
  getEntity<T extends Entity>(id: string): Promise<T | null>;
  updateEntity<T extends Entity>(id: string, updates: Partial<T>): Promise<void>;
  deleteEntity(id: string): Promise<void>;

  // Domain-specific queries
  findDuplicateEntity<T extends Entity>(candidate: T): Promise<string | null>;
  getAuditSummary(auditId: string): Promise<AuditSummary>;
  queryByPattern(params: { nodeLabel: string; properties?: Record<string, unknown> }): Promise<Entity[]>;

  // Relationships
  createRelationship(from: string, to: string, type: RelationshipType, ...): Promise<void>;
  getRelationships(entityId: string, direction?: 'in' | 'out' | 'both'): Promise<Relationship[]>;
  expandRelationships(entityIds: string[], relationshipTypes?: RelationshipType[]): Promise<{...}>;

  // Transactions
  beginTransaction(): Promise<Transaction>;
  commit(transaction: Transaction): Promise<void>;
  rollback(transaction: Transaction): Promise<void>;
}

class Neo4jRepository implements GraphRepository {
  private driver: Driver | null = null;

  async createEntity<T extends Entity>(entity: T): Promise<string> {
    const session = this.getSession();
    const query = `CREATE (e:${entity.type}:Entity $props) RETURN e.id as id`;
    const result = await session.run(query, { props: entity });
    return result.records[0].get('id');
  }
  // ... other implementations
}
```

## Why This Pattern?

- **Abstraction**: Domain code independent of database technology
- **Testability**: Mock repository interface for unit tests
- **Centralization**: All data access logic in one place
- **Flexibility**: Swap Neo4j for another graph DB without changing consumers
- **Domain focus**: Methods express business operations, not SQL/Cypher

## Domain-Specific Queries

Repository exposes **business operations**, not generic CRUD:

**❌ Bad (generic)**:
```typescript
repo.query("MATCH (fm:FailureMode {code: $code}) WHERE NOT (fm)-[:SUPERSEDES]->() RETURN fm");
```

**✅ Good (domain-specific)**:
```typescript
repo.findDuplicateEntity(failureMode);  // Encapsulates versioning logic
```

**Business logic in repository**:
```typescript
async findDuplicateEntity<T extends Entity>(candidate: T): Promise<string | null> {
  switch (candidate.type) {
    case 'FailureMode':
      // Business rule: FailureMode duplicates by code, exclude superseded versions
      return this.findLatestByCode((candidate as FailureMode).code);

    case 'Document':
      // Business rule: Document duplicates by content hash
      return this.findByContentHash((candidate as Document).contentHash);

    default:
      return null;
  }
}
```

## Adding New Operations

1. **Define domain need**:

> "Need to find all high-risk FailureModes without mitigation controls"

2. **Add interface method**:

```typescript
// src/services/graph/GraphRepository.interface.ts
interface GraphRepository {
  getUnmitigatedHighRisks(): Promise<Array<{ failureMode: FailureMode; risk: Risk }>>;
}
```

3. **Implement in Neo4jRepository**:

```typescript
// src/services/graph/Neo4jRepository.ts
async getUnmitigatedHighRisks(): Promise<Array<{ failureMode: FailureMode; risk: Risk }>> {
  const session = this.getSession();
  try {
    const query = `
      MATCH (fm:FailureMode)-[:IMPLIES]->(r:Risk {level: 'HIGH'})
      WHERE NOT (:Control)-[:MITIGATES]->(fm)
      AND NOT (fm)-[:SUPERSEDES]->()
      RETURN fm, r
    `;
    const result = await session.run(query);

    return result.records.map(record => ({
      failureMode: record.get('fm').properties as FailureMode,
      risk: record.get('r').properties as Risk,
    }));
  } finally {
    await session.close();
  }
}
```

4. **Use in domain logic**:

```typescript
const unmitigated = await graphRepo.getUnmitigatedHighRisks();
// Returns domain objects, not raw Cypher results
```

## Keeping It Healthy

### ✅ Do
- Express operations in **domain language** (getAuditSummary, not runCypherQuery)
- Return **domain types** (Entity, Relationship), not database-specific types (Neo4j.Node)
- Handle **session lifecycle** (open, close) inside methods
- Use **parameterized queries** (SQL injection prevention)
- Apply **business rules** in queries (exclude SUPERSEDED versions)
- Keep repository **stateless** (driver/client OK, no request state)

### ❌ Don't
- Expose database-specific types in interface (e.g., Neo4j.Session)
- Return raw query results (wrap in domain objects)
- Let consumers write raw Cypher (defeats abstraction)
- Store request-scoped state in repository instance
- Mix repository with business logic (repository = data access only)

## Transaction Management

Repository provides transaction primitives, orchestrator uses them:

```typescript
// src/services/ingestion/IngestionOrchestrator.ts
const tx = await this.graphRepo.beginTransaction();
try {
  await this.graphRepo.createEntity(document);
  await this.graphRepo.createRelationship(auditId, documentId, 'USES', 1.0, {});
  await this.graphRepo.commit(tx);
} catch (error) {
  await this.graphRepo.rollback(tx);
  throw error;
}
```

**Why not in repository?** Transaction scope spans multiple operations, orchestrator decides boundaries.

## Error Handling

Repository translates database errors to domain errors:

```typescript
async createEntity<T extends Entity>(entity: T): Promise<string> {
  try {
    const session = this.getSession();
    const result = await session.run(query, { props: entity });
    return result.records[0].get('id');
  } catch (error) {
    logger.error({ entity, error }, 'Failed to create entity');
    throw new GraphPersistenceError('Entity creation failed', error);  // Domain error
  } finally {
    await session.close();
  }
}
```

Consumers catch `GraphPersistenceError`, not `Neo4jError`.

## Testing

**Unit tests** use mock repository:

```typescript
const mockRepo: GraphRepository = {
  createEntity: jest.fn().mockResolvedValue('entity-123'),
  getEntity: jest.fn().mockResolvedValue({ id: 'entity-123', type: 'Process' }),
  // ... other methods
};

const orchestrator = new IngestionOrchestrator(mockRepo, docStorage, vectorStore, llmService);
```

**Integration tests** use real Neo4j:

```typescript
test('findDuplicateEntity detects existing FailureMode', async () => {
  const repo = new Neo4jRepository();
  await repo.connect();

  await repo.createEntity({ type: 'FailureMode', code: 'FM-001', /* ... */ });
  const duplicateId = await repo.findDuplicateEntity({ type: 'FailureMode', code: 'FM-001' });

  expect(duplicateId).toBeDefined();

  await repo.disconnect();
});
```

## Architecture Flow

```
IngestionOrchestrator → GraphRepository (interface)
                     → Neo4jRepository (implementation)
                     → Neo4j Driver
                     → Neo4j Database
```

Domain code depends on interface, not implementation (Dependency Inversion).

## References

- [Repository Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/repository)
- [Martin Fowler on Repository](https://martinfowler.com/eaaCatalog/repository.html)
- Related: `src/services/graph/GraphRepository.interface.ts` (contract)
- Related: `src/services/graph/Neo4jRepository.ts` (implementation)
