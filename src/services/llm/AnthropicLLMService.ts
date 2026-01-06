import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { LLMExtractionError } from '../../utils/errors.js';
import type { LLMService } from './LLMService.interface.js';
import type { ExtractionRequest, ExtractionResponse } from '../../types/extraction.types.js';
import {
  BASE_EXTRACTION_SYSTEM_PROMPT,
  BASE_EXTRACTION_USER_PROMPT,
} from './prompts/base-extraction.js';
import {
  FMEA_EXTRACTION_SYSTEM_PROMPT,
  FMEA_EXTRACTION_USER_PROMPT,
} from './prompts/fmea-extraction.js';
import {
  IPAR_EXTRACTION_SYSTEM_PROMPT,
  IPAR_EXTRACTION_USER_PROMPT,
} from './prompts/ipar-extraction.js';

export class AnthropicLLMService implements LLMService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.llm.apiKey,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: config.llm.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResponse> {
    try {
      const { systemPrompt, userPrompt } = this.getPrompts(request);

      logger.debug(
        { documentType: request.documentType, contentLength: request.content.length },
        'Sending extraction request to Anthropic'
      );

      const message = await this.client.messages.create({
        model: config.llm.model,
        max_tokens: config.llm.maxTokens,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new LLMExtractionError('Unexpected response type from Anthropic');
      }

      const parsed = JSON.parse(content.text);

      return {
        entities: parsed.entities || [],
        relationships: parsed.relationships || [],
        metadata: {
          modelUsed: message.model,
          timestamp: new Date().toISOString(),
          tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
        },
      };
    } catch (error) {
      logger.error({ error, request }, 'Anthropic extraction failed');
      if (error instanceof LLMExtractionError) {
        throw error;
      }
      throw new LLMExtractionError('Anthropic API error', error);
    }
  }

  private getPrompts(request: ExtractionRequest): { systemPrompt: string; userPrompt: string } {
    switch (request.documentType) {
      case 'fmea':
        return {
          systemPrompt: FMEA_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: FMEA_EXTRACTION_USER_PROMPT(request.content, request.metadata),
        };
      case 'ipar':
        return {
          systemPrompt: IPAR_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: IPAR_EXTRACTION_USER_PROMPT(request.content, request.metadata),
        };
      default:
        return {
          systemPrompt: BASE_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: BASE_EXTRACTION_USER_PROMPT(request.content, request.metadata),
        };
    }
  }
}
