1. Authority of truth

The graph database is the sole source of audit truth.

All entities, relationships, versions, and conclusions must be represented explicitly in the graph.

No fact, relationship, or conclusion may exist only in text, embeddings, or inference.

2. Role of vectors

Vector embeddings are auxiliary and non-authoritative.

Vector data is used only for semantic retrieval and context lookup.

Vector records must always reference graph node IDs.

Removing the vector database must not invalidate any audit conclusion.

3. Role of AI

AI agents may propose candidate entities, properties, and relationships.

AI agents must never assign IDs, persist data, or make final decisions.

All AI outputs are provisional and must be validated by deterministic system logic.

4. Provenance and traceability

Every persisted entity and relationship must be traceable to a source document and a specific location (page, section, row).

Versioning must preserve historical truth; nothing is overwritten or silently updated.

5. Modeling over convenience

Prefer explicit entities and relationships over implicit or derived meaning.

Avoid collapsing distinct concepts into generic blobs or documents.

If a relationship matters in an audit explanation, it must exist in the graph.

6. Explainability constraint

Any audit conclusion must be explainable without referencing embeddings, similarity scores, or AI behavior.

The system must be defensible to a human auditor or regulator.

7. Scope discipline

Focus on ingestion, normalization, and storage.

Do not introduce UI concerns, advanced search, or speculative features unless explicitly requested.

8. Implementation style

Prefer a functional programming style: immutable data, pure functions where possible, explicit data flow.

Avoid comments in code unless using JSDoc-style documentation for workflows that require additional context.

Code clarity should come from structure and naming, not inline commentary.

When making design or implementation decisions, prioritize:
correctness → traceability → explainability → extensibility, in that order.

If a proposed solution violates any rule above, it must be rejected or revised.
