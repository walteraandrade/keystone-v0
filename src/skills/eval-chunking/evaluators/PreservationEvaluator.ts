import type OpenAI from 'openai';
import { OpenAIClientFactory } from '../../../services/llm/OpenAIClientFactory.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import type { PreservationResult } from '../types.js';

const EXTRACT_FACTS_PROMPT = `You are an expert at extracting key facts from documents.

Extract the most important factual statements from the document. Focus on:
- Specific data points (numbers, dates, names)
- Definitions and explanations
- Relationships between entities
- Conclusions and findings
- Requirements and specifications

Output JSON:
{
  "facts": [
    "The system requires authentication via OAuth 2.0",
    "Risk severity is rated on a scale of 1-10",
    ...
  ]
}

Extract 15-30 key facts that capture the essential information.`;

const CHECK_FACTS_PROMPT = `You are checking whether facts from a document are preserved in a set of chunks.

For each fact, determine if it can be found (wholly or partially) in any of the provided chunks.

Output JSON:
{
  "results": [
    { "factIndex": 0, "found": true },
    { "factIndex": 1, "found": false },
    ...
  ]
}`;

export class PreservationEvaluator {
  private client: OpenAI;

  constructor() {
    this.client = OpenAIClientFactory.getClient();
  }

  async evaluate(originalContent: string, chunks: string[]): Promise<PreservationResult> {
    logger.info({ chunkCount: chunks.length }, 'Evaluating information preservation');

    const facts = await this.extractFacts(originalContent);

    if (facts.length === 0) {
      return {
        totalFacts: 0,
        factsFound: 0,
        missingFacts: [],
        preservationScore: 1.0,
      };
    }

    const foundStatus = await this.checkFactsInChunks(facts, chunks);

    const missingFacts = facts.filter((_, i) => !foundStatus[i]);
    const factsFound = facts.length - missingFacts.length;

    return {
      totalFacts: facts.length,
      factsFound,
      missingFacts,
      preservationScore: factsFound / facts.length,
    };
  }

  private async extractFacts(content: string): Promise<string[]> {
    try {
      const truncatedContent = content.length > 15000
        ? content.substring(0, 15000) + '\n...[truncated]'
        : content;

      const completion = await this.client.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: 'system', content: EXTRACT_FACTS_PROMPT },
          { role: 'user', content: `Extract key facts from this document:\n\n${truncatedContent}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from LLM');
      }

      const parsed = JSON.parse(responseContent) as { facts: string[] };
      logger.debug({ factCount: parsed.facts.length }, 'Facts extracted');
      return parsed.facts;
    } catch (error) {
      logger.error({ error }, 'Failed to extract facts');
      return [];
    }
  }

  private async checkFactsInChunks(facts: string[], chunks: string[]): Promise<boolean[]> {
    try {
      const chunksText = chunks.map((c, i) => `[Chunk ${i}]\n${c.substring(0, 1000)}`).join('\n\n');
      const factsText = facts.map((f, i) => `${i}. ${f}`).join('\n');

      const completion = await this.client.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: 'system', content: CHECK_FACTS_PROMPT },
          {
            role: 'user',
            content: `Facts to check:\n${factsText}\n\nChunks:\n${chunksText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Empty response from LLM');
      }

      const parsed = JSON.parse(responseContent) as {
        results: Array<{ factIndex: number; found: boolean }>;
      };

      const foundStatus = new Array(facts.length).fill(false);
      for (const result of parsed.results) {
        if (result.factIndex >= 0 && result.factIndex < facts.length) {
          foundStatus[result.factIndex] = result.found;
        }
      }

      return foundStatus;
    } catch (error) {
      logger.error({ error }, 'Failed to check facts in chunks');
      return new Array(facts.length).fill(true);
    }
  }
}
