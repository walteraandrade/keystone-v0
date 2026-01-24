# Development Guide

## Configuration

### Environment Variables

Required environment variables (see `.env.example`):

```bash
# LLM Provider
LLM_PROVIDER=openai          # or anthropic or openrouter
OPENAI_API_KEY=sk-...        # if using OpenAI
ANTHROPIC_API_KEY=sk-ant-... # if using Anthropic
OPENROUTER_API_KEY=sk-or-... # if using OpenRouter
LLM_MODEL=gpt-4-turbo        # or claude-sonnet-4-5-20250929 or any OpenRouter model

# Embedding
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# Neo4j (defaults work for Docker Compose)
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Qdrant (defaults work for Docker Compose)
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=audit_documents

# Storage
DOCUMENT_STORAGE_PATH=./data/documents
MAX_UPLOAD_SIZE_MB=100

# Extraction
MIN_CONFIDENCE_THRESHOLD=0.7

# Extraction Logging (v1.1.0)
EXTRACTION_LOG_ENABLED=true
EXTRACTION_LOG_DB=./data/extraction.db

# Cleanup (v1.1.0)
CLEANUP_ENABLED=true
CLEANUP_OLDER_THAN_HOURS=24
```

### Config Validation

Configuration is validated using Zod schemas in `src/config/validation.ts`. Invalid configuration will cause the server to fail on startup with clear error messages.

## Docker Setup

### Start Databases

Start Neo4j and Qdrant using Docker Compose:

```bash
bun docker:up
```

Wait for services to be healthy (~30s). Verify with:

```bash
docker ps
```

You should see:
- `keystone-neo4j` on ports 7474 (HTTP), 7687 (Bolt)
- `keystone-qdrant` on ports 6333 (HTTP), 6334 (gRPC)

### Stop Databases

```bash
bun docker:down
```

### Reset Databases

To delete all data and start fresh:

```bash
bun docker:down -v  # Delete volumes
bun docker:up
bun migrate
```

## Database Migrations

### Run Neo4j Migrations

Create constraints and indexes for deduplication and performance:

```bash
bun migrate
```

This runs `src/services/graph/migrations/constraints.cypher` which creates:
- Unique constraints on business keys (Process name+version, FailureMode code, etc.)
- Indexes on frequently queried properties
- Node labels for entity types

**Note**: Migrations are idempotent (safe to run multiple times).

## Development Commands

### Start Development Server

```bash
bun dev
```

Server runs at `http://localhost:3003` with hot reload.

### Build for Production

```bash
bun build
```

Outputs to `dist/index.js`.

### Run Tests

```bash
bun test
```

### Run Validation Scripts

Phase-specific validation (from IMPLEMENTATION_PLAN.md):

```bash
bun run validate:phase1  # Domain layer
bun run validate:phase2  # Service layer
bun run validate:phase3  # SQLite extraction
bun run validate:phase4  # Cleanup endpoint
bun run validate:phase5  # Coverage queries
bun run validate:phase6  # Documentation
bun run validate:all    # All phases
```

## Project Structure

```
src/
├── api/
│   ├── routes.ts         # Route registration
│   ├── handlers/         # Request handlers (ingest, query, audit, coverage, admin)
│   └── schemas/          # JSON schemas (validation)
├── config/               # Environment config with Zod validation
├── domain/               # Entity and relationship types
├── services/
│   ├── graph/            # Neo4j repository (CRUD, patterns, expansion) [Repository Pattern]
│   ├── vector/           # Qdrant + embeddings (search, scroll, batch) [Repository Pattern]
│   ├── storage/          # Document file storage
│   ├── llm/              # LLM abstraction (OpenAI/Anthropic/OpenRouter) [Factory Pattern]
│   ├── chunking/          # Semantic chunking (strategies, token splitting) [Strategy Pattern]
│   ├── query/            # Hybrid query service (4 patterns) [Facade Pattern]
│   ├── ingestion/        # Pipeline orchestration
│   └── extraction/       # SQLite extraction logging (v1.1.0)
└── utils/                # Logger, errors, UUID
```

## Troubleshooting

### Connection Errors

**Neo4j connection failed**:
```bash
docker logs keystone-neo4j
# Check if Neo4j is running and credentials match .env
```

Common issues:
- Neo4j not started: `bun docker:up`
- Wrong password: Check `NEO4J_PASSWORD` in `.env`
- Wrong URI: Check `NEO4J_URI` (should be `bolt://localhost:7687`)

**Qdrant connection failed**:
```bash
docker logs keystone-qdrant
# Qdrant should start quickly, check URL in .env
```

Common issues:
- Qdrant not started: `bun docker:up`
- Wrong URL: Check `QDRANT_URL` (should be `http://localhost:6333`)

### Extraction Errors

**Confidence below threshold**:
- Review extracted entities in logs
- Adjust `MIN_CONFIDENCE_THRESHOLD` in `.env` (lower = more permissive)
- Check if document format matches expected structure
- Review extraction logs in SQLite: `sqlite3 ./data/extraction.db "SELECT * FROM extraction_log ORDER BY timestamp DESC LIMIT 5;"`

**LLM API errors**:
- Verify API key is valid
- Check rate limits/quota
- Review LLM provider status page
- Check `LLM_PROVIDER` and `LLM_MODEL` in `.env`

**Document processing errors**:
- Check file format (FMEA should be `.xlsx`, IPAR should be `.pdf`)
- Verify file is not corrupted
- Check file size (max `MAX_UPLOAD_SIZE_MB`)

### Database Issues

**Constraint violations**:
```bash
bun migrate  # Re-run migrations
```

**Reset databases**:
```bash
bun docker:down -v  # Delete volumes
bun docker:up
bun migrate
```

**Neo4j query performance**:
- Check indexes exist: `SHOW INDEXES` in Neo4j Browser
- Review slow queries in logs
- Consider adding indexes for frequently queried properties

**Qdrant collection issues**:
- Check collection exists: `curl http://localhost:6333/collections/audit_documents`
- Recreate collection if corrupted (data will be lost)

### Build Errors

**TypeScript compilation errors**:
```bash
bun run build  # See full error output
```

Common issues:
- Missing dependencies: `bun install`
- Type errors: Check `tsconfig.json` settings
- Import path errors: Use `.js` extension in imports (Bun requirement)

### Runtime Errors

**Port already in use**:
- Change port in Fastify server config
- Or kill process using port 3003: `lsof -ti:3003 | xargs kill`

**Memory issues**:
- Reduce `MAX_UPLOAD_SIZE_MB`
- Process documents in smaller batches
- Check chunking strategy isn't creating oversized chunks

## Adding New Features

### New Document Type

1. Create segmentation strategy: `src/services/chunking/strategies/NewTypeSegmentationStrategy.ts`
2. Register in `SemanticChunker`: `strategies.set('newtype', new NewTypeSegmentationStrategy())`
3. Add extraction prompt: `src/services/llm/prompts/newtype-extraction.ts`
4. Update `DocumentProcessor` to detect new type
5. Update domain model if new entity types needed

### New LLM Provider

1. Create service: `src/services/llm/NewProviderLLMService.ts`
2. Implement `LLMService` interface
3. Add factory case: `LLMServiceFactory.ts`
4. Add config validation: `src/config/validation.ts`
5. Update `.env.example`

### New Query Pattern

1. Add method to `HybridQueryService`: `src/services/query/HybridQueryService.ts`
2. Create handler: `src/api/handlers/query.handler.ts`
3. Create schema: `src/api/schemas/query.schema.ts`
4. Register route: `src/api/routes.ts`
5. Update API docs: `docs/API.md`

### New Entity Type

1. Create entity interface: `src/domain/entities/NewEntity.ts`
2. Add to entity union: `src/domain/entities/index.ts`
3. Add validation: `src/services/ingestion/ValidationService.ts`
4. Add deduplication: `src/services/graph/Neo4jRepository.ts`
5. Update domain model: `docs/DOMAIN_MODEL.md`
6. Update ontology versioning: `docs/ONTOLOGY_VERSIONING.md`

## Logging

Logs use Pino logger with structured JSON output.

**Log levels**:
- `error`: Errors that require attention
- `warn`: Warnings (e.g., graceful degradation)
- `info`: General information (ingestion start, completion)
- `debug`: Detailed debugging information

**View logs**:
```bash
bun dev | jq  # Pretty-print JSON logs
```

## Testing

### Unit Tests

Mock dependencies via interfaces:

```typescript
const mockGraphRepo: GraphRepository = {
  createEntity: jest.fn().mockResolvedValue('entity-123'),
  // ...
};
```

### Integration Tests

Use real database connections:

```typescript
const graphRepo = new Neo4jRepository();
await graphRepo.connect();
// ... test ...
await graphRepo.disconnect();
```

### Test Data

Sample documents in `tests/fixtures/`:
- `sample-fmea.xlsx`: Sample FMEA spreadsheet
- `sample-ipar.pdf`: Sample IPAR PDF

## Performance Tuning

### Ingestion Performance

- **LLM extraction**: Largest bottleneck (3-4s). Consider faster models or parallel extraction.
- **Embedding generation**: Batch embeddings when possible (200-300ms for batch).
- **Graph transactions**: Keep transaction scope minimal.

### Query Performance

- **Vector search**: Qdrant HNSW index is fast (<10ms for 100K vectors).
- **Graph traversal**: Add indexes for frequently traversed relationships.
- **Hybrid queries**: Cache embeddings for repeated queries.

## See Also

- [Architecture](ARCHITECTURE.md) - System design and patterns
- [API Reference](API.md) - All endpoints
- [Domain Model](DOMAIN_MODEL.md) - Entity and relationship definitions




