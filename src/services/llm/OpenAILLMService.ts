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
import {
  FPS_EXTRACTION_SYSTEM_PROMPT,
  FPS_EXTRACTION_USER_PROMPT,
} from "./prompts/fps-extraction.js";
import {
  HIRA_EXTRACTION_SYSTEM_PROMPT,
  HIRA_EXTRACTION_USER_PROMPT,
} from "./prompts/hira-extraction.js";
import {
  ALERT_EXTRACTION_SYSTEM_PROMPT,
  ALERT_EXTRACTION_USER_PROMPT,
} from "./prompts/alert-extraction.js";
import { OpenAIClientFactory } from "./OpenAIClientFactory.js";

export class OpenAILLMService implements LLMService {
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

      logger.debug(
        {
          documentType: request.documentType,
          contentLength: request.content.length,
        },
        "Sending extraction request to OpenAI",
      );

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

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new LLMExtractionError("Empty response from OpenAI");
      }

      const parsed = JSON.parse(content);

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
      logger.error({ error, request }, "OpenAI extraction failed");
      if (error instanceof LLMExtractionError) {
        throw error;
      }
      throw new LLMExtractionError("OpenAI API error", error);
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
      case "fps":
        return {
          systemPrompt: FPS_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: FPS_EXTRACTION_USER_PROMPT(
            request.content,
            request.metadata,
          ),
        };
      case "hira":
        return {
          systemPrompt: HIRA_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: HIRA_EXTRACTION_USER_PROMPT(
            request.content,
            request.metadata,
          ),
        };
      case "alert":
        return {
          systemPrompt: ALERT_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: ALERT_EXTRACTION_USER_PROMPT(
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
