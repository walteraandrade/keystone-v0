# Audit Knowledge Ingestion Service v0 - Implementation Plan

## Architecture

**Graph DB (Neo4j)**: Single source of truth for entities, relationships, versions, conclusions
**Vector DB (Qdrant)**: Auxiliary semantic retrieval, always references graph node IDs
**LLM Layer**: Abstract interface for provider flexibility (OpenAI/Anthropic)
**Framework**: Fastify + TypeScript

## Project Structure

```
/home/walter/Github/smarthow/keystone-v0/
├── docker-compose.yml              # Neo4j + Qdrant local dev
├── .env.example
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Fastify server entry
│   ├── config/
│   │   ├── index.ts                # Env loading + Zod validation
│   │   └── validation.ts
│   ├── api/
│   │   ├── routes.ts
│   │   ├── handlers/
│   │   │   ├── ingest.handler.ts   # POST /ingest
│   │   │   └── audit.handler.ts    # GET /audit/:id/summary
│   │   └── schemas/                # Fastify request/response schemas
│   ├── domain/
│   │   ├── entities/               # Process, Audit, Document, FailureMode, Risk, Control, Finding, Requirement
│   │   │   └── base/
│   │   │       ├── Entity.ts       # Base entity interface
│   │   │       └── Provenance.ts   # Provenance metadata
│   │   └── relationships/
│   │       ├── types.ts            # EVALUATES, USES, IDENTIFIES, IMPLIES, MITIGATES, etc.
│   │       └── validation.ts
│   ├── services/
│   │   ├── ingestion/
│   │   │   ├── IngestionOrchestrator.ts    # Main pipeline coordinator
│   │   │   ├── DocumentProcessor.ts         # Type detection (FMEA/IPAR)
│   │   │   ├── ValidationService.ts         # AI output validation
│   │   │   └── DeduplicationService.ts      # Business key deduplication
│   │   ├── llm/
│   │   │   ├── LLMService.interface.ts      # Abstract LLM contract
│   │   │   ├── OpenAILLMService.ts
│   │   │   ├── AnthropicLLMService.ts
│   │   │   ├── LLMServiceFactory.ts
│   │   │   └── prompts/                     # Extraction prompts
│   │   ├── storage/
│   │   │   ├── DocumentStorage.interface.ts
│   │   │   └── FileSystemStorage.ts         # Local file storage
│   │   ├── graph/
│   │   │   ├── GraphRepository.interface.ts
│   │   │   ├── Neo4jRepository.ts           # Neo4j driver implementation
│   │   │   ├── queries/                     # Cypher queries
│   │   │   └── migrations/
│   │   │       └── constraints.cypher       # Indexes + constraints
│   │   └── vector/
│   │       ├── VectorStore.interface.ts
│   │       ├── QdrantVectorStore.ts
│   │       ├── EmbeddingService.ts
│   │       └── ChunkingService.ts
│   ├── utils/
│   │   ├── logger.ts                        # Pino logger
│   │   ├── errors.ts                        # Custom error classes
│   │   └── uuid.ts
│   └── types/
└── tests/
    ├── fixtures/                            # sample-fmea.xlsx, sample-ipar.pdf
    └── integration/
```

## Domain Model

### Entities (Neo4j Nodes)
All entities extend base with: `id`, `createdAt`, `updatedAt`, `provenance[]`

- **Process**: Manufacturing/business process
- **Audit**: Audit event evaluating a process
- **Document**: Source document (FMEA, IPAR, etc.)
- **FailureMode**: Potential failure identified
- **Risk**: Risk implied by failure mode
- **Control**: Mitigation control
- **Finding**: Audit finding
- **Requirement**: Regulatory/compliance requirement

### Relationships (Neo4j Edges)
All relationships include `confidence` property (0-1 score from LLM) + `sourceReference`

- Audit EVALUATES Process
- Audit USES Document
- Document IDENTIFIES FailureMode
- FailureMode IMPLIES Risk
- Control MITIGATES FailureMode
- Finding ADDRESSES FailureMode
- Finding REFERENCES Control
- Document SATISFIES / FAILS_TO_SATISFY Requirement
- Document SUPERSEDES Document (entity versioning)
- Entity SUPERSEDES Entity (all entity types for versioning)

### Provenance Structure
```typescript
{
  sourceDocumentId: string;
  extractedBy: string;      // LLM model identifier
  extractedAt: string;
  confidence: number;
  sourceReference: {
    section: string;
    pageNumber?: number;
    lineRange?: [number, number];
  }
}
```

### Entity Versioning Strategy (Immutable)
- Entities are **never updated in-place**
- On change: create new version node, link via `SUPERSEDES` edge
- Each version has unique ID, shares business key
- Query pattern: `MATCH (e:FailureMode {code: 'FM-001'})-[:SUPERSEDES*0..]->(latest) WHERE NOT (latest)-[:SUPERSEDES]->() RETURN latest`
- Full audit trail: trace entity evolution over time
- Provenance tracks which document triggered version creation

## Ingestion Pipeline Flow

**IngestionOrchestrator** coordinates:

1. Receive multipart upload
2. Validate file type/size
3. Store raw document → FileSystemStorage
4. Create Document entity (status: PENDING)
5. Detect document type (FMEA/IPAR/generic)
6. Invoke LLM extraction → structured JSON
7. Validate extraction (schema, confidence ≥ 0.7)
8. **Begin graph transaction**
   - Deduplicate entities by business keys
   - Create new entities OR new versions (immutable pattern)
   - Create relationships with confidence scores
   - Update Document status: PROCESSED
9. **Commit transaction**
10. Chunk document text
11. Generate embeddings (OpenAI)
12. Store vectors in Qdrant (payload: graphNodeId)
13. Return success

**Rollback on failure**: Mark Document as FAILED, preserve error + AI output for debugging

## Key Interfaces

### LLMService
```typescript
interface LLMService {
  extract(request: ExtractionRequest): Promise<ExtractionResponse>;
}

interface ExtractionResponse {
  entities: Array<{
    entityType: string;
    properties: Record<string, unknown>;
    confidence: number;               // Entity extraction confidence
    sourceReference: SourceReference;
  }>;
  relationships: Array<{
    from: string;                     // Reference to entity in same response
    to: string;
    type: string;
    confidence: number;               // Relationship confidence (stored on edge)
    properties?: Record<string, unknown>;
    sourceReference: SourceReference;
  }>;
}
```

### GraphRepository
```typescript
interface GraphRepository {
  createEntity<T>(entity: T): Promise<string>;
  findDuplicateEntity<T>(candidate: T): Promise<string | null>;
  createRelationship(from, to, type, props?): Promise<void>;
  getAuditSummary(auditId: string): Promise<AuditSummary>;
  beginTransaction(): Promise<Transaction>;
  commit/rollback(tx: Transaction): Promise<void>;
}
```

### VectorStore
```typescript
interface VectorDocument {
  id: string;
  vector: number[];
  payload: {
    graphNodeId: string;     // CRITICAL: always reference graph
    documentId: string;
    chunkText: string;
    metadata: Record<string, unknown>;
  };
}
```

## Deduplication Strategy

- Use business keys, NOT semantic similarity
- Process: `name + version`
- FailureMode: `code`
- Document: `contentHash`
- On match: check if properties differ
  - If identical: link same provenance (multi-source confirmation)
  - If different: create new version, link via SUPERSEDES edge

## Configuration

**.env variables:**
- Neo4j: URI, user, password
- Qdrant: URL, collection name
- LLM: provider (openai/anthropic), API key, model, max tokens
- Embedding: model, dimension
- Storage: path, max upload size
- Extraction: min confidence (0.7)

**Validation**: Zod schema in `src/config/validation.ts`

## Docker Compose

```yaml
services:
  neo4j:
    image: neo4j:5.15
    ports: [7474, 7687]
    environment:
      NEO4J_AUTH: neo4j/password
      NEO4J_PLUGINS: ["apoc"]

  qdrant:
    image: qdrant/qdrant:latest
    ports: [6333, 6334]
```

## API Endpoints

### POST /ingest
Upload document → extract → persist → return document ID

**Request**: multipart/form-data (file + metadata JSON)
**Response**: `{ documentId, status, entitiesCreated, relationshipsCreated, processingTime }`

### GET /audit/:id/summary
Retrieve audit summary from graph

**Response**: `{ auditId, process, documents[], statistics, relationships }`

## Implementation Sequence

1. **Foundation**: package.json, tsconfig, Docker Compose, config + env validation, Fastify server
2. **Domain Model**: Entity interfaces, relationship types, Neo4j constraints
3. **Repository Layer**: Neo4jRepository implementation, CRUD, transactions, deduplication
4. **LLM Integration**: Interface + OpenAI provider, extraction prompts, mock service
5. **Storage Services**: FileSystemStorage, QdrantVectorStore, EmbeddingService, ChunkingService
6. **Ingestion Pipeline**: DocumentProcessor, ValidationService, IngestionOrchestrator, error handling
7. **API Layer**: Handlers, schemas, error middleware, integration tests
8. **Polish**: README, logging, sample curl commands

## Dependencies

- fastify, @fastify/multipart
- neo4j-driver
- @qdrant/js-client-rest
- openai, @anthropic-ai/sdk
- zod, pino, dotenv, uuid
- xlsx (FMEA), pdf-parse (IPAR)
- vitest (tests)

## Critical Files

- `/home/walter/Github/smarthow/keystone-v0/src/services/ingestion/IngestionOrchestrator.ts` - Pipeline coordinator
- `/home/walter/Github/smarthow/keystone-v0/src/services/llm/LLMService.interface.ts` - LLM abstraction
- `/home/walter/Github/smarthow/keystone-v0/src/services/graph/Neo4jRepository.ts` - Graph persistence
- `/home/walter/Github/smarthow/keystone-v0/src/domain/entities/base/Entity.ts` - Base entity pattern
- `/home/walter/Github/smarthow/keystone-v0/src/config/index.ts` - Config management

## Success Criteria

- Removing vector DB doesn't invalidate conclusions
- All facts trace to document sections
- Relationships explainable to auditors (confidence + source on edges)
- New document types addable without refactoring
- Entity evolution fully traceable via version graph

## Next Steps After Approval

1. Wait for user to provide sample FMEA/IPAR documents
2. Begin implementation starting with foundation (Phase 1)
3. Design extraction prompts based on actual document structure
4. Iterate on confidence thresholds based on real extraction quality
