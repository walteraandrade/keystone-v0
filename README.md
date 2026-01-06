# Keystone Audit Ingestion Service v0

Backend-only service for ingesting audit documents (FMEA, IPAR), extracting structured knowledge via AI agents, and persisting to graph database.

## Architecture

- **Graph DB (Neo4j)**: Single source of truth for entities and relationships
- **Vector DB (Qdrant)**: Auxiliary semantic retrieval, always references graph nodes
- **LLM**: Abstracted interface supporting OpenAI/Anthropic
- **Framework**: Fastify + TypeScript

## Quick Start

### 1. Install dependencies
```bash
bun install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Start databases
```bash
bun docker:up
```

### 4. Run server
```bash
bun dev
```

Server will be available at `http://localhost:3000`

## API Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### POST /ingest (coming soon)
Upload audit document for extraction and ingestion.

### GET /audit/:id/summary (coming soon)
Retrieve audit summary from graph.

## Development

- `bun dev` - Start dev server with watch mode
- `bun build` - Build for production
- `bun test` - Run tests
- `bun docker:up` - Start Neo4j + Qdrant
- `bun docker:down` - Stop databases

## Next Steps

1. Provide sample FMEA/IPAR documents for prompt engineering
2. Complete domain model implementation
3. Build ingestion pipeline

## Success Criteria

- Removing vector DB doesn't invalidate conclusions
- All facts trace to document sections
- Relationships explainable to auditors
- Entity evolution fully traceable
