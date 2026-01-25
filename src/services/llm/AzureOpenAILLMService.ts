import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { LLMExtractionError } from '../../utils/errors.js';
import type { LLMService } from './LLMService.interface.js';
import type { ExtractionRequest, ExtractionResponse } from '../../types/extraction.types.js';
import { BASE_EXTRACTION_SYSTEM_PROMPT, BASE_EXTRACTION_USER_PROMPT } from './prompts/base-extraction.js';
import { FMEA_EXTRACTION_SYSTEM_PROMPT, FMEA_EXTRACTION_USER_PROMPT } from './prompts/fmea-extraction.js';
import { IPAR_EXTRACTION_SYSTEM_PROMPT, IPAR_EXTRACTION_USER_PROMPT } from './prompts/ipar-extraction.js';
import { FPS_EXTRACTION_SYSTEM_PROMPT, FPS_EXTRACTION_USER_PROMPT } from './prompts/fps-extraction.js';
import { HIRA_EXTRACTION_SYSTEM_PROMPT, HIRA_EXTRACTION_USER_PROMPT } from './prompts/hira-extraction.js';
import { ALERT_EXTRACTION_SYSTEM_PROMPT, ALERT_EXTRACTION_USER_PROMPT } from './prompts/alert-extraction.js';

export class AzureOpenAILLMService implements LLMService {
  private client: OpenAI;
  private deployment: string;

  constructor() {
    if (!config.llm.azureEndpoint || !config.llm.azureDeployment || !config.llm.azureApiVersion) {
      throw new Error('Azure OpenAI LLM requires AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_LLM_DEPLOYMENT, and AZURE_OPENAI_API_VERSION');
    }

    this.deployment = config.llm.azureDeployment;
    this.client = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: `${config.llm.azureEndpoint}/openai/deployments/${this.deployment}`,
      defaultQuery: { 'api-version': config.llm.azureApiVersion },
      defaultHeaders: { 'api-key': config.llm.apiKey },
    });
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

      logger.info({
        documentType: request.documentType,
        contentLength: request.content.length,
        contentPreview: request.content.slice(0, 200),
        model: this.deployment,
      }, 'Sending extraction request to Azure OpenAI');

      const startTime = Date.now();
      const completion = await this.client.chat.completions.create({
        model: this.deployment,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: config.llm.maxTokens,
        response_format: { type: 'json_object' },
      });

      const duration = Date.now() - startTime;
      logger.info({ duration: `${duration}ms`, tokensUsed: completion.usage?.total_tokens }, 'Received response from Azure OpenAI');

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new LLMExtractionError('Empty response from Azure OpenAI');
      }

      logger.info({ contentPreview: content.slice(0, 500) }, 'Raw LLM response preview');

      const parsed = JSON.parse(content);

      logger.info({
        hasEntities: !!parsed.entities,
        entityCount: parsed.entities?.length || 0,
        hasRelationships: !!parsed.relationships,
        relationshipCount: parsed.relationships?.length || 0,
        topLevelKeys: Object.keys(parsed),
      }, 'Parsed LLM response structure');

      return {
        entities: parsed.entities || [],
        relationships: parsed.relationships || [],
        metadata: {
          modelUsed: this.deployment,
          timestamp: new Date().toISOString(),
          tokensUsed: completion.usage?.total_tokens,
        },
      };
    } catch (error) {
      logger.error({ error, request: { documentType: request.documentType } }, 'Azure OpenAI extraction failed');
      if (error instanceof LLMExtractionError) {
        throw error;
      }
      throw new LLMExtractionError('Azure OpenAI API error', error);
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
      case 'fps':
        return {
          systemPrompt: FPS_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: FPS_EXTRACTION_USER_PROMPT(request.content, request.metadata),
        };
      case 'hira':
        return {
          systemPrompt: HIRA_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: HIRA_EXTRACTION_USER_PROMPT(request.content, request.metadata),
        };
      case 'alert':
        return {
          systemPrompt: ALERT_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: ALERT_EXTRACTION_USER_PROMPT(request.content, request.metadata),
        };
      default:
        return {
          systemPrompt: BASE_EXTRACTION_SYSTEM_PROMPT,
          userPrompt: BASE_EXTRACTION_USER_PROMPT(request.content, request.metadata),
        };
    }
  }
}
