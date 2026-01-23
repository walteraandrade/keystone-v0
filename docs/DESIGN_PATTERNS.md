# Design Patterns Guide

This codebase uses established design patterns to maintain clean architecture, testability, and extensibility. Each pattern has detailed documentation in its respective directory.

## Pattern Index

### 1. Strategy Pattern
**Location**: `src/services/chunking/strategies/`
**Purpose**: Different segmentation algorithms for document types (FMEA, IPAR, generic)
**Key Benefit**: Add new document types without modifying existing code

**Example**:
```typescript
const chunker = new SemanticChunker();
const chunks = chunker.chunk(content, 'fmea');  // Selects FMEASegmentationStrategy
```

[📖 Read full guide →](src/services/chunking/strategies/README.md)

---

### 2. Factory Pattern
**Location**: `src/services/llm/`
**Purpose**: Create LLM service instances based on config (OpenAI, Anthropic, OpenRouter)
**Key Benefit**: Switch providers via environment variable

**Example**:
```typescript
const llmService = LLMServiceFactory.createLLMService();  // Returns configured provider
await llmService.generateStructuredOutput(params);
```

[📖 Read full guide →](src/services/llm/README.md)

---

### 3. Repository Pattern
**Locations**: `src/services/graph/` and `src/services/vector/`
**Purpose**: Abstract data access behind domain-centric interfaces
**Key Benefit**: Swap databases without changing business logic

**Example**:
```typescript
// Interface, not concrete class
const graphRepo: GraphRepository = new Neo4jRepository();
const entity = await graphRepo.findDuplicateEntity(candidate);  // Business operation
```

[📖 Read graph repository guide →](src/services/graph/README.md)
[📖 Read vector repository guide →](src/services/vector/README.md)

---

### 4. Facade Pattern
**Location**: `src/services/query/`
**Purpose**: Simplify complex multi-subsystem operations (graph + vectors + embeddings)
**Key Benefit**: Single method call replaces 6+ coordinated operations

**Example**:
```typescript
const hybridQuery = new HybridQueryService(graphRepo, vectorStore, embeddingService);
const result = await hybridQuery.semanticSearchWithExpansion(params);  // Coordinates all 3 subsystems
```

[📖 Read full guide →](src/services/query/README.md)

---

### 5. Dependency Injection
**Location**: `src/index.ts` (composition root)
**Purpose**: Wire dependencies at application startup, inject via constructors
**Key Benefit**: Testability (inject mocks), flexibility (swap implementations)

**Example**:
```typescript
// Composition root
const orchestrator = new IngestionOrchestrator(graphRepo, docStorage, vectorStore, llmService);

// Service declares dependencies
class IngestionOrchestrator {
  constructor(
    private graphRepo: GraphRepository,  // Injected
    private docStorage: DocumentStorage  // Injected
  ) {}
}
```

[📖 Read full guide →](src/README.md)

---

## Pattern Principles

All patterns follow:

1. **Depend on interfaces, not implementations** (Dependency Inversion Principle)
2. **Open for extension, closed for modification** (Open/Closed Principle)
3. **Single responsibility** - each class has one reason to change
4. **Explicit dependencies** - visible in constructors, not hidden
5. **Testability first** - mockable interfaces, injectable dependencies

## Quick Reference

| Pattern | When to Use | When NOT to Use |
|---------|-------------|-----------------|
| **Strategy** | Multiple algorithms for same task (document segmentation) | Only one algorithm exists |
| **Factory** | Object creation depends on config/runtime value | Single fixed implementation |
| **Repository** | Abstract data access (databases, APIs) | Simple in-memory data structures |
| **Facade** | Coordinate multiple subsystems | Single system, no coordination |
| **Dependency Injection** | Always (for services with dependencies) | Pure functions, utilities |

## Adding Patterns

When adding a new pattern:

1. **Create README** in pattern location explaining:
   - Pattern overview (what it is)
   - Why we use it (benefits)
   - Implementation details (code examples)
   - How to extend (adding new implementations)
   - Keeping it healthy (dos and don'ts)

2. **Update this index** with:
   - Pattern name and location
   - Brief description
   - Quick example
   - Link to detailed guide

3. **Reference pattern** in code comments where appropriate:
   ```typescript
   // Strategy Pattern: Select segmentation algorithm based on document type
   const strategy = this.strategies.get(documentType);
   ```

## Learning Resources

- [Refactoring Guru - Design Patterns](https://refactoring.guru/design-patterns) - Visual guides with examples
- [Martin Fowler's Blog](https://martinfowler.com) - Authoritative patterns and practices
- [Gang of Four Book](https://en.wikipedia.org/wiki/Design_Patterns) - Original design patterns reference

## Architecture Diagram

```
index.ts (Composition Root)
   │
   ├─ LLMServiceFactory ──────────┐ (Factory Pattern)
   │    ├─ OpenAILLMService       │
   │    ├─ AnthropicLLMService    │
   │    └─ OpenRouterLLMService   │
   │                               │
   ├─ Neo4jRepository ────────────┤ (Repository Pattern)
   ├─ QdrantVectorStore ──────────┤
   │                               │
   ├─ SemanticChunker ────────────┤ (Strategy Pattern)
   │    ├─ FMEASegmentationStrategy
   │    ├─ IPARSegmentationStrategy
   │    └─ GenericSegmentationStrategy
   │                               │
   ├─ IngestionOrchestrator ──────┤ (Dependency Injection)
   ├─ HybridQueryService ─────────┤ (Facade + Dependency Injection)
   │                               │
   └─ API Routes ─────────────────┘
```

## Pattern Interactions

Patterns work together:

- **Factory** creates implementations → **Dependency Injection** wires them → Services use via interfaces
- **Repository** abstracts data access → **Facade** coordinates multiple repositories
- **Strategy** provides algorithms → **Dependency Injection** selects and injects strategy

Example flow:
```
Factory creates OpenAILLMService
  ↓
DI injects into IngestionOrchestrator
  ↓
Orchestrator uses via LLMService interface
  ↓
Strategy chunks content by document type
  ↓
Repository stores in graph + vectors
  ↓
Facade coordinates cross-layer queries
```
