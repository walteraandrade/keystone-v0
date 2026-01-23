import type OpenAI from 'openai';
import { OpenAIClientFactory } from '../../../services/llm/OpenAIClientFactory.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import type { ChunkEvaluation, BoundaryQuality } from '../types.js';

interface ChunkInput {
  id: string;
  index: number;
  text: string;
  tokens: number;
  semanticType?: string;
}

interface LLMChunkEval {
  chunkIndex: number;
  conceptUnity: number;
  boundaryQuality: BoundaryQuality;
  standaloneScore: number;
}

const SYSTEM_PROMPT = `You are an expert at evaluating document chunk quality for RAG systems.

For each chunk, evaluate:
1. conceptUnity (1-5): Does the chunk discuss a coherent, single topic?
   - 5: Perfect unity, single clear topic
   - 3: Mixed but related topics
   - 1: Multiple unrelated topics jumbled together

2. boundaryQuality: How well does the chunk start and end?
   - "clean": Starts and ends at natural boundaries (paragraph, section, sentence)
   - "mid-sentence": Starts or ends mid-sentence
   - "mid-concept": Starts or ends mid-concept (e.g., splits a definition)

3. standaloneScore (1-5): Can you understand this chunk without surrounding context?
   - 5: Fully self-contained and understandable
   - 3: Needs some context but main point is clear
   - 1: Incomprehensible without context (dangling references, incomplete thoughts)

Output JSON:
{
  "evaluations": [
    {
      "chunkIndex": 0,
      "conceptUnity": 4,
      "boundaryQuality": "clean",
      "standaloneScore": 5
    }
  ]
}`;

const buildUserPrompt = (chunks: ChunkInput[]): string => {
  const chunkDescriptions = chunks.map((c, i) =>
    `--- Chunk ${i} (${c.tokens} tokens, type: ${c.semanticType || 'unknown'}) ---
${c.text.substring(0, 1500)}${c.text.length > 1500 ? '...[truncated]' : ''}`
  ).join('\n\n');

  return `Evaluate these ${chunks.length} document chunks:

${chunkDescriptions}

Provide evaluations for all ${chunks.length} chunks.`;
};

export class IntrinsicEvaluator {
  private client: OpenAI;

  constructor() {
    this.client = OpenAIClientFactory.getClient();
  }

  async evaluate(chunks: ChunkInput[]): Promise<ChunkEvaluation[]> {
    logger.info({ chunkCount: chunks.length }, 'Evaluating chunk intrinsic quality');

    const batchSize = 10;
    const results: ChunkEvaluation[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      const batchResults = await this.evaluateBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  private async evaluateBatch(chunks: ChunkInput[]): Promise<ChunkEvaluation[]> {
    try {
      const completion = await this.client.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(chunks) },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const parsed = JSON.parse(content) as { evaluations: LLMChunkEval[] };

      return chunks.map((chunk, idx) => {
        const llmEval = parsed.evaluations.find(e => e.chunkIndex === idx) || {
          conceptUnity: 3,
          boundaryQuality: 'clean' as BoundaryQuality,
          standaloneScore: 3,
        };

        return {
          chunkId: chunk.id,
          chunkIndex: chunk.index,
          conceptUnity: this.clamp(llmEval.conceptUnity, 1, 5),
          boundaryQuality: this.validateBoundary(llmEval.boundaryQuality),
          standaloneScore: this.clamp(llmEval.standaloneScore, 1, 5),
          semanticType: chunk.semanticType || 'unknown',
          tokens: chunk.tokens,
        };
      });
    } catch (error) {
      logger.error({ error, chunkCount: chunks.length }, 'Failed to evaluate chunk batch');

      return chunks.map(chunk => ({
        chunkId: chunk.id,
        chunkIndex: chunk.index,
        conceptUnity: 3,
        boundaryQuality: 'clean' as BoundaryQuality,
        standaloneScore: 3,
        semanticType: chunk.semanticType || 'unknown',
        tokens: chunk.tokens,
      }));
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private validateBoundary(value: string): BoundaryQuality {
    const valid: BoundaryQuality[] = ['clean', 'mid-sentence', 'mid-concept'];
    return valid.includes(value as BoundaryQuality) ? (value as BoundaryQuality) : 'clean';
  }
}
