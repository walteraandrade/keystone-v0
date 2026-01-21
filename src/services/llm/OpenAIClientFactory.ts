import OpenAI from 'openai';
import { config } from '../../config/index.js';

export class OpenAIClientFactory {
  private static instance: OpenAI | null = null;

  static getClient(): OpenAI {
    if (this.instance) {
      return this.instance;
    }

    const clientConfig: { apiKey: string; baseURL?: string; timeout?: number; maxRetries?: number } = {
      apiKey: config.llm.apiKey,
      timeout: 60_000,
      maxRetries: 2,
    };

    if (config.llm.provider === 'openrouter') {
      clientConfig.baseURL = 'https://openrouter.ai/api/v1';
    }

    this.instance = new OpenAI(clientConfig);
    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }
}
