import type OpenAI from "openai";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { LLMExtractionError } from "../../utils/errors.js";
import { EmbeddingClientFactory } from "./EmbeddingClientFactory.js";

export class EmbeddingService {
  private client: OpenAI;

  constructor() {
    this.client = EmbeddingClientFactory.getClient();
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const validTexts = texts.filter(t => t && t.trim().length > 0);

      if (validTexts.length === 0) {
        logger.warn("No valid texts to embed, returning empty array");
        return [];
      }

      if (validTexts.length !== texts.length) {
        logger.warn(
          { original: texts.length, filtered: validTexts.length },
          "Filtered out empty texts before embedding"
        );
      }

      const maxBatchSize = 2048;
      if (validTexts.length > maxBatchSize) {
        logger.warn(
          { count: validTexts.length, maxBatchSize },
          "Batch too large, processing in chunks"
        );
        return this.batchEmbeddings(validTexts, maxBatchSize);
      }

      logger.debug({ count: validTexts.length }, "Generating embeddings");

      const response = await this.client.embeddings.create({
        model: config.embedding.deployment,
        input: validTexts,
      });

      const embeddings = response.data.map((item) => item.embedding);

      logger.debug(
        { count: embeddings.length, dimension: embeddings[0]?.length },
        "Generated embeddings",
      );

      return embeddings;
    } catch (error) {
      logger.error(
        { error, count: texts.length },
        "Failed to generate embeddings",
      );
      throw new LLMExtractionError("Embedding generation failed", error);
    }
  }

  private async batchEmbeddings(texts: string[], batchSize: number): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));

      const response = await this.client.embeddings.create({
        model: config.embedding.deployment,
        input: batch,
      });

      const embeddings = response.data.map((item) => item.embedding);
      allEmbeddings.push(...embeddings);

      logger.debug(
        { batch: Math.floor(i / batchSize) + 1, processed: allEmbeddings.length, total: texts.length },
        "Batch embeddings progress"
      );
    }

    return allEmbeddings;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }
}
