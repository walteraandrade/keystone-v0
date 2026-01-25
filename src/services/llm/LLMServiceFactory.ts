import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import type { LLMService } from './LLMService.interface.js';
import { OpenAILLMService } from './OpenAILLMService.js';
import { AnthropicLLMService } from './AnthropicLLMService.js';
import { OpenRouterLLMService } from './OpenRouterLLMService.js';
import { AzureOpenAILLMService } from './AzureOpenAILLMService.js';

export class LLMServiceFactory {
  private static instance: LLMService | null = null;

  static createLLMService(): LLMService {
    if (this.instance) {
      return this.instance;
    }

    switch (config.llm.provider) {
      case 'openai':
        logger.info('Initializing OpenAI LLM service');
        this.instance = new OpenAILLMService();
        break;
      case 'anthropic':
        logger.info('Initializing Anthropic LLM service');
        this.instance = new AnthropicLLMService();
        break;
      case 'openrouter':
        logger.info('Initializing OpenRouter LLM service');
        this.instance = new OpenRouterLLMService();
        break;
      case 'azure':
        logger.info('Initializing Azure OpenAI LLM service');
        this.instance = new AzureOpenAILLMService();
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${config.llm.provider}`);
    }

    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }
}
