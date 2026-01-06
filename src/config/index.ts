import 'dotenv/config';
import { configSchema, type Config } from './validation.js';

function loadConfig(): Config {
  const rawConfig = {
    server: {
      nodeEnv: process.env.NODE_ENV as 'development' | 'production' | 'test' | undefined,
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      logLevel: process.env.LOG_LEVEL as Config['server']['logLevel'] | undefined,
    },
    neo4j: {
      uri: process.env.NEO4J_URI || '',
      user: process.env.NEO4J_USER || '',
      password: process.env.NEO4J_PASSWORD || '',
    },
    qdrant: {
      url: process.env.QDRANT_URL || '',
      collection: process.env.QDRANT_COLLECTION || '',
    },
    llm: {
      provider: process.env.LLM_PROVIDER as 'openai' | 'anthropic' | undefined,
      apiKey: (process.env.LLM_PROVIDER === 'openai'
        ? process.env.OPENAI_API_KEY
        : process.env.ANTHROPIC_API_KEY) || '',
      model: process.env.LLM_MODEL || '',
      maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : undefined,
    },
    embedding: {
      model: process.env.EMBEDDING_MODEL || '',
      dimension: process.env.EMBEDDING_DIMENSION ? parseInt(process.env.EMBEDDING_DIMENSION, 10) : 1536,
    },
    storage: {
      documentPath: process.env.DOCUMENT_STORAGE_PATH || '',
      maxUploadSizeMB: process.env.MAX_UPLOAD_SIZE_MB ? parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) : undefined,
    },
    extraction: {
      minConfidenceThreshold: process.env.MIN_CONFIDENCE_THRESHOLD
        ? parseFloat(process.env.MIN_CONFIDENCE_THRESHOLD)
        : undefined,
      enableDeduplication: process.env.ENABLE_DEDUPLICATION !== 'false',
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error('Invalid configuration. Check your environment variables.');
  }
}

export const config = loadConfig();
