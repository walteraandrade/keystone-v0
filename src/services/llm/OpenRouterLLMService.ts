import type OpenAI from "openai";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { LLMExtractionError } from "../../utils/errors.js";
import type { LLMService } from "./LLMService.interface.js";
import type {
  ExtractionRequest,
  ExtractionResponse,
} from "../../types/extraction.types.js";
import {
  BASE_EXTRACTION_SYSTEM_PROMPT,
  BASE_EXTRACTION_USER_PROMPT,
} from "./prompts/base-extraction.js";
import {
  FMEA_EXTRACTION_SYSTEM_PROMPT,
  FMEA_EXTRACTION_USER_PROMPT,
} from "./prompts/fmea-extraction.js";
import {
  IPAR_EXTRACTION_SYSTEM_PROMPT,
  IPAR_EXTRACTION_USER_PROMPT,
} from "./prompts/ipar-extraction.js";
import { OpenAIClientFactory } from "./OpenAIClientFactory.js";

export class OpenRouterLLMService implements LLMService {
  private client: OpenAI;

  constructor() {
    this.client = OpenAIClientFactory.getClient();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResponse> {
    try {
      const { systemPrompt, userPrompt } = this.getPrompts(request);

      logger.info(
        {
          documentType: request.documentType,
          contentLength: request.content.length,
          contentPreview: request.content.substring(0, 200),
          model: config.llm.model,
        },
        "Sending extraction request to OpenRouter",
      );

      const startTime = Date.now();
      const completion = await this.client.chat.completions.create({
        model: config.llm.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: config.llm.maxTokens,
        response_format: { type: "json_object" },
      });

      logger.info(
        {
          duration: `${Date.now() - startTime}ms`,
          tokensUsed: completion.usage?.total_tokens
        },
        "Received response from OpenRouter"
      );

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new LLMExtractionError("Empty response from OpenRouter");
      }

      logger.info({ contentPreview: content.substring(0, 500) }, "Raw LLM response preview");

      const parsed = JSON.parse(content);

      logger.info({
        hasEntities: !!parsed.entities,
        entityCount: parsed.entities?.length || 0,
        hasRelationships: !!parsed.relationships,
        relationshipCount: parsed.relationships?.length || 0,
        topLevelKeys: Object.keys(parsed)
      }, "Parsed LLM response structure");

      return {
        entities: parsed.entities || [],
        relationships: parsed.relationships || [],
        metadata: {
          modelUsed: completion.model,
          timestamp: new Date().toISOString(),
          tokensUsed: completion.usage?.total_tokens,
        },
      };
    } catch (error) {
      logger.error({ error, request }, "OpenRouter extraction failed");
      if (error instanceof LLMExtractionError) {
        throw error;
      }
      throw new LLMExtractionError("OpenRouter API error", error);
    }
  }

  private getPrompts(request: ExtractionRequest): {
    systemPrompt: string;
    userPrompt: string;
  } {
    switch (request.documentType) {
      case "fmea":
        return {
          systemPrompt: FMEA_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: FMEA_EXTRACTION_USER_PROMPT(
            request.content,
            request.metadata,
          ),
        };
      case "ipar":
        return {
          systemPrompt: IPAR_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: IPAR_EXTRACTION_USER_PROMPT(
            request.content,
            request.metadata,
          ),
        };
      default:
        return {
          systemPrompt: BASE_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: BASE_EXTRACTION_USER_PROMPT(
            request.content,
            request.metadata,
          ),
        };
    }
  }
}
