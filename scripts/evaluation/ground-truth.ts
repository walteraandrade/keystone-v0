import type { GroundTruth } from './types.js';

export const GROUND_TRUTH: GroundTruth[] = [
  // Q1: Local - Fall controls
  {
    questionId: 1,
    category: 'local_similarity',
    expectedEntityQuery: {
      nodeLabel: 'Control',
      properties: { description: { $contains: 'queda' } },
    },
    requiredKeywords: ['arnês', 'ancoragem', 'plataforma', 'altura', 'epi'],
  },

  // Q2: Local - Ladder safety
  {
    questionId: 2,
    category: 'local_similarity',
    expectedEntityQuery: {
      nodeLabel: 'Document',
      properties: { name: { $contains: 'altura' } },
    },
    requiredKeywords: ['escada', 'portátil', 'sapatas', 'degrau', 'apoio'],
  },

  // Q3: Local - Emergency rescue
  {
    questionId: 3,
    category: 'local_similarity',
    expectedEntityQuery: {
      nodeLabel: 'Requirement',
      properties: { description: { $contains: 'emergência' } },
    },
    requiredKeywords: ['emergência', 'resgate', 'socorro', 'primeiros', 'vítima'],
  },

  // Q4: Local - Incident investigation
  {
    questionId: 4,
    category: 'local_similarity',
    expectedEntityQuery: {
      nodeLabel: 'Requirement',
      relationshipFilter: { type: 'SOURCED_FROM', direction: 'out', targetLabel: 'Document' },
    },
    requiredKeywords: ['investigação', 'causa', 'raiz', 'corretiva', 'incidente'],
  },

  // Q5: Local - FMEA failure modes
  {
    questionId: 5,
    category: 'local_similarity',
    expectedEntityQuery: {
      nodeLabel: 'FailureMode',
    },
    requiredKeywords: ['fm-', 'fmea', 'modo', 'falha', 'rpn', 'severidade'],
  },

  // Q6: Global - Risk themes
  {
    questionId: 6,
    category: 'global_understanding',
    expectedEntityQuery: {
      nodeLabel: 'Risk',
    },
    requiredKeywords: ['queda', 'elétrico', 'prensamento', 'esmagamento', 'risco'],
  },

  // Q7: Global - Processes with controls
  {
    questionId: 7,
    category: 'global_understanding',
    expectedEntityQuery: {
      nodeLabel: 'Process',
      relationshipFilter: { type: 'CONTAINS', direction: 'out', targetLabel: 'Control' },
    },
    requiredKeywords: ['processo', 'controle', 'trabalho', 'altura', 'operação'],
  },

  // Q8: Global - Compliance posture
  {
    questionId: 8,
    category: 'global_understanding',
    expectedEntityQuery: {
      nodeLabel: 'Requirement',
      relationshipFilter: { type: 'SATISFIES', direction: 'in' },
    },
    requiredKeywords: ['conformidade', 'norma', 'requisito', 'padrão', 'nr-'],
  },

  // Q9: Global - Cross-document entities
  {
    questionId: 9,
    category: 'global_understanding',
    expectedEntityQuery: {
      nodeLabel: 'Control',
    },
    requiredKeywords: ['documento', 'comum', 'controle', 'procedimento'],
  },

  // Q10: Global - Control gaps
  {
    questionId: 10,
    category: 'global_understanding',
    expectedEntityQuery: {
      nodeLabel: 'FailureMode',
    },
    requiredKeywords: ['lacuna', 'ausência', 'controle', 'mitigação', 'falha'],
  },

  // Q11: Multi-hop - Controls linked to high-severity FMs
  {
    questionId: 11,
    category: 'multi_hop',
    expectedEntityQuery: {
      nodeLabel: 'FailureMode',
      properties: { severity: { $gte: 7 } },
      relationshipFilter: { type: 'MITIGATES', direction: 'in', targetLabel: 'Control' },
    },
    expectedPath: [{ from: 'FailureMode', relationship: 'MITIGATES', to: 'Control' }],
    requiredKeywords: ['severidade', 'alto', 'controle', 'crítico', 'mitigação'],
  },

  // Q12: Multi-hop - Fall risk provenance
  {
    questionId: 12,
    category: 'multi_hop',
    expectedEntityQuery: {
      nodeLabel: 'Risk',
      properties: { description: { $contains: 'queda' } },
    },
    expectedPath: [
      { from: 'Risk', relationship: 'EXTRACTED_FROM', to: 'Extraction' },
      { from: 'Extraction', relationship: 'SOURCED_FROM', to: 'Document' },
    ],
    requiredKeywords: ['queda', 'fps altura', 'hira', 'documento', 'origem'],
  },

  // Q13: Multi-hop - Crane findings
  {
    questionId: 13,
    category: 'multi_hop',
    expectedEntityQuery: {
      nodeLabel: 'Finding',
      relationshipFilter: { type: 'REFERENCES', direction: 'out', targetLabel: 'Control' },
    },
    expectedPath: [
      { from: 'Finding', relationship: 'REFERENCES', to: 'Control' },
      { from: 'Control', relationship: 'MITIGATES', to: 'Risk' },
    ],
    requiredKeywords: ['ponte rolante', 'içamento', 'carga', 'operador', 'controle'],
  },

  // Q14: Multi-hop - Audits and process changes
  {
    questionId: 14,
    category: 'multi_hop',
    expectedEntityQuery: {
      nodeLabel: 'Audit',
      relationshipFilter: { type: 'USES', direction: 'out', targetLabel: 'Document' },
    },
    expectedPath: [
      { from: 'Audit', relationship: 'USES', to: 'Document' },
      { from: 'Document', relationship: 'IDENTIFIES', to: 'FailureMode' },
    ],
    requiredKeywords: ['auditoria', 'processo', 'mudança', 'risco', 'documento'],
  },

  // Q15: Multi-hop - Common root causes
  {
    questionId: 15,
    category: 'multi_hop',
    expectedEntityQuery: {
      nodeLabel: 'FailureMode',
    },
    requiredKeywords: ['causa', 'raiz', 'humano', 'equipamento', 'procedimento', 'comum'],
  },

  // Q16: Aggregation - Risk by severity
  {
    questionId: 16,
    category: 'aggregation',
    expectedEntityQuery: {
      nodeLabel: 'Risk',
    },
    requiredKeywords: ['alto', 'médio', 'baixo', 'severidade', 'distribuição'],
  },

  // Q17: Aggregation - FMs with RPN > 100
  {
    questionId: 17,
    category: 'aggregation',
    expectedEntityQuery: {
      nodeLabel: 'FailureMode',
      properties: { rpn: { $gt: 100 } },
    },
    requiredKeywords: ['rpn', '100', 'modo', 'falha', 'crítico'],
  },

  // Q18: Aggregation - Document with most entities
  {
    questionId: 18,
    category: 'aggregation',
    expectedEntityQuery: {
      nodeLabel: 'Document',
      relationshipFilter: { type: 'IDENTIFIES', direction: 'out' },
    },
    requiredKeywords: ['documento', 'entidade', 'maior', 'fmea', 'identificado'],
  },

  // Q19: Aggregation - Control type distribution
  {
    questionId: 19,
    category: 'aggregation',
    expectedEntityQuery: {
      nodeLabel: 'Control',
    },
    expectedDistribution: {
      PREVENTIVE: 0,
      DETECTIVE: 0,
      CORRECTIVE: 0,
    },
    requiredKeywords: ['preventivo', 'detectivo', 'corretivo', 'tipo', 'controle'],
  },

  // Q20: Aggregation - High confidence extractions
  {
    questionId: 20,
    category: 'aggregation',
    expectedEntityQuery: {
      nodeLabel: 'Extraction',
      properties: { confidence: { $gt: 0.9 } },
    },
    requiredKeywords: ['confiança', 'extração', '0.9', 'alta', 'qualidade'],
  },
];

export const QUESTIONS = [
  { id: 1, category: 'local_similarity', q: 'What controls mitigate fall risks during work at height?' },
  { id: 2, category: 'local_similarity', q: 'What does the FPS Altura document say about ladder safety?' },
  { id: 3, category: 'local_similarity', q: 'Find sections similar to emergency rescue procedures' },
  { id: 4, category: 'local_similarity', q: 'What are the requirements for incident investigation?' },
  { id: 5, category: 'local_similarity', q: 'What failure modes are identified in the FMEA document?' },
  { id: 6, category: 'global_understanding', q: 'What are the main risk themes across all documents?' },
  { id: 7, category: 'global_understanding', q: 'Which processes have documented controls?' },
  { id: 8, category: 'global_understanding', q: 'What is the overall safety compliance posture?' },
  { id: 9, category: 'global_understanding', q: 'Which entities appear in multiple documents?' },
  { id: 10, category: 'global_understanding', q: 'What are the common control gaps across documents?' },
  { id: 11, category: 'multi_hop', q: 'Which controls are linked to high-severity failure modes?' },
  { id: 12, category: 'multi_hop', q: 'Trace the provenance of fall risks across documents' },
  { id: 13, category: 'multi_hop', q: 'What findings reference controls that mitigate crane operation risks?' },
  { id: 14, category: 'multi_hop', q: 'Which audits identified risks that require process changes?' },
  { id: 15, category: 'multi_hop', q: 'What failure modes share common root causes?' },
  { id: 16, category: 'aggregation', q: 'Count risks by severity level across all documents' },
  { id: 17, category: 'aggregation', q: 'How many failure modes have RPN above 100?' },
  { id: 18, category: 'aggregation', q: 'Which document has the most identified entities?' },
  { id: 19, category: 'aggregation', q: 'What is the distribution of control types?' },
  { id: 20, category: 'aggregation', q: 'How many entities have extraction confidence above 0.9?' },
] as const;
