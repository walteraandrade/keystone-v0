# API Reference

## Base URL

All endpoints are served at `http://localhost:3003` (default).

## Health Check

### GET /health

Returns Neo4j, Qdrant, and LLM status.

**Example**:

```bash
curl http://localhost:3003/health
```

**Response** (200):

```json
{
  "status": "healthy",
  "neo4j": "connected",
  "qdrant": "connected",
  "llm": "connected"
}
```

## Ingestion

### POST /ingest

Upload FMEA or IPAR document for extraction.

**Request**: `multipart/form-data`

- `file`: Document file (FMEA .xlsx or IPAR .pdf)
- `metadata`: JSON string with optional fields:
  - `auditId` (string): Audit identifier
  - `processName` (string): Process name

**Example**:

```bash
curl -X POST http://localhost:3003/ingest \
  -F "file=@FMEA_SCHUMAG.xlsx" \
  -F 'metadata={"auditId":"aud-001","processName":"Manufacturing Line A"}'
```

**Response** (200):

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

**Response** (400) - Validation error:

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

**Response** (500) - Processing error:

```json
{
  "error": "PROCESSING_ERROR",
  "message": "LLM extraction failed",
  "documentId": "doc-abc-123",
  "status": "failed"
}
```

## Audit

### GET /audit/:id/summary

Retrieve audit summary from graph.

**Example**:

```bash
curl http://localhost:3003/audit/aud-001/summary
```

**Response** (200):

```json
{
  "auditId": "aud-001",
  "process": {
    "id": "proc-123",
    "name": "Manufacturing Line A",
    "version": "1.0"
  },
  "documents": [
    {
      "id": "doc-abc-123",
      "fileName": "FMEA_SCHUMAG.xlsx",
      "type": "fmea",
      "status": "processed"
    }
  ],
  "statistics": {
    "failureModes": 12,
    "risks": 8,
    "controls": 15,
    "findings": 3
  },
  "relationships": {
    "total": 35
  }
}
```

## Query Endpoints

### POST /query/semantic

Semantic search with graph expansion. Find similar content, expand via graph relationships.

**Request Body**:

```json
{
  "query": "medição incorreta das barras",
  "limit": 5,
  "expandDepth": 1,
  "filters": {
    "semanticType": ["fmea_row_group"]
  }
}
```

**Example**:

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

**Response** (200):

```json
{
  "chunks": [
    {
      "id": "chunk-123",
      "score": 0.92,
      "payload": {
        "chunkText": "...",
        "graphNodeId": "fm-001",
        "semanticType": "fmea_row_group",
        "context": "Sheet: FMEA - Schumag, Row 5-7"
      }
    }
  ],
  "entities": [
    {
      "id": "fm-001",
      "type": "FailureMode",
      "code": "FM-001",
      "description": "Medição incorreta das barras"
    }
  ],
  "relatedEntities": [
    {
      "id": "risk-001",
      "type": "Risk",
      "severity": "HIGH"
    },
    {
      "id": "control-001",
      "type": "Control",
      "description": "Calibração periódica"
    }
  ]
}
```

### GET /entities/:entityId/context

Get entity with all chunks mentioning it and provenance.

**Query Parameters**:

- `includeRelationships` (boolean, default: false): Include relationship data

**Example**:

```bash
curl "http://localhost:3003/entities/fm-001/context?includeRelationships=true"
```

**Response** (200):

```json
{
  "entity": {
    "id": "fm-001",
    "type": "FailureMode",
    "code": "FM-001",
    "description": "Medição incorreta das barras",
    "provenance": [
      {
        "sourceDocumentId": "doc-abc-123",
        "sourceReference": {
          "section": "Sheet: FMEA - Schumag",
          "lineRange": [5, 7]
        },
        "confidence": 0.95
      }
    ]
  },
  "chunks": [
    {
      "id": "chunk-123",
      "chunkText": "...",
      "context": "Sheet: FMEA - Schumag, Row 5-7"
    }
  ],
  "relationships": [
    {
      "type": "IMPLIES",
      "target": "risk-001",
      "confidence": 0.92
    }
  ]
}
```

### GET /analytics/ontology

Aggregate chunks by semanticType/context/documentId with optional graph stats.

**Query Parameters**:

- `groupBy` (string): `semanticType`, `context`, or `documentId`
- `includeGraphStats` (boolean, default: false): Include graph entity counts

**Example**:

```bash
curl 'http://localhost:3003/analytics/ontology?groupBy=semanticType&includeGraphStats=true'
```

**Response** (200):

```json
{
  "vectorStats": {
    "totalChunks": 126,
    "avgTokens": 201,
    "grouped": {
      "fmea_row_group": {
        "count": 85,
        "avgTokens": 195
      },
      "ipar_finding": {
        "count": 41,
        "avgTokens": 210
      }
    }
  },
  "graphStats": {
    "entities": {
      "FailureMode": 12,
      "Risk": 8,
      "Control": 15
    },
    "highRiskFailureModes": 3,
    "openFindings": 2
  }
}
```

### POST /query/graph

Query graph patterns, optionally fetch vector context.

**Request Body**:

```json
{
  "entityType": "FailureMode",
  "filters": {
    "rpn": { ">": 100 }
  },
  "relationships": [
    {
      "type": "IMPLIES",
      "direction": "out",
      "targetType": "Risk"
    }
  ],
  "includeVectorContext": true,
  "limit": 10
}
```

**Example**:

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

**Response** (200):

```json
{
  "entities": [
    {
      "id": "fm-001",
      "type": "FailureMode",
      "code": "FM-001",
      "rpn": 150
    }
  ],
  "relationships": [
    {
      "from": "fm-001",
      "to": "risk-001",
      "type": "IMPLIES",
      "confidence": 0.95
    }
  ],
  "vectorContext": [
    {
      "graphNodeId": "fm-001",
      "chunks": [
        {
          "chunkText": "...",
          "context": "Sheet: FMEA - Schumag"
        }
      ]
    }
  ]
}
```

## Coverage Queries

Predefined queries for audit coverage gaps.

### GET /coverage

List available coverage queries.

**Example**:

```bash
curl http://localhost:3003/coverage
```

**Response** (200):

```json
{
  "queries": [
    "risks-without-controls",
    "controls-without-steps",
    "unmitigated-high-rpn",
    "risks-without-procedure-controls",
    "ipar-controls-coverage",
    "procedures-affected-by-ipar-update"
  ]
}
```

### GET /coverage/:queryName

Execute a coverage query.

**Path Parameters**:

- `queryName`: One of `risks-without-controls`, `controls-without-steps`, `unmitigated-high-rpn`, `risks-without-procedure-controls`, `ipar-controls-coverage`, `procedures-affected-by-ipar-update`

**Query Parameters**:

- `threshold` (number, default: 100): RPN threshold (for `unmitigated-high-rpn`)
- `documentId` (string): IPAR document ID (for `ipar-controls-coverage`)
- `iparId` (string): IPAR document ID (for `procedures-affected-by-ipar-update`)

**Examples**:

```bash
# Risks without mitigating controls
curl http://localhost:3003/coverage/risks-without-controls

# Controls without procedure steps
curl http://localhost:3003/coverage/controls-without-steps

# High RPN failure modes without mitigation
curl http://localhost:3003/coverage/unmitigated-high-rpn?threshold=100

# Risks with controls that have no ProcedureStep implementation
curl http://localhost:3003/coverage/risks-without-procedure-controls

# Controls from IPAR without ProcedureStep implementation
curl "http://localhost:3003/coverage/ipar-controls-coverage?documentId=doc-123"

# Processes needing update due to unmitigated IPAR risks
curl "http://localhost:3003/coverage/procedures-affected-by-ipar-update?iparId=doc-123"
```

**Response** (200):

```json
{
  "queryName": "risks-without-controls",
  "entities": [
    {
      "id": "risk-001",
      "type": "Risk",
      "severity": "HIGH",
      "likelihood": "MEDIUM"
    }
  ],
  "count": 3,
  "params": {}
}
```

## Auditor Analytics

Business-focused analytics endpoints for portfolio-wide insights. See [ANALYTICS.md](./ANALYTICS.md) for detailed documentation.

**Available Endpoints:**

- `GET /analytics/audit/portfolio` - Complete portfolio overview
- `GET /analytics/audit/risk-exposure` - Risk distribution and trends
- `GET /analytics/audit/control-effectiveness` - Control coverage and effectiveness
- `GET /analytics/audit/failure-modes` - Failure mode RPN analysis
- `GET /analytics/audit/findings` - Finding status and trends
- `GET /analytics/audit/compliance` - Compliance status and gaps
- `GET /analytics/audit/process-health` - Process coverage and risk exposure

**Example**:

```bash
curl http://localhost:3003/analytics/audit/portfolio
```

## Admin Endpoints

### POST /admin/cleanup

Remove failed documents older than N hours.

**Request Body**:

```json
{
  "olderThanHours": 24
}
```

**Example**:

```bash
curl -X POST http://localhost:3003/admin/cleanup \
  -H 'Content-Type: application/json' \
  -d '{"olderThanHours": 24}'
```

**Response** (200):

```json
{
  "deleted": 5,
  "olderThanHours": 24
}
```

## Error Responses

All endpoints may return error responses:

**400 Bad Request**:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid request parameters"
}
```

**404 Not Found**:

```json
{
  "error": "NOT_FOUND",
  "message": "Entity not found"
}
```

**500 Internal Server Error**:

```json
{
  "error": "PROCESSING_ERROR",
  "message": "Internal server error"
}
```
