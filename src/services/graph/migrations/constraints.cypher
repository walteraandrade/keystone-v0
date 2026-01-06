// Entity ID uniqueness constraints
CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;

// Entity type-specific constraints
CREATE CONSTRAINT process_id_unique IF NOT EXISTS FOR (p:Process) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT audit_id_unique IF NOT EXISTS FOR (a:Audit) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT document_id_unique IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT failure_mode_id_unique IF NOT EXISTS FOR (fm:FailureMode) REQUIRE fm.id IS UNIQUE;
CREATE CONSTRAINT risk_id_unique IF NOT EXISTS FOR (r:Risk) REQUIRE r.id IS UNIQUE;
CREATE CONSTRAINT control_id_unique IF NOT EXISTS FOR (c:Control) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT finding_id_unique IF NOT EXISTS FOR (f:Finding) REQUIRE f.id IS UNIQUE;
CREATE CONSTRAINT requirement_id_unique IF NOT EXISTS FOR (req:Requirement) REQUIRE req.id IS UNIQUE;

// Business key indexes for deduplication
CREATE INDEX process_business_key IF NOT EXISTS FOR (p:Process) ON (p.name, p.version);
CREATE INDEX failure_mode_code IF NOT EXISTS FOR (fm:FailureMode) ON (fm.code);
CREATE INDEX document_hash IF NOT EXISTS FOR (d:Document) ON (d.contentHash);
CREATE INDEX requirement_code IF NOT EXISTS FOR (req:Requirement) ON (req.code);

// Query performance indexes
CREATE INDEX document_status IF NOT EXISTS FOR (d:Document) ON (d.status);
CREATE INDEX finding_status IF NOT EXISTS FOR (f:Finding) ON (f.status);
CREATE INDEX document_type IF NOT EXISTS FOR (d:Document) ON (d.documentType);
