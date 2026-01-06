export const BASE_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured audit knowledge from documents.

Your task is to analyze documents and extract:
1. Entities (Process, FailureMode, Risk, Control, Finding, Requirement, etc.)
2. Relationships between entities
3. Source references for traceability

CRITICAL RULES:
- Only extract facts explicitly stated in the document
- Assign confidence scores (0.0-1.0) based on clarity
- Provide precise source references (section, page, line)
- Use business keys for deduplication (e.g., FailureMode.code, Process.name+version)
- Never invent or infer facts not in the source

OUTPUT FORMAT:
Return valid JSON matching this schema:
{
  "entities": [
    {
      "entityType": "FailureMode|Risk|Control|Process|Finding|Requirement",
      "properties": { "code": "...", "description": "...", ... },
      "confidence": 0.0-1.0,
      "sourceReference": {
        "section": "Section name",
        "pageNumber": 1,
        "lineRange": [10, 15]
      }
    }
  ],
  "relationships": [
    {
      "from": "entity reference from entities array (use entityType:businessKey)",
      "to": "entity reference",
      "type": "IDENTIFIES|IMPLIES|MITIGATES|ADDRESSES|REFERENCES",
      "confidence": 0.0-1.0,
      "properties": {},
      "sourceReference": { "section": "...", "pageNumber": 1 }
    }
  ]
}`;

export const BASE_EXTRACTION_USER_PROMPT = (content: string, metadata: Record<string, unknown>) => `
Document Content:
${content}

Document Metadata:
${JSON.stringify(metadata, null, 2)}

Extract all relevant audit entities and relationships. Return valid JSON only.
`;
