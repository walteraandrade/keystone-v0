# Domain Model

## Overview

The domain model represents audit knowledge as a graph of entities and relationships. All entities are immutable and versioned via SUPERSEDES relationships. Every entity and relationship includes provenance metadata linking back to source documents.

## Entities (Graph Nodes)

All entities extend a base interface with:

- `id` (string): Unique identifier (UUID with prefix)
- `type` (string): Entity type discriminator
- `createdAt` (string): ISO 8601 timestamp
- `updatedAt` (string): ISO 8601 timestamp
- `provenance[]` (array): Array of provenance records

### Process

Manufacturing or business process being evaluated.

**Business Key**: `name + version`

**Properties**:

- `name` (string, required): Process name
- `version` (string, required): Process version
- `description` (string, optional): Process description

**Deduplication**: By `name + version` combination.

**Role**: Root entity for audit scope. Audits evaluate processes.

### Audit

Audit event evaluating a process.

**Business Key**: None (created per audit event)

**Properties**:

- `date` (string, optional): Audit date
- `auditor` (string, optional): Auditor name
- `scope` (string, optional): Audit scope description

**Role**: Top-level entity for audit lifecycle. Uses Documents, evaluates Processes.

### Document

Source document (FMEA spreadsheet, IPAR PDF, etc.).

**Business Key**: `contentHash`

**Properties**:

- `fileName` (string, required): Original filename
- `fileType` (string, required): File extension (`.xlsx`, `.pdf`)
- `contentHash` (string, required): SHA-256 hash of file content
- `type` (string, required): Document type (`fmea`, `ipar`, `generic`)
- `status` (string, required): Processing status (`PENDING`, `PROCESSED`, `FAILED`)

**Deduplication**: By `contentHash`. Re-ingesting same document returns existing ID.

**Role**: Preserves provenance, enables traceability. Documents identify FailureModes, satisfy/fail Requirements.

### FailureMode

Potential failure identified in FMEA or audit.

**Business Key**: `code`

**Properties**:

- `code` (string, required): Failure mode code (e.g., "FM-001")
- `description` (string, required): Failure description
- `rpn` (number, optional): Risk Priority Number
- `severity` (number, optional): Severity score (1-10)
- `occurrence` (number, optional): Occurrence score (1-10)
- `detectability` (number, optional): Detectability score (1-10)

**Deduplication**: By `code`. New versions created if properties differ.

**Role**: Core entity linking to Risks and Controls. Documents identify FailureModes.

### Risk

Risk implied by a failure mode.

**Business Key**: None (created per FailureMode)

**Properties**:

- `severity` (string, optional): Risk severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
- `likelihood` (string, optional): Likelihood (`LOW`, `MEDIUM`, `HIGH`)
- `impact` (string, optional): Impact description

**Role**: Quantifies impact of failures. Implied by FailureModes.

### Control

Mitigation measure preventing or detecting failures.

**Business Key**: None (created per control)

**Properties**:

- `description` (string, required): Control description
- `type` (string, optional): Control type (`PREVENTIVE`, `DETECTIVE`, `CORRECTIVE`)
- `effectiveness` (number, optional): Effectiveness score (0-1)

**Role**: Mitigates FailureModes. Implemented by ProcedureSteps (v1.1.0).

### Finding

Audit observation from inspection.

**Business Key**: None (created per finding)

**Properties**:

- `description` (string, required): Finding description
- `status` (string, optional): Finding status (`OPEN`, `CLOSED`, `RESOLVED`)
- `priority` (string, optional): Priority (`LOW`, `MEDIUM`, `HIGH`)

**Role**: Addresses FailureModes, references Controls. Drives corrective actions.

### Requirement

Regulatory or compliance standard (ISO, FDA, etc.).

**Business Key**: `code`

**Properties**:

- `code` (string, required): Requirement code (e.g., "ISO-9001-4.2")
- `description` (string, required): Requirement description
- `standard` (string, optional): Standard name (e.g., "ISO 9001")

**Deduplication**: By `code`.

**Role**: Documents satisfy or fail to satisfy Requirements. Ensures compliance mapping.

### ProcedureStep (v1.1.0)

Operational procedure step implementing controls.

**Business Key**: `stepNumber + processId`

**Properties**:

- `stepNumber` (number, required): Step number in procedure
- `processId` (string, required): Process ID this step belongs to
- `description` (string, required): Step description
- `responsibleRole` (string, optional): Role responsible for step
- `frequency` (string, optional): Execution frequency
- `evidence` (string, optional): Evidence requirements

**Deduplication**: By `stepNumber + processId` combination.

**Role**: Links controls to operational procedures. ProcedureSteps implement Controls.

### Incident (v1.3.0)

Event representing a safety incident or PSIF.

**Business Key**: `code`

**Properties**:

- `code` (string, required): Incident code
- `description` (string, required): Incident description
- `severity` (string, required): `MINOR`, `MODERATE`, `SERIOUS`, `PSIF`
- `status` (string, required): `REPORTED`, `INVESTIGATING`, `ANALYZED`, `CLOSED`
- `occurredAt` (string, required): ISO 8601 timestamp
- `location` (string, optional): Incident location
- `rootCause` (string, optional): `CONTROL_GAP`, `NON_COMPLIANCE`, `UNKNOWN`
- `processId` (string, optional): Related process ID

**Deduplication**: By `code`.

**Role**: Tracks safety incidents for root cause analysis. Links to FailureModes/Risks (what went wrong) and ProcedureSteps (was the step followed).

## Relationships (Graph Edges)

All relationships include:

- `confidence` (number, 0-1): Confidence score from LLM extraction
- `sourceReference` (object): Reference to source document location
- `status` (string, optional, v1.1.0): `SUGGESTED` (AI-proposed) or `CONFIRMED` (validated), `null` for legacy

### EVALUATES

**From**: Audit  
**To**: Process

Audit evaluates a process.

**Properties**:

- `date` (string, optional): Evaluation date
- `auditor` (string, optional): Auditor name
- `scope` (string, optional): Evaluation scope

### USES

**From**: Audit  
**To**: Document

Audit uses a document.

**Properties**:

- `uploadedAt` (string, optional): Upload timestamp

### IDENTIFIES

**From**: Document  
**To**: FailureMode

Document identifies a failure mode.

**Properties**:

- `section` (string, optional): Document section (sheet name, page number)

### IMPLIES

**From**: FailureMode  
**To**: Risk

Failure mode implies a risk.

**Properties**:

- `severity` (string, optional): Implied severity
- `likelihood` (string, optional): Implied likelihood

### MITIGATES

**From**: Control
**To**: FailureMode | Risk

Control mitigates a failure mode or risk directly.

**Properties**:

- `effectiveness` (number, optional): Mitigation effectiveness (0-1)

**Note** (v1.2.0): Control → Risk path added for FPS (Safety Procedure Sheet) documents where controls directly mitigate risks without intermediate failure modes.

### ADDRESSES

**From**: Finding  
**To**: FailureMode

Finding addresses a failure mode.

**Properties**:

- `status` (string, optional): Address status
- `priority` (string, optional): Priority level

### REFERENCES

**From**: Finding  
**To**: Control

Finding references a control.

**Properties**:

- `compliance` (string, optional): Compliance status

### SATISFIES

**From**: Document  
**To**: Requirement

Document satisfies a requirement.

**Properties**:

- `criteriaId` (string, optional): Criteria identifier

### FAILS_TO_SATISFY

**From**: Document  
**To**: Requirement

Document fails to satisfy a requirement.

**Properties**:

- `gaps` (string, optional): Gap description

### SUPERSEDES

**From**: Entity (any type)  
**To**: Entity (same type)

Entity supersedes another entity (versioning).

**Properties**:

- `reason` (string, optional): Supersession reason
- `date` (string, optional): Supersession date

**Role**: Enables immutable versioning. Query latest: find nodes without outgoing SUPERSEDES.

### IMPLEMENTS (v1.1.0)

**From**: ProcedureStep  
**To**: Control

Procedure step implements a control.

**Properties**:

- `coverage` (string, optional): Coverage description

### APPLIED_IN (v1.1.0)

**From**: Control  
**To**: ProcedureStep

Control applied in a procedure step.

**Properties**:

- `context` (string, optional): Application context

### RELATES_TO (v1.3.0)

**From**: Document  
**To**: Process

Document relates to/evaluates a process.

**Properties**:

- `scope` (string, optional): Evaluation scope
- `evaluatedAt` (string, optional): Evaluation date

### CAUSED_BY (v1.3.0)

**From**: Incident  
**To**: FailureMode | Risk

Incident was caused by a failure mode or risk.

**Properties**:

- `rootCause` (string, optional): `CONTROL_GAP`, `NON_COMPLIANCE`, `UNKNOWN`
- `analysis` (string, optional): Analysis description

### INVOLVED_STEP (v1.3.0)

**From**: Incident  
**To**: ProcedureStep

Procedure step involved in an incident.

**Properties**:

- `wasFollowed` (boolean, optional): Whether the step was followed
- `deviation` (string, optional): Description of any deviation

## Versioning Strategy

Entities are **immutable**. On property changes:

1. Create new version with new ID
2. Link via `SUPERSEDES` relationship
3. Query latest: find nodes without outgoing `SUPERSEDES`

**Query Pattern**:

```cypher
MATCH (e:FailureMode {code: 'FM-001'})-[:SUPERSEDES*0..]->(latest)
WHERE NOT (latest)-[:SUPERSEDES]->()
RETURN latest
```

**Benefits**:

- Full audit trail: trace entity evolution over time
- Provenance tracks which document triggered version creation
- No data loss: historical versions preserved

## Provenance Structure

Every entity and relationship includes provenance metadata:

```typescript
{
  sourceDocumentId: string;      // Document that extracted this
  extractedBy: string;          // LLM model identifier
  extractedAt: string;           // ISO 8601 timestamp
  confidence: number;            // Extraction confidence (0-1)
  sourceReference: {
    section: string;             // Document section (sheet name, page)
    pageNumber?: number;         // Page number (for PDFs)
    lineRange?: [number, number]; // Line range (for spreadsheets)
  }
}
```

**Traceability**: Every fact can be traced back to a specific location in a source document.

## Business Keys

Business keys enable deduplication:

| Entity        | Business Key             | Deduplication Logic               |
| ------------- | ------------------------ | --------------------------------- |
| Process       | `name + version`         | Match on both fields              |
| FailureMode   | `code`                   | Match on code, exclude superseded |
| Document      | `contentHash`            | Match on SHA-256 hash             |
| Requirement   | `code`                   | Match on code                     |
| ProcedureStep | `stepNumber + processId` | Match on both fields              |

**Deduplication Flow**:

1. Check if entity with business key exists
2. If exists and properties identical: link provenance (multi-source confirmation)
3. If exists and properties differ: create new version, link via SUPERSEDES
4. If not exists: create new entity

## Relationship Status (v1.1.0)

Optional field on all relationships:

- `SUGGESTED`: AI-proposed relationship, awaiting human confirmation
- `CONFIRMED`: Human-validated relationship
- `null`: Legacy relationships (pre-v1.1.0)

**Usage**: Filter relationships by status in queries to show only confirmed relationships for audit reports.

## See Also

- [Ontology Versioning](ONTOLOGY_VERSIONING.md) - Changelog of ontology changes
- [Architecture](ARCHITECTURE.md) - System design and data flow


