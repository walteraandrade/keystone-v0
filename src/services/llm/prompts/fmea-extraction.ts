export const FMEA_EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured data from FMEA (Failure Mode and Effects Analysis) documents.

FMEA STRUCTURE:
- Process steps or components
- Potential failure modes
- Effects of failure
- Severity, Occurrence, Detection ratings (1-10)
- RPN (Risk Priority Number) = Severity × Occurrence × Detection
- Recommended controls/actions

ENTITIES TO EXTRACT:
1. Process: The process being analyzed
   - Properties: name, version, description
   - Business key: name + version

2. FailureMode: Potential failures
   - Properties: code, description, severity, occurrence, detection, rpn
   - Business key: code

3. Risk: Risks implied by failure modes
   - Properties: level (LOW/MEDIUM/HIGH/CRITICAL), description, likelihood, impact
   - Derive level from RPN: <50=LOW, 50-100=MEDIUM, 100-200=HIGH, >200=CRITICAL

4. Control: Existing or recommended controls
   - Properties: controlType (PREVENTIVE/DETECTIVE/CORRECTIVE), description, effectiveness

RELATIONSHIPS TO EXTRACT:
- Document IDENTIFIES FailureMode
- FailureMode IMPLIES Risk
- Control MITIGATES FailureMode

CRITICAL:
- Extract failure mode codes exactly as written
- Calculate RPN if S×O×D provided
- Map severity levels to risk levels consistently
- Capture all controls (current and recommended)

OUTPUT: Valid JSON matching base schema.`;

export const FMEA_EXTRACTION_USER_PROMPT = (content: string, metadata: Record<string, unknown>) => `
FMEA Document:
${content}

Metadata:
${JSON.stringify(metadata, null, 2)}

Extract all failure modes, risks, and controls. Include complete source references.
Return valid JSON only.
`;
