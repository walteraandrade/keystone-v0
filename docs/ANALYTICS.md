# Auditor Analytics Documentation

## Overview

The Auditor Analytics system provides business-focused insights for auditors about industry procedures, risk exposure, control effectiveness, and compliance status. These analytics are separate from technical document health metrics and focus on operational and compliance insights.

## Endpoints

### GET /analytics/audit/portfolio

Returns a complete portfolio overview with all analytics in a single response.

**Response Structure**:
- `riskExposure`: Risk distribution, unmitigated risks, trends, implied vs explicit
- `controlEffectiveness`: Control coverage, effectiveness ratings, operationalization
- `failureModeAnalysis`: RPN distribution, unmitigated high-RPN failure modes
- `findingTrends`: Status distribution, priority breakdown, resolution rates
- `complianceStatus`: Requirement satisfaction, gaps, by document type
- `processHealth`: Process coverage, version tracking, risk exposure
- `generatedAt`: ISO timestamp of report generation

### GET /analytics/audit/risk-exposure

**Metrics Provided**:
- Total risks by level (CRITICAL, HIGH, MEDIUM, LOW)
- Unmitigated risks breakdown (risks without controls)
- Risk trends over time (time-series data)
- Implied vs explicit risks (explicit = direct Risk entities, implied = from FailureMode IMPLIES Risk)

**Key Insights**:
- Identifies critical unmitigated risks requiring immediate attention
- Shows risk distribution across the portfolio
- Tracks risk trends to identify increasing/decreasing exposure

### GET /analytics/audit/control-effectiveness

**Metrics Provided**:
- Control coverage: Percentage of risks with mitigating controls
- Effectiveness distribution: Average effectiveness by control type
- Control type breakdown: PREVENTIVE, DETECTIVE, CORRECTIVE
- Operationalization: Controls with vs without ProcedureSteps

**Key Insights**:
- Identifies risks without controls (coverage gaps)
- Shows control effectiveness ratings
- Highlights controls that exist but aren't operationalized (no ProcedureSteps)

### GET /analytics/audit/failure-modes

**Metrics Provided**:
- RPN distribution by range (critical >200, high 100-200, medium 50-100, low <50)
- Unmitigated high-RPN failure modes
- Mitigation coverage percentage

**Key Insights**:
- Identifies high-risk failure modes requiring immediate mitigation
- Shows overall failure mode risk distribution
- Highlights failure modes without controls

### GET /analytics/audit/findings

**Metrics Provided**:
- Status distribution (OPEN, IN_PROGRESS, RESOLVED, CLOSED)
- Priority distribution (LOW, MEDIUM, HIGH, CRITICAL)
- Resolution rates (last 30 days, last 90 days, all time)
- Average resolution time in days
- Resolution trends over time

**Key Insights**:
- Tracks finding resolution performance
- Identifies backlog of open findings
- Shows trends in finding resolution rates

### GET /analytics/audit/compliance

**Metrics Provided**:
- Requirement satisfaction rate
- Requirements by type (REGULATORY, COMPLIANCE, INTERNAL, INDUSTRY_STANDARD)
- Compliance gaps (requirements not satisfied)
- Requirements by document type

**Key Insights**:
- Identifies regulatory compliance gaps
- Shows requirement coverage by document type
- Highlights unsatisfied requirements requiring attention

### GET /analytics/audit/process-health

**Metrics Provided**:
- Process coverage (processes with vs without procedures)
- Version distribution
- Risk exposure per process (processes with critical risks)

**Key Insights**:
- Identifies processes without documented procedures
- Tracks process versions
- Highlights high-risk processes requiring attention

## Data Model

All analytics are derived from the knowledge graph entities and relationships:

- **Risk**: Has `level` (CRITICAL/HIGH/MEDIUM/LOW), `likelihood`, `impact`
- **Control**: Has `controlType` (PREVENTIVE/DETECTIVE/CORRECTIVE), `effectiveness`
- **FailureMode**: Has `rpn` (Risk Priority Number), `severity`, `occurrence`, `detection`
- **Finding**: Has `status` (OPEN/IN_PROGRESS/RESOLVED/CLOSED), `priority`
- **Requirement**: Has `requirementType` (REGULATORY/COMPLIANCE/INTERNAL)
- **Process**: Has `name`, `version`

**Relationships**:
- `Control → FailureMode` (MITIGATES)
- `FailureMode → Risk` (IMPLIES)
- `ProcedureStep → Control` (IMPLEMENTS)
- `Document → Requirement` (SATISFIES/FAILS_TO_SATISFY)

## Use Cases

### Risk Management Dashboard
Use `/analytics/audit/risk-exposure` to:
- Monitor overall risk exposure
- Identify unmitigated critical risks
- Track risk trends over time

### Control Effectiveness Review
Use `/analytics/audit/control-effectiveness` to:
- Assess control coverage gaps
- Review control effectiveness ratings
- Identify controls needing operationalization

### Failure Mode Prioritization
Use `/analytics/audit/failure-modes` to:
- Prioritize high-RPN failure modes
- Identify unmitigated critical failure modes
- Track mitigation coverage

### Finding Management
Use `/analytics/audit/findings` to:
- Monitor finding resolution rates
- Track backlog of open findings
- Assess resolution performance trends

### Compliance Monitoring
Use `/analytics/audit/compliance` to:
- Monitor regulatory compliance status
- Identify compliance gaps
- Track requirement satisfaction

### Process Health Assessment
Use `/analytics/audit/process-health` to:
- Identify processes without procedures
- Track process versioning
- Assess process risk exposure

## Traceability

All analytics results are traceable to source documents via entity `provenance` fields. Each entity includes:
- `sourceDocumentId`: Document from which entity was extracted
- `sourceReference`: Section, page number, and line range
- `extractedBy`: LLM model used for extraction
- `confidence`: Extraction confidence score

This ensures all insights are defensible and auditable.

## Performance Considerations

- Portfolio analytics may take several seconds for large datasets
- Individual endpoint queries are optimized for performance
- Consider caching results for frequently accessed analytics
- Time-series trend queries are limited to 100 data points

## Error Handling

All endpoints return standard error responses:
- `500`: Analytics computation failed
- Error messages include details for debugging
