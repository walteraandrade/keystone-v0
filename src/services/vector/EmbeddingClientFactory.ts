import OpenAI from 'openai';

export class EmbeddingClientFactory {
  private static instance: OpenAI | null = null;

  static getClient(): OpenAI {
    if (this.instance) {
      return this.instance;
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
    const deployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;

    if (!endpoint || !apiKey || !apiVersion || !deployment) {
      throw new Error('Azure OpenAI configuration required: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION, AZURE_OPENAI_EMBEDDING_DEPLOYMENT');
    }

    this.instance = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey },
    });

    return this.instance;
  }

  static reset(): void {
    this.instance = null;
  }
}
