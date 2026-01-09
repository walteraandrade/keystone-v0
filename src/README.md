# Dependency Injection Pattern: Application Composition

## Pattern Overview

**Dependency Injection (DI)** is a technique where objects receive their dependencies from external sources rather than creating them. It inverts control: instead of "I need X, let me create it", it's "I need X, someone provide it to me".

## Implementation

**src/index.ts** is the composition root where all dependencies are constructed and wired:

```typescript
// 1. Initialize infrastructure
const graphRepo = new Neo4jRepository();
await graphRepo.connect();

const vectorStore = new QdrantVectorStore();
await vectorStore.connect();

const docStorage = new FileSystemStorage();
await docStorage.init();

// 2. Initialize services
const llmService = LLMServiceFactory.createLLMService();
const embeddingService = new EmbeddingService();

// 3. Compose high-level services (inject dependencies)
const orchestrator = new IngestionOrchestrator(
  graphRepo,      // Dependency
  docStorage,     // Dependency
  vectorStore,    // Dependency
  llmService      // Dependency
);

const hybridQuery = new HybridQueryService(
  graphRepo,        // Dependency
  vectorStore,      // Dependency
  embeddingService  // Dependency
);

// 4. Wire to API routes
await registerRoutes(fastify, orchestrator, graphRepo, hybridQuery);
```

**Services declare dependencies via constructor**:

```typescript
export class IngestionOrchestrator {
  constructor(
    private graphRepo: GraphRepository,      // Interface, not concrete class
    private docStorage: DocumentStorage,     // Interface
    private vectorStore: VectorStore,        // Interface
    private llmService: LLMService           // Interface
  ) {}

  async ingest(file: File, metadata: Metadata): Promise<Result> {
    // Use injected dependencies
    await this.docStorage.store(file);
    const entities = await this.llmService.extract(file);
    await this.graphRepo.createEntity(entities);
    // ...
  }
}
```

## Why This Pattern?

- **Testability**: Inject mocks in tests, real implementations in production
- **Flexibility**: Swap implementations (OpenAI → Anthropic) without changing consumers
- **Clarity**: Dependencies explicit in constructor, not hidden in code
- **Single Responsibility**: Services focus on business logic, not dependency creation
- **Inversion of Control**: Composition root controls wiring, not services

## Constructor Injection

**✅ Good (dependencies injected)**:

```typescript
class HybridQueryService {
  constructor(
    private graphRepo: GraphRepository,
    private vectorStore: VectorStore,
    private embeddingService: EmbeddingService
  ) {}
}

// Composition root
const hybridQuery = new HybridQueryService(graphRepo, vectorStore, embeddingService);
```

**❌ Bad (dependencies created internally)**:

```typescript
class HybridQueryService {
  private graphRepo: GraphRepository;
  private vectorStore: VectorStore;

  constructor() {
    this.graphRepo = new Neo4jRepository();  // Tight coupling!
    this.vectorStore = new QdrantVectorStore();  // Hard to test!
  }
}
```

Why bad?
- Can't test with mocks
- Can't swap implementations
- Hidden dependencies (not visible in constructor)
- Hard to reason about lifecycle

## Dependency Interfaces

Services depend on **interfaces**, not concrete classes:

```typescript
// ✅ Good
constructor(private graphRepo: GraphRepository) {}

// ❌ Bad
constructor(private graphRepo: Neo4jRepository) {}
```

**Benefits**:
- Loose coupling (Dependency Inversion Principle)
- Multiple implementations possible
- Easy to mock for tests
- Can swap Neo4j for another graph DB

## Composition Root

**index.ts** is the only place that:
1. Imports concrete classes
2. Calls constructors
3. Wires dependencies

**Everywhere else**:
- Imports interfaces
- Receives dependencies via constructor
- Never calls `new SomeService()`

```typescript
// ✅ In composition root (index.ts)
const graphRepo = new Neo4jRepository();
const orchestrator = new IngestionOrchestrator(graphRepo, ...);

// ✅ In service (IngestionOrchestrator.ts)
constructor(private graphRepo: GraphRepository) {}  // Interface

// ❌ In service
const graphRepo = new Neo4jRepository();  // Never do this!
```

## Lifecycle Management

Composition root manages lifecycle:

```typescript
// Startup
const graphRepo = new Neo4jRepository();
await graphRepo.connect();

const vectorStore = new QdrantVectorStore();
await vectorStore.connect();

// Shutdown
const shutdown = async () => {
  await fastify.close();
  await graphRepo.disconnect();
  await vectorStore.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

Services don't manage their dependencies' lifecycle.

## Adding New Services

1. **Define interface**:

```typescript
// src/services/notifications/NotificationService.interface.ts
export interface NotificationService {
  sendAlert(message: string): Promise<void>;
}
```

2. **Implement**:

```typescript
// src/services/notifications/EmailNotificationService.ts
export class EmailNotificationService implements NotificationService {
  async sendAlert(message: string): Promise<void> {
    // Send email via SMTP
  }
}
```

3. **Wire in composition root**:

```typescript
// src/index.ts
const notificationService = new EmailNotificationService();

const orchestrator = new IngestionOrchestrator(
  graphRepo,
  docStorage,
  vectorStore,
  llmService,
  notificationService  // Inject new dependency
);
```

4. **Declare dependency**:

```typescript
// src/services/ingestion/IngestionOrchestrator.ts
constructor(
  private graphRepo: GraphRepository,
  private docStorage: DocumentStorage,
  private vectorStore: VectorStore,
  private llmService: LLMService,
  private notificationService: NotificationService  // New dependency
) {}

async ingest(file: File): Promise<Result> {
  // ...
  await this.notificationService.sendAlert('Ingestion complete');
}
```

## Keeping It Healthy

### ✅ Do
- **Inject all dependencies** via constructor
- Depend on **interfaces**, not concrete classes
- Keep **composition root** (index.ts) as single wiring point
- Make dependencies **explicit** (visible in constructor)
- Use **readonly** for injected dependencies (`private readonly graphRepo`)

### ❌ Don't
- Create dependencies inside services (`new SomeService()`)
- Use service locator pattern (global registry of services)
- Pass config objects instead of pre-configured services
- Hide dependencies in method parameters
- Mix composition with business logic

## Testing with DI

**Unit test** with mocks:

```typescript
const mockGraphRepo: GraphRepository = {
  createEntity: jest.fn().mockResolvedValue('entity-123'),
  getEntity: jest.fn().mockResolvedValue(null),
};

const mockLLM: LLMService = {
  generateStructuredOutput: jest.fn().mockResolvedValue({ entities: [] }),
};

const orchestrator = new IngestionOrchestrator(
  mockGraphRepo,
  mockDocStorage,
  mockVectorStore,
  mockLLM
);

await orchestrator.ingest(file);

expect(mockGraphRepo.createEntity).toHaveBeenCalledWith(expect.objectContaining({
  type: 'Document',
}));
```

**Integration test** with real dependencies:

```typescript
const graphRepo = new Neo4jRepository();
await graphRepo.connect();

const vectorStore = new QdrantVectorStore();
await vectorStore.connect();

const orchestrator = new IngestionOrchestrator(
  graphRepo,
  realDocStorage,
  vectorStore,
  realLLMService
);

const result = await orchestrator.ingest(testFile);
expect(result.status).toBe('processed');

await graphRepo.disconnect();
await vectorStore.disconnect();
```

## Configuration vs Dependencies

**Config**: Environment-specific values (URLs, API keys, thresholds)

```typescript
// ✅ Config accessed via config module
const client = new OpenAI({ apiKey: config.openai.apiKey });
```

**Dependencies**: Services that perform operations

```typescript
// ✅ Dependencies injected via constructor
constructor(private llmService: LLMService) {}
```

**Don't inject config objects**:

```typescript
// ❌ Bad
constructor(private config: Config) {
  this.apiKey = config.openai.apiKey;
}

// ✅ Good
constructor() {
  this.apiKey = config.openai.apiKey;  // Access config directly
}
```

Config is global, stable, environment-specific. Dependencies are local, testable, swappable.

## Architecture Flow

```
index.ts (Composition Root)
  ├─ Creates concrete implementations
  ├─ Wires dependencies via constructors
  └─ Passes to API routes

Services
  ├─ Declare dependencies in constructor (interfaces)
  ├─ Never create dependencies
  └─ Focus on business logic

Tests
  ├─ Inject mocks for unit tests
  └─ Inject real implementations for integration tests
```

## References

- [Dependency Injection - Refactoring Guru](https://refactoring.guru/design-patterns/dependency-injection)
- [Martin Fowler on Dependency Injection](https://martinfowler.com/articles/injection.html)
- [Composition Root Pattern](https://blog.ploeh.dk/2011/07/28/CompositionRoot/)
- Related: `src/index.ts` (composition root)
- Related: All service constructors (dependency declaration)
