import type OpenAI from 'openai';
import { OpenAIClientFactory } from '../../../services/llm/OpenAIClientFactory.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import type { GoldenQuestion, QuestionType } from '../types.js';

interface GeneratedQuestion {
  question: string;
  type: QuestionType;
  sourceLineStart: number;
  sourceLineEnd: number;
  expectedFacts: string[];
}

const SYSTEM_PROMPT = `You are an expert at generating retrieval evaluation questions for documents.
Your task is to create diverse questions that test different retrieval capabilities.

Question Types:
- factoid: Single fact retrieval (answer in 1-2 sentences from one location)
- contextual: Requires surrounding context to answer properly
- multi-span: Answer spans multiple sections of the document

Guidelines:
1. Questions should be answerable ONLY from the document content
2. Cover different sections/parts of the document evenly
3. Include a mix of all three question types
4. For each question, identify the exact line range that contains the answer
5. Extract 1-3 key facts that should be in the answer

Output JSON format:
{
  "questions": [
    {
      "question": "What is X?",
      "type": "factoid|contextual|multi-span",
      "sourceLineStart": 10,
      "sourceLineEnd": 15,
      "expectedFacts": ["fact1", "fact2"]
    }
  ]
}`;

const buildUserPrompt = (content: string, documentType: string, questionCount: number): string => {
  const typeHints = getTypeSpecificHints(documentType);

  return `Generate exactly ${questionCount} retrieval evaluation questions for this ${documentType.toUpperCase()} document.

${typeHints}

Document content (with line numbers):
\`\`\`
${addLineNumbers(content)}
\`\`\`

Remember:
- Mix of factoid (60%), contextual (30%), and multi-span (10%) questions
- Cover the entire document, not just the beginning
- Line numbers must match actual content locations
- Expected facts should be direct quotes or close paraphrases`;
};

const getTypeSpecificHints = (documentType: string): string => {
  switch (documentType) {
    case 'fmea':
      return `FMEA-specific questions to include:
- "What is the failure mode for [specific process/component]?"
- "What detection method is used for [specific failure]?"
- "What is the RPN for [specific row/failure]?"
- "List all failure modes with severity > 8"
- "What controls exist for [component]?"
- "What are the effects of [failure mode]?"`;
    case 'ipar':
      return `IPAR-specific questions to include:
- "What finding was identified in [section]?"
- "What is the corrective action for [NC code]?"
- "Which ISO requirements were cited?"
- "What was the audit scope?"
- "List all non-conformities"
- "What evidence was reviewed for [finding]?"`;
    default:
      return `Generic document questions:
- Section-specific factoid questions
- Cross-section relationship questions
- Specific detail retrieval
- Summary/overview questions`;
  }
};

const addLineNumbers = (content: string): string => {
  const lines = content.split('\n');
  return lines.map((line, i) => `${(i + 1).toString().padStart(4, ' ')}: ${line}`).join('\n');
};

export class GoldenQuestionGenerator {
  private client: OpenAI;

  constructor() {
    this.client = OpenAIClientFactory.getClient();
  }

  async generate(
    documentId: string,
    content: string,
    documentType: string,
    questionCount: number = 20
  ): Promise<Omit<GoldenQuestion, 'id' | 'createdAt'>[]> {
    logger.info({ documentId, documentType, questionCount }, 'Generating golden questions');

    try {
      const completion = await this.client.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(content, documentType, questionCount) },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from LLM');
      }

      const parsed = JSON.parse(responseContent) as { questions: GeneratedQuestion[] };
      const lineCount = content.split('\n').length;

      const questions = parsed.questions
        .filter(q => this.validateQuestion(q, lineCount))
        .map(q => ({
          documentId,
          question: q.question,
          type: q.type,
          sourceLineRange: [q.sourceLineStart, q.sourceLineEnd] as [number, number],
          expectedFacts: q.expectedFacts,
        }));

      logger.info(
        { documentId, generated: questions.length, requested: questionCount },
        'Golden questions generated'
      );

      return questions;
    } catch (error) {
      logger.error({ error, documentId }, 'Failed to generate golden questions');
      throw error;
    }
  }

  private validateQuestion(q: GeneratedQuestion, maxLine: number): boolean {
    if (!q.question || q.question.trim().length < 10) {
      logger.warn({ question: q.question }, 'Invalid question: too short');
      return false;
    }
    if (!['factoid', 'contextual', 'multi-span'].includes(q.type)) {
      logger.warn({ type: q.type }, 'Invalid question type');
      return false;
    }
    if (q.sourceLineStart < 1 || q.sourceLineEnd > maxLine || q.sourceLineStart > q.sourceLineEnd) {
      logger.warn(
        { start: q.sourceLineStart, end: q.sourceLineEnd, maxLine },
        'Invalid line range'
      );
      return false;
    }
    if (!Array.isArray(q.expectedFacts) || q.expectedFacts.length === 0) {
      logger.warn({ facts: q.expectedFacts }, 'Invalid expected facts');
      return false;
    }
    return true;
  }
}
