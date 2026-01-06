
# Audit Knowledge Ingestion Service — Product Brief

## Purpose
Build a backend-only service that ingests audit-related documents (e.g. FMEA spreadsheets, IPAR PDFs),
extracts structured audit knowledge using AI agents, and stores this knowledge in a graph database as
the single source of truth, with an accompanying vector database used strictly for semantic retrieval
and context lookup.

The system must ensure:
- no duplication of audit truth
- clear provenance and traceability
- defensible, explainable structure suitable for audits and compliance

This is a v0 focused on correct modeling and ingestion, not advanced querying or UI.

## Core Principles (Non-Negotiable)

1. Graph database is authoritative  
All entities, relationships, versions, and audit conclusions live in the graph.

2. Vector database is auxiliary  
Vectors store embeddings of document text chunks and always reference graph node IDs.
Vectors never introduce new facts or relationships.

3. AI agents propose, system validates  
LLMs extract candidate entities and relations; the backend validates, normalizes, and persists them.

4. Lossless ingestion  
Original documents are stored or referenced; extracted structure must be traceable back to source sections.

## High-Level Architecture

- Backend API: Node.js + TypeScript
- AI Extraction: LLM agents invoked from backend
- Graph DB: Neo4j (or equivalent)
- Vector DB: Any modern vector store
- Storage: Object storage or filesystem for raw documents

No frontend. Interaction via curl or HTTP clients.

## Core Domain Model

### Entities (Graph Nodes)
- Process
- Audit
- Document
- FailureMode
- Risk
- Control
- Finding
- Requirement

Each entity:
- has a stable internal ID
- carries minimal required properties
- includes provenance metadata

### Relationships (Graph Edges)
- Audit EVALUATES Process
- Audit USES Document
- Document IDENTIFIES FailureMode
- FailureMode IMPLIES Risk
- Control MITIGATES FailureMode
- Finding ADDRESSES FailureMode
- Finding REFERENCES Control
- Document SATISFIES / FAILS_TO_SATISFY Requirement
- Document SUPERSEDES Document

## AI Agent Responsibilities

LLM agents are used only during ingestion to:
- parse documents into logical sections
- identify candidate entities and properties
- propose relationships
- output strict JSON with confidence and source references

Agents never assign IDs or persist data.

## Ingestion Flow

1. Client uploads document
2. Backend stores raw document
3. Backend invokes AI extraction agent
4. Agent returns structured candidates
5. Backend validates, deduplicates, resolves, and persists to graph
6. Backend chunks text, generates embeddings, stores vectors referencing graph IDs

If step 5 fails, nothing is persisted.

## API Scope (v0)

- POST /ingest
- GET /audit/:id/summary

No search APIs in v0.

## Non-Goals

- No UI
- No real-time querying
- No agent self-learning
- No vector-only answers
- No LLM-generated conclusions without graph backing

## Success Criteria

- Removing the vector DB does not invalidate conclusions
- All facts trace to documents and sections
- Relationships are explainable to auditors
- New document types can be added without refactoring

Guiding question:
“Can this system explain itself to a regulator without mentioning embeddings or AI?”
