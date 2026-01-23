export const RISK_EXPOSURE_QUERY = `
  MATCH (r:Risk)
  OPTIONAL MATCH (r)<-[:IMPLIES]-(fm:FailureMode)
  OPTIONAL MATCH (fm)<-[:MITIGATES]-(c:Control)
  WITH r, fm, c,
    CASE 
      WHEN c IS NOT NULL THEN true 
      ELSE false 
    END as hasControl
  RETURN 
    r,
    r.level as level,
    CASE WHEN fm IS NOT NULL THEN true ELSE false END as isImplied,
    hasControl
  ORDER BY r.createdAt DESC
`;

export const CONTROL_EFFECTIVENESS_QUERY = `
  MATCH (c:Control)
  OPTIONAL MATCH (c)-[:MITIGATES]->(fm:FailureMode)-[:IMPLIES]->(r:Risk)
  OPTIONAL MATCH (ps:ProcedureStep)-[:IMPLEMENTS]->(c)
  WITH c, 
    collect(DISTINCT r) as risks,
    count(DISTINCT ps) as stepCount
  RETURN 
    c,
    c.controlType as controlType,
    c.effectiveness as effectiveness,
    size(risks) as riskCount,
    CASE WHEN stepCount > 0 THEN true ELSE false END as hasSteps
`;

export const FAILURE_MODE_ANALYSIS_QUERY = `
  MATCH (fm:FailureMode)
  OPTIONAL MATCH (fm)-[:IMPLIES]->(r:Risk)
  OPTIONAL MATCH (c:Control)-[:MITIGATES]->(fm)
  WITH fm, r, c,
    CASE 
      WHEN fm.rpn IS NULL THEN 'unknown'
      WHEN fm.rpn > 200 THEN 'critical'
      WHEN fm.rpn > 100 THEN 'high'
      WHEN fm.rpn > 50 THEN 'medium'
      ELSE 'low'
    END as rpnCategory
  RETURN 
    fm,
    fm.rpn as rpn,
    rpnCategory,
    CASE WHEN c IS NOT NULL THEN true ELSE false END as hasControl
  ORDER BY COALESCE(fm.rpn, 0) DESC
`;

export const FINDING_TRENDS_QUERY = `
  MATCH (f:Finding)
  RETURN 
    f,
    f.status as status,
    f.priority as priority,
    f.createdAt as createdAt,
    f.updatedAt as updatedAt
  ORDER BY f.createdAt DESC
`;

export const COMPLIANCE_STATUS_QUERY = `
  MATCH (req:Requirement)
  OPTIONAL MATCH (d:Document)-[rel:SATISFIES|FAILS_TO_SATISFY]->(req)
  WITH req, d, rel,
    CASE 
      WHEN rel IS NULL THEN 'unknown'
      WHEN type(rel) = 'SATISFIES' THEN 'satisfied'
      WHEN type(rel) = 'FAILS_TO_SATISFY' THEN 'failed'
    END as satisfactionStatus
  RETURN 
    req,
    req.requirementType as requirementType,
    satisfactionStatus,
    d.documentType as documentType
`;

export const PROCESS_HEALTH_QUERY = `
  MATCH (p:Process)
  OPTIONAL MATCH (ps:ProcedureStep)
  WHERE ps.processId = p.id
  OPTIONAL MATCH (p)<-[:EVALUATES]-(a:Audit)-[:USES]->(d:Document)-[:IDENTIFIES]->(fm:FailureMode)-[:IMPLIES]->(r:Risk)
  WITH p, 
    count(DISTINCT ps) as procedureStepCount,
    collect(DISTINCT r) as risks
  RETURN 
    p,
    p.name as name,
    p.version as version,
    CASE WHEN procedureStepCount > 0 THEN true ELSE false END as hasProcedures,
    size([r IN risks WHERE r.level = 'CRITICAL']) as criticalRiskCount
  ORDER BY p.createdAt DESC
`;

export const RISK_TRENDS_QUERY = `
  MATCH (r:Risk)
  WITH r,
    date(r.createdAt) as riskDate,
    r.level as level
  RETURN 
    riskDate,
    level,
    count(r) as count
  ORDER BY riskDate DESC
  LIMIT 100
`;

export const FINDING_RESOLUTION_TRENDS_QUERY = `
  MATCH (f:Finding)
  WHERE f.status IN ['RESOLVED', 'CLOSED']
  WITH f,
    date(f.createdAt) as createdDate,
    date(f.updatedAt) as resolvedDate,
    duration.between(datetime(f.createdAt), datetime(f.updatedAt)).days as resolutionDays
  RETURN 
    createdDate,
    resolvedDate,
    resolutionDays,
    count(f) as count
  ORDER BY resolvedDate DESC
  LIMIT 100
`;

export const CROSS_DOCUMENT_ENTITIES_QUERY = `
  MATCH (e:Entity)
  OPTIONAL MATCH (e)-[:EXTRACTED_FROM]->(ex:Extraction)-[:SOURCED_FROM]->(d:Document)
  OPTIONAL MATCH (d2:Document)-[:IDENTIFIES]->(e)
  WITH e, collect(DISTINCT d) + collect(DISTINCT d2) as allDocs
  WITH e, [doc IN allDocs WHERE doc IS NOT NULL] as documents
  WHERE size(documents) > 1
  RETURN 
    e,
    e.type as entityType,
    size(documents) as documentCount,
    [doc IN documents | { id: doc.id, fileName: doc.fileName, documentType: doc.documentType }] as documents
  ORDER BY documentCount DESC, e.createdAt DESC
`;

export const DOCUMENT_COVERAGE_QUERY = `
  MATCH (d:Document)
  OPTIONAL MATCH (d)-[:IDENTIFIES]->(fm:FailureMode)
  OPTIONAL MATCH (fm)-[:IMPLIES]->(r1:Risk)
  OPTIONAL MATCH (fm)<-[:MITIGATES]-(c1:Control)
  OPTIONAL MATCH (c2:Control)-[:EXTRACTED_FROM]->(ex1:Extraction)-[:SOURCED_FROM]->(d)
  OPTIONAL MATCH (c2)-[:MITIGATES]->(r2:Risk)
  OPTIONAL MATCH (r3:Risk)-[:EXTRACTED_FROM]->(ex2:Extraction)-[:SOURCED_FROM]->(d)
  OPTIONAL MATCH (e:Entity)-[:EXTRACTED_FROM]->(ex3:Extraction)-[:SOURCED_FROM]->(d)
  WITH d, 
    collect(DISTINCT r1) + collect(DISTINCT r2) + collect(DISTINCT r3) as allRisks,
    collect(DISTINCT c1) + collect(DISTINCT c2) as allControls,
    collect(DISTINCT fm) as failureModes,
    collect(DISTINCT e) as extractedEntities
  WITH d,
    [r IN allRisks WHERE r IS NOT NULL] as risks,
    [c IN allControls WHERE c IS NOT NULL] as controls,
    failureModes,
    extractedEntities
  RETURN 
    d.id as documentId,
    d.fileName as fileName,
    d.documentType as documentType,
    size(risks) as riskCount,
    size(controls) as controlCount,
    size([fm IN failureModes WHERE fm IS NOT NULL]) as failureModeCount,
    size([e IN extractedEntities WHERE e IS NOT NULL]) as extractedEntityCount,
    [r IN risks | { id: r.id, level: r.level, description: r.description }] as risks,
    [c IN controls | { id: c.id, controlType: c.controlType, description: c.description }] as controls
  ORDER BY d.fileName
`;

export const SHARED_ENTITY_NETWORK_QUERY = `
  MATCH (d1:Document)
  MATCH (d2:Document)
  WHERE d1.id <> d2.id
  WITH d1, d2
  OPTIONAL MATCH (d1)-[:IDENTIFIES]->(e:Entity)<-[:IDENTIFIES]-(d2)
  WITH d1, d2, collect(DISTINCT e) as shared1
  OPTIONAL MATCH (d1)-[:IDENTIFIES]->(fm1:FailureMode)-[:IMPLIES]->(r:Risk)<-[:IMPLIES]-(fm2:FailureMode)<-[:IDENTIFIES]-(d2)
  WITH d1, d2, shared1, collect(DISTINCT r) as shared2
  OPTIONAL MATCH (c1:Control)-[:EXTRACTED_FROM]->(ex1:Extraction)-[:SOURCED_FROM]->(d1),
        (c1)-[:MITIGATES]->(r2:Risk)<-[:MITIGATES]-(c2:Control)-[:EXTRACTED_FROM]->(ex2:Extraction)-[:SOURCED_FROM]->(d2)
  WHERE c1 <> c2
  WITH d1, d2, shared1, shared2, collect(DISTINCT r2) as shared3
  OPTIONAL MATCH (e2:Entity)-[:EXTRACTED_FROM]->(ex3:Extraction)-[:SOURCED_FROM]->(d1),
        (e2)-[:EXTRACTED_FROM]->(ex4:Extraction)-[:SOURCED_FROM]->(d2)
  WHERE ex3 <> ex4
  WITH d1, d2, shared1, shared2, shared3, collect(DISTINCT e2) as shared4
  WITH d1, d2,
    [e IN (shared1 + shared2 + shared3 + shared4) WHERE e IS NOT NULL] as sharedEntities
  WHERE size(sharedEntities) > 0
  RETURN 
    d1.id as doc1Id,
    d1.fileName as doc1FileName,
    d1.documentType as doc1Type,
    d2.id as doc2Id,
    d2.fileName as doc2FileName,
    d2.documentType as doc2Type,
    size(sharedEntities) as sharedCount,
    [e IN sharedEntities | { id: e.id, type: e.type }] as sharedEntities
  ORDER BY sharedCount DESC
`;

export const ENTITY_PROVENANCE_QUERY = `
  MATCH (e:Entity {id: $entityId})
  OPTIONAL MATCH (e)-[:EXTRACTED_FROM]->(ex:Extraction)-[:SOURCED_FROM]->(d:Document)
  RETURN 
    e,
    collect(DISTINCT {
      extractionId: ex.id,
      sourceDocumentId: d.id,
      fileName: d.fileName,
      documentType: d.documentType,
      extractedBy: ex.extractedBy,
      extractedAt: ex.extractedAt,
      confidence: ex.confidence,
      section: ex.section,
      pageNumber: ex.pageNumber,
      lineRangeStart: ex.lineRangeStart,
      lineRangeEnd: ex.lineRangeEnd
    }) as provenance
`;

export const FPS_MATURITY_QUERY = `
  MATCH (d:Document)
  OPTIONAL MATCH (c:Control)-[:EXTRACTED_FROM]->(ex:Extraction)-[:SOURCED_FROM]->(d)
  OPTIONAL MATCH (ps:ProcedureStep)-[:IMPLEMENTS]->(c)
  WITH d, 
    count(DISTINCT ps) as stepCount,
    count(DISTINCT c) as controlCount
  WITH d,
    CASE 
      WHEN stepCount > 0 THEN stepCount
      WHEN controlCount > 0 THEN controlCount
      ELSE 0
    END as totalProcedures
  OPTIONAL MATCH (c2:Control)-[:EXTRACTED_FROM]->(ex2:Extraction)-[:SOURCED_FROM]->(d)
  OPTIONAL MATCH (f:Finding)-[:REFERENCES]->(c2)
  WITH d, totalProcedures,
    count(DISTINCT c2.id) as controlsWithFindings,
    count(DISTINCT CASE WHEN f IS NOT NULL AND f.status IN ['OPEN', 'IN_PROGRESS'] THEN c2.id END) as nonCompliantControls
  OPTIONAL MATCH (ps2:ProcedureStep)-[:IMPLEMENTS]->(c3:Control)-[:EXTRACTED_FROM]->(ex3:Extraction)-[:SOURCED_FROM]->(d)
  OPTIONAL MATCH (f2:Finding)-[:REFERENCES]->(c3)
  WITH d, totalProcedures, controlsWithFindings, nonCompliantControls,
    count(DISTINCT ps2.id) as stepsWithFindings,
    count(DISTINCT CASE WHEN f2 IS NOT NULL AND f2.status IN ['OPEN', 'IN_PROGRESS'] THEN ps2.id END) as nonCompliantSteps
  RETURN 
    d.id as documentId,
    d.fileName as fileName,
    d.documentType as documentType,
    totalProcedures,
    (controlsWithFindings + stepsWithFindings) as auditedProcedures,
    (nonCompliantControls + nonCompliantSteps) as nonCompliantCount
  ORDER BY d.fileName
`;
