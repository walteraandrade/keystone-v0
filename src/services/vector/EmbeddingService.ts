import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { LLMExtractionError } from '../../utils/errors.js';

export class EmbeddingService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.llm.provider === 'openai' ? config.llm.apiKey : process.env.OPENAI_API_KEY,
    });
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      logger.debug({ count: texts.length }, 'Generating embeddings');

      const response = await this.client.embeddings.create({
        model: config.embedding.model,
        input: texts,
      });

      const embeddings = response.data.map(item => item.embedding);

      logger.debug(
        { count: embeddings.length, dimension: embeddings[0]?.length },
        'Generated embeddings'
      );

      return embeddings;
    } catch (error) {
      logger.error({ error, count: texts.length }, 'Failed to generate embeddings');
      throw new LLMExtractionError('Embedding generation failed', error);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }
}
