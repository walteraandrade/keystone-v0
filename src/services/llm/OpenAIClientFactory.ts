import OpenAI from 'openai';
import { config } from '../../config/index.js';

export class OpenAIClientFactory {
  private static instance: OpenAI | null = null;

  static getClient(): OpenAI {
    if (this.instance) {
      return this.instance;
    }

    const clientConfig: { apiKey: string; baseURL?: string } = {
      apiKey: config.llm.apiKey,
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
