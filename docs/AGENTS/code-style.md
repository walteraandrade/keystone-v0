# Code Style

## TypeScript

- Strict mode enabled (tsconfig handles this)
- Interfaces over types for public APIs
- Explicit error types: `GraphPersistenceError`, `ValidationError`, etc.

## Functional Style

- Pure functions when possible
- Immutable data, explicit data flow
- Avoid comments; clarity from structure and naming
- JSDoc only for workflows needing extra context

## Dependency Injection

- Constructor-based wiring
- Depend on interfaces, not implementations
- Composition root: `src/index.ts`

## Design Patterns

See [DESIGN_PATTERNS.md](../DESIGN_PATTERNS.md) for established patterns:

- Strategy: `src/services/chunking/strategies/`
- Factory: `src/services/llm/LLMServiceFactory.ts`
- Repository: `src/services/graph/`, `src/services/vector/`
- Facade: `src/services/query/HybridQueryService.ts`
