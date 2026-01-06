export const GET_AUDIT_SUMMARY = `
  MATCH (a:Audit {id: $auditId})
  OPTIONAL MATCH (a)-[:EVALUATES]->(p:Process)
  OPTIONAL MATCH (a)-[:USES]->(d:Document)
  OPTIONAL MATCH (d)-[:IDENTIFIES]->(fm:FailureMode)
  OPTIONAL MATCH (fm)-[:IMPLIES]->(r:Risk)
  WHERE r.level IN ['HIGH', 'CRITICAL']
  OPTIONAL MATCH (c:Control)-[:MITIGATES]->(fm)
  OPTIONAL MATCH (f:Finding)-[:ADDRESSES]->(fm)
  RETURN
    a,
    p.id as processId,
    p.name as processName,
    p.version as processVersion,
    collect(DISTINCT {
      id: d.id,
      documentType: d.documentType,
      uploadedAt: d.uploadedAt
    }) as documents,
    count(DISTINCT fm) as failureModeCount,
    count(DISTINCT r) as highRiskCount,
    count(DISTINCT c) as controlCount,
    count(DISTINCT f) as findingCount
`;

export const GET_AUDIT_RELATIONSHIP_STATS = `
  MATCH (a:Audit {id: $auditId})-[:USES]->(d:Document)
  OPTIONAL MATCH (d)-[:IDENTIFIES]->(fm:FailureMode)-[:IMPLIES]->(r:Risk)
  OPTIONAL MATCH (c:Control)-[:MITIGATES]->(fm)
  RETURN
    count(DISTINCT fm) + '->' + count(DISTINCT r) as fmToRisk,
    count(DISTINCT c) + '->' + count(DISTINCT fm) as controlToFm
`;
