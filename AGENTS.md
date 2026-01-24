# Keystone Audit Knowledge Graph

Document ingestion and normalization for explainable compliance analysis.

## Build

```bash
bun install
bun run build
bun run validate:phaseN  # phase boundary validation
```

## Invariants

1. **Graph = truth**: Neo4j is sole authoritative source; vectors are auxiliary
2. **AI = provisional**: AI proposes entities/relationships; never persists or decides
3. **Traceable**: Every entity traceable to source document + location
4. **Explainable**: Conclusions explainable without embeddings or AI behavior

## Instructions

Read these when working on related tasks:

- [Code Style](docs/AGENTS/code-style.md) — TypeScript, functional patterns, DI
- [Testing](docs/AGENTS/testing.md) — unit/integration conventions
- [Documentation](docs/AGENTS/documentation.md) — when to update which docs
- [Domain Model](docs/DOMAIN_MODEL.md) — ontology, entities, relationships
- [Architecture](docs/ARCHITECTURE.md) — system design, patterns


