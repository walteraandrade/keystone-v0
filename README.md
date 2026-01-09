# Keystone Audit Knowledge Graph v0

Ingest audit documents (FMEA, IPAR), extract structured knowledge via LLM, store in graph + vectors. Query via hybrid semantic + graph traversal.

## Architecture

**Graph (Neo4j)** stores authoritative entities/relationships with provenance → **Vectors (Qdrant)** enable semantic retrieval of ontology-aware chunks (FMEA rows, findings, sections) → **Hybrid queries** combine similarity search with graph traversal to surface insights.

- **Graph DB (Neo4j)**: Source of truth for entities, relationships, versions
- **Vector DB (Qdrant)**: Semantic search over chunked content, references graph node IDs
- **LLM Layer**: OpenAI/Anthropic/OpenRouter for extraction
- **Chunking**: Semantic-first (FMEA rows, audit sections), token-enforced (8192 limit)
- **Framework**: Fastify + TypeScript on Bun

### Key Principles

1. **Graph is authoritative** - Entities/relationships in Neo4j, not embeddings
2. **Vectors are disposable** - Qdrant references graph nodes via `graphNodeId`
3. **Immutable entities** - Versions linked via SUPERSEDES relationships
4. **Semantic chunking** - Document ontology over typography (FMEA rows > paragraphs)
5. **Lossless ingestion** - Documents preserved, extraction traceable to source

## Quick Start

### 1. Install dependencies
```bash
bun install
```

### 2. Start databases
```bash
bun docker:up
```

Wait for services to be healthy (~30s). Verify with:
```bash
docker ps
```

### 3. Configure environment
```bash
cp .env.example .env
```

Edit `.env` and set:
- `LLM_PROVIDER=openai`, `anthropic`, or `openrouter`
- API key for chosen provider:
  - `OPENAI_API_KEY=sk-...` (OpenAI)
  - `ANTHROPIC_API_KEY=sk-ant-...` (Anthropic)
  - `OPENROUTER_API_KEY=sk-or-...` (OpenRouter)
- `LLM_MODEL=gpt-4-turbo`, `claude-sonnet-4-5-20250929`, or any OpenRouter model

All other defaults should work for local dev.

### 4. Run Neo4j migrations
```bash
bun migrate
```

This creates constraints and indexes for deduplication and performance.

### 5. Start server
```bash
bun dev
```

Server runs at `http://localhost:3003`

## API Endpoints

### Health Check
```bash
curl http://localhost:3003/health
```

Returns Neo4j, Qdrant, and LLM status.

### Ingest Document

Upload FMEA or IPAR for extraction:

```bash
curl -X POST http://localhost:3003/ingest \
  -F "file=@FMEA_SCHUMAG.xlsx" \
  -F 'metadata={"auditId":"aud-001","processName":"Manufacturing Line A"}'
```

**Response (200)**:
```json
{
  "documentId": "doc-abc-123",
  "status": "processed",
  "entitiesCreated": {
    "FailureMode": 12,
    "Risk": 8,
    "Control": 15
  },
  "relationshipsCreated": 35,
  "processingTime": "4.2s"
}
```

**Response (400)** - Validation error:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Entity confidence 0.45 below threshold 0.7",
  "details": {
    "entityType": "FailureMode",
    "confidence": 0.45
  }
}
```

### Audit Summary

```bash
curl http://localhost:3003/audit/aud-001/summary
```

Returns process, documents, statistics (failure modes, risks, controls, findings).

### Query: Semantic Search → Graph Expansion

Find similar content, expand via graph relationships:

```bash
curl -X POST http://localhost:3003/query/semantic \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "medição incorreta das barras",
    "limit": 5,
    "expandDepth": 1,
    "filters": {"semanticType": ["fmea_row_group"]}
  }'
```

Returns chunks + entities + related entities (FailureMode → Risk, Control).

### Query: Entity Context

Get entity + all chunks mentioning it + provenance:

```bash
curl http://localhost:3003/entities/{entityId}/context?includeRelationships=true
```

Returns entity + chunks with source references + relationships.

### Query: Ontology Analytics

Aggregate chunks by semanticType/context/documentId:

```bash
curl 'http://localhost:3003/analytics/ontology?groupBy=semanticType&includeGraphStats=true'
```

Returns chunk counts, avg tokens, graph entity counts, high-risk items.

### Query: Graph Pattern

Query graph patterns, optionally fetch vector context:

```bash
curl -X POST http://localhost:3003/query/graph \
  -H 'Content-Type: application/json' \
  -d '{
    "entityType": "FailureMode",
    "filters": {"rpn": {">": 100}},
    "relationships": [{
      "type": "IMPLIES",
      "direction": "out",
      "targetType": "Risk"
    }],
    "includeVectorContext": true,
    "limit": 10
  }'
```

Returns entities + relationships + optional chunks.

## Domain Model

### Entities (Neo4j Nodes)

All entities have: `id`, `type`, `createdAt`, `updatedAt`, `provenance[]`

- **Process**: Manufacturing/business process (business key: `name + version`)
- **Audit**: Audit event evaluating a process
- **Document**: Source document (FMEA, IPAR, etc.)
- **FailureMode**: Potential failure identified (business key: `code`)
- **Risk**: Risk implied by failure mode
- **Control**: Mitigation control
- **Finding**: Audit finding
- **Requirement**: Regulatory/compliance requirement (business key: `code`)

### Relationships (Neo4j Edges)

All relationships include `confidence` score and `sourceReference`.

- Audit **EVALUATES** Process
- Audit **USES** Document
- Document **IDENTIFIES** FailureMode
- FailureMode **IMPLIES** Risk
- Control **MITIGATES** FailureMode
- Finding **ADDRESSES** FailureMode
- Finding **REFERENCES** Control
- Document **SATISFIES** / **FAILS_TO_SATISFY** Requirement
- Entity **SUPERSEDES** Entity (versioning)

### Versioning Strategy

Entities are **immutable**. On property changes:
1. Create new version with new ID
2. Link via `SUPERSEDES` relationship
3. Query latest: find nodes without outgoing `SUPERSEDES`

## Configuration

Required environment variables (see `.env.example`):

```bash
# LLM Provider
LLM_PROVIDER=openai          # or anthropic or openrouter
OPENAI_API_KEY=sk-...        # if using OpenAI
ANTHROPIC_API_KEY=sk-ant-... # if using Anthropic
OPENROUTER_API_KEY=sk-or-... # if using OpenRouter
LLM_MODEL=gpt-4-turbo

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
```

## Development

```bash
bun dev          # Start dev server with watch mode
bun build        # Build for production
bun test         # Run tests
bun docker:up    # Start Neo4j + Qdrant
bun docker:down  # Stop databases
bun migrate      # Run Neo4j constraints migration
```

## Ingestion Pipeline

1. Upload document → validate file type/size
2. Store raw document → FileSystemStorage
3. Create Document entity (status: PENDING)
4. Process file → detect type (FMEA/IPAR/generic)
5. Extract with LLM → structured JSON
6. Validate extraction (confidence ≥ 0.7, schema compliance)
7. **Begin graph transaction**
   - Deduplicate entities by business keys
   - Create new entities OR new versions (immutable)
   - Create relationships with confidence scores
   - Update Document status: PROCESSED
8. **Commit transaction**
9. **Semantic chunking** (2-phase):
   - Phase 1: Segment by document ontology (FMEA rows, audit findings, sections)
   - Phase 2: Token enforcement with tiktoken (8192 limit, recursive split with overlap)
10. Generate embeddings → store vectors with `graphNodeId` reference
11. Return result

**Rollback on failure**: Document marked FAILED, error + AI output preserved.

### Chunking Strategies

- **FMEA**: CSV parsing, group by process, preserve sheet context
- **IPAR**: Section-based segmentation (findings, controls, recommendations)
- **Generic**: Paragraph-based with heading context

All chunks include: `semanticType`, `context`, `tokens`, `sourceReference`.

## Troubleshooting

### Connection Errors

**Neo4j connection failed**:
```bash
docker logs keystone-neo4j
# Check if Neo4j is running and credentials match .env
```

**Qdrant connection failed**:
```bash
docker logs keystone-qdrant
# Qdrant should start quickly, check URL in .env
```

### Extraction Errors

**Confidence below threshold**:
- Review extracted entities in logs
- Adjust `MIN_CONFIDENCE_THRESHOLD` in .env (lower = more permissive)
- Check if document format matches expected structure

**LLM API errors**:
- Verify API key is valid
- Check rate limits/quota
- Review LLM provider status page

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

## Success Criteria

✅ Removing vector DB doesn't invalidate conclusions
✅ All facts trace to document sections (provenance)
✅ Relationships explainable to auditors (confidence + source)
✅ Entity evolution fully traceable (SUPERSEDES graph)
✅ New document types addable without refactoring

## Design Patterns

Codebase uses established patterns for clean architecture:

- **Strategy**: Document segmentation algorithms (FMEA, IPAR, generic)
- **Factory**: LLM provider selection (OpenAI/Anthropic/OpenRouter)
- **Repository**: Graph + vector data access abstraction
- **Facade**: Hybrid query coordination (graph + vectors + embeddings)
- **Dependency Injection**: Constructor-based wiring in `index.ts`

[📖 Read design patterns guide →](DESIGN_PATTERNS.md)

## Project Structure

```
src/
├── api/
│   ├── routes.ts         # Route registration
│   ├── handlers/         # Request handlers (ingest, query, audit)
│   └── schemas/          # JSON schemas (validation)
├── config/               # Environment config with Zod validation
├── domain/               # Entity and relationship types
├── services/
│   ├── graph/            # Neo4j repository (CRUD, patterns, expansion) [Repository Pattern]
│   ├── vector/           # Qdrant + embeddings (search, scroll, batch) [Repository Pattern]
│   ├── storage/          # Document file storage
│   ├── llm/              # LLM abstraction (OpenAI/Anthropic/OpenRouter) [Factory Pattern]
│   ├── chunking/         # Semantic chunking (strategies, token splitting) [Strategy Pattern]
│   ├── query/            # Hybrid query service (4 patterns) [Facade Pattern]
│   └── ingestion/        # Pipeline orchestration
└── utils/                # Logger, errors, UUID
```
