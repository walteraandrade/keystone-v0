# Keystone Audit Ingestion Service v0

Backend-only service for ingesting audit documents (FMEA, IPAR), extracting structured knowledge via AI agents, and persisting to graph database.

## Architecture

**Graph DB (Neo4j)**: Single source of truth for entities, relationships, versions, and conclusions
**Vector DB (Qdrant)**: Auxiliary semantic retrieval, always references graph node IDs
**LLM Layer**: Abstracted interface supporting OpenAI/Anthropic for extraction
**Framework**: Fastify + TypeScript, running on Bun

### Key Principles

1. **Graph is authoritative** - All entities and relationships live in Neo4j
2. **Vectors are disposable** - Qdrant stores embeddings that always reference graph nodes
3. **Immutable entities** - Changes create new versions linked via SUPERSEDES relationships
4. **Lossless ingestion** - Original documents preserved, extraction traceable to source sections

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
- `LLM_PROVIDER=openai` or `anthropic`
- `OPENAI_API_KEY=sk-...` or `ANTHROPIC_API_KEY=sk-ant-...`
- `LLM_MODEL=gpt-4-turbo` or `claude-sonnet-4-5-20250929`

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

Server runs at `http://localhost:3000`

## API Usage

### Health Check
```bash
curl http://localhost:3000/health
```

Returns service status for Neo4j, Qdrant, and LLM.

### Ingest Document

Upload FMEA or IPAR document for extraction:

```bash
curl -X POST http://localhost:3000/ingest \
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

### Get Audit Summary

Retrieve audit summary from graph:

```bash
curl http://localhost:3000/audit/aud-001/summary
```

**Response (200)**:
```json
{
  "auditId": "aud-001",
  "process": {
    "id": "proc-456",
    "name": "Manufacturing Line A",
    "version": "2.1"
  },
  "documents": [
    {
      "id": "doc-abc-123",
      "documentType": "fmea",
      "uploadedAt": "2026-01-06T10:30:00Z"
    }
  ],
  "statistics": {
    "totalFailureModes": 12,
    "highRisks": 3,
    "controlsImplemented": 15,
    "findings": 4
  }
}
```

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
LLM_PROVIDER=openai          # or anthropic
OPENAI_API_KEY=sk-...        # if using OpenAI
ANTHROPIC_API_KEY=sk-ant-... # if using Anthropic
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
9. Chunk text → generate embeddings → store vectors
10. Return result

**Rollback on failure**: Mark Document as FAILED, preserve error + AI output.

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

## Project Structure

```
src/
├── api/              # Fastify routes and handlers
├── config/           # Environment config with Zod validation
├── domain/           # Entity and relationship types
├── services/
│   ├── graph/        # Neo4j repository
│   ├── vector/       # Qdrant + embeddings
│   ├── storage/      # Document storage
│   ├── llm/          # LLM abstraction + prompts
│   └── ingestion/    # Pipeline orchestration
└── utils/            # Logger, errors, UUID
```
