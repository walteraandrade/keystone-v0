export const GET_GRAPH_CONNECTIVITY = `
  MATCH (c:Control)
  OPTIONAL MATCH (c)-[:MITIGATES]->(r:Risk)
  OPTIONAL MATCH (c)-[:MITIGATES]->(fm:FailureMode)
  WITH c, count(DISTINCT r) as directRisks, count(DISTINCT fm) as failureModes
  RETURN 
    count(c) as totalControls,
    count(CASE WHEN directRisks > 0 THEN 1 END) as controlsLinkedToRisks,
    count(CASE WHEN failureModes > 0 THEN 1 END) as controlsLinkedToFailureModes,
    count(CASE WHEN directRisks = 0 AND failureModes = 0 THEN 1 END) as orphanedControls
`;

export const GET_RISK_CONNECTIVITY = `
  MATCH (r:Risk)
  OPTIONAL MATCH (c:Control)-[:MITIGATES]->(r)
  OPTIONAL MATCH (fm:FailureMode)-[:IMPLIES]->(r)
  OPTIONAL MATCH (c2:Control)-[:MITIGATES]->(fm)
  WITH r, 
    count(DISTINCT c) as directControls,
    count(DISTINCT fm) as failureModes,
    count(DISTINCT c2) as indirectControls
  RETURN 
    count(r) as totalRisks,
    count(CASE WHEN directControls > 0 THEN 1 END) as risksWithDirectControls,
    count(CASE WHEN indirectControls > 0 THEN 1 END) as risksWithIndirectControls,
    count(CASE WHEN directControls = 0 AND indirectControls = 0 THEN 1 END) as unmitigatedRisks,
    count(CASE WHEN failureModes = 0 THEN 1 END) as standaloneRisks
`;

export const GET_FAILURE_MODE_CONNECTIVITY = `
  MATCH (fm:FailureMode)
  OPTIONAL MATCH (c:Control)-[:MITIGATES]->(fm)
  OPTIONAL MATCH (fm)-[:IMPLIES]->(r:Risk)
  WITH fm, count(DISTINCT c) as controls, count(DISTINCT r) as risks
  RETURN 
    count(fm) as totalFailureModes,
    count(CASE WHEN controls > 0 THEN 1 END) as mitigatedFailureModes,
    count(CASE WHEN controls = 0 THEN 1 END) as unmitigatedFailureModes,
    count(CASE WHEN risks > 0 THEN 1 END) as failureModesWithRisks,
    count(CASE WHEN risks = 0 THEN 1 END) as orphanedFailureModes
`;

export const GET_REQUIREMENT_CONNECTIVITY = `
  MATCH (req:Requirement)
  OPTIONAL MATCH (d:Document)-[:SATISFIES]->(req)
  OPTIONAL MATCH (d2:Document)-[:FAILS_TO_SATISFY]->(req)
  WITH req, count(DISTINCT d) as satisfied, count(DISTINCT d2) as failed
  RETURN 
    count(req) as totalRequirements,
    count(CASE WHEN satisfied > 0 THEN 1 END) as satisfiedRequirements,
    count(CASE WHEN failed > 0 THEN 1 END) as failedRequirements,
    count(CASE WHEN satisfied = 0 AND failed = 0 THEN 1 END) as unknownRequirements
`;

export const GET_PROCESS_CONNECTIVITY = `
  MATCH (p:Process)
  OPTIONAL MATCH (ps:ProcedureStep)
  WHERE ps.processId = p.name + ':' + p.version
  OPTIONAL MATCH (a:Audit)-[:EVALUATES]->(p)
  OPTIONAL MATCH (a)-[:USES]->(d:Document)
  WITH p, count(DISTINCT ps) as steps, count(DISTINCT d) as documents
  RETURN 
    count(p) as totalProcesses,
    count(CASE WHEN steps > 0 THEN 1 END) as processesWithSteps,
    count(CASE WHEN steps = 0 THEN 1 END) as processesWithoutSteps,
    count(CASE WHEN documents > 0 THEN 1 END) as processesWithDocuments,
    count(CASE WHEN documents = 0 THEN 1 END) as processesWithoutDocuments
`;

export const GET_RELATIONSHIP_COUNTS = `
  MATCH ()-[r]->()
  WITH type(r) as relType, count(r) as count
  RETURN relType, count
  ORDER BY count DESC
`;


