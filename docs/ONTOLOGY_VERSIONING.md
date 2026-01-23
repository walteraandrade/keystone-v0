# Ontology Versioning

Current version: **v1.3.0**

## Versioning Strategy

Ontology changes tracked via git tags: `ontology-vX.Y.Z`

- **Major (X)**: Breaking changes (entity removal, relationship semantics change)
- **Minor (Y)**: Additions (new entities, relationships, optional fields)
- **Patch (Z)**: Fixes (validation rules, documentation)

## Entities

| Entity        | Business Key             | Description                         |
| ------------- | ------------------------ | ----------------------------------- |
| Process       | `name + version`         | Manufacturing/business process      |
| Audit         | -                        | Audit event evaluating a process    |
| Document      | -                        | Source document (FMEA, IPAR)        |
| FailureMode   | `code`                   | Potential failure identified        |
| Risk          | -                        | Risk implied by failure mode        |
| Control       | -                        | Mitigation control                  |
| Finding       | -                        | Audit finding                       |
| Requirement   | `code`                   | Regulatory/compliance requirement   |
| ProcedureStep | `stepNumber + processId` | Operational procedure step (v1.1.0) |
| Incident      | `code`                   | Safety incident/PSIF (v1.3.0)       |

All entities inherit: `id`, `type`, `createdAt`, `updatedAt`, `provenance[]`

## Relationships

| Type             | From          | To                  | Properties                      |
| ---------------- | ------------- | ------------------- | ------------------------------- |
| EVALUATES        | Audit         | Process             | date, auditor, scope            |
| USES             | Audit         | Document            | uploadedAt                      |
| IDENTIFIES       | Document      | FailureMode         | section                         |
| IMPLIES          | FailureMode   | Risk                | severity, likelihood            |
| MITIGATES        | Control       | FailureMode         | effectiveness                   |
| MITIGATES        | Control       | Risk                | effectiveness (v1.2.0)          |
| ADDRESSES        | Finding       | FailureMode         | status, priority                |
| REFERENCES       | Finding       | Control             | compliance                      |
| SATISFIES        | Document      | Requirement         | criteriaId                      |
| FAILS_TO_SATISFY | Document      | Requirement         | gaps                            |
| SUPERSEDES       | Entity        | Entity (same type)  | reason, date                    |
| IMPLEMENTS       | ProcedureStep | Control             | coverage (v1.1.0)               |
| APPLIED_IN       | Control       | ProcedureStep       | context (v1.1.0)                |
| RELATES_TO       | Document      | Process             | scope, evaluatedAt (v1.3.0)     |
| CAUSED_BY        | Incident      | FailureMode \| Risk | rootCause, analysis (v1.3.0)    |
| INVOLVED_STEP    | Incident      | ProcedureStep       | wasFollowed, deviation (v1.3.0) |

All relationships include: `confidence`, `sourceReference`, `status?`

## Relationship Status (v1.1.0)

Optional field on all relationships:

- `SUGGESTED` - AI-proposed, awaiting confirmation
- `CONFIRMED` - Human-validated
- `null` - Legacy (pre-v1.1.0)

## Changelog

### v1.3.0

- Added `Incident` entity for PSIF/accident tracking
- Added `RELATES_TO` relationship (Document → Process) for IPAR-procedure association
- Added `CAUSED_BY` relationship (Incident → FailureMode | Risk)
- Added `INVOLVED_STEP` relationship (Incident → ProcedureStep)
- Added coverage queries:
  - `risks-without-procedure-controls`: Risks with controls not implemented in procedures
  - `ipar-controls-coverage`: IPAR controls coverage analysis
  - `procedures-affected-by-ipar-update`: Procedures needing update after IPAR changes

### v1.2.0

- Added `Control → Risk (MITIGATES)` relationship for FPS documents
- FPS prompt extracts direct control-to-risk relationships
- Supports safety procedure sheets where controls mitigate risks directly

### v1.1.0

- Added `ProcedureStep` entity (links controls to operational procedures)
- Added `IMPLEMENTS` relationship (ProcedureStep → Control)
- Added `APPLIED_IN` relationship (Control → ProcedureStep)
- Added `RelationshipStatus` optional field (`SUGGESTED` | `CONFIRMED`)
- Added coverage query endpoints (`/coverage/:queryName`)
- Added cleanup endpoint (`POST /admin/cleanup`)
- Added SQLite extraction logging

### v1.0.0

- Initial ontology
- 8 entity types
- 10 relationship types
