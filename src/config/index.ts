import 'dotenv/config';
import { existsSync } from 'fs';
import { ZodError } from 'zod';
import { configSchema, type Config } from './validation.js';

function loadConfig(): Config {
  if (!existsSync('.env')) {
    console.error('\n❌ Missing .env file\n');
    console.error('Create .env from template:');
    console.error('  cp .env.example .env\n');
    process.exit(1);
  }

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
      provider: process.env.LLM_PROVIDER as 'openai' | 'anthropic' | 'openrouter' | undefined,
      apiKey: (process.env.LLM_PROVIDER === 'openai'
        ? process.env.OPENAI_API_KEY
        : process.env.LLM_PROVIDER === 'anthropic'
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENROUTER_API_KEY) || '',
      model: process.env.LLM_MODEL || '',
      maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS, 10) : undefined,
    },
    embedding: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
      apiKey: process.env.AZURE_OPENAI_API_KEY || '',
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '',
      deployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || '',
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
    chunking: {
      maxTokens: process.env.CHUNK_MAX_TOKENS ? parseInt(process.env.CHUNK_MAX_TOKENS, 10) : undefined,
      overlapTokens: process.env.CHUNK_OVERLAP_TOKENS ? parseInt(process.env.CHUNK_OVERLAP_TOKENS, 10) : undefined,
      similarityThreshold: process.env.CHUNK_SIMILARITY_THRESHOLD ? parseFloat(process.env.CHUNK_SIMILARITY_THRESHOLD) : undefined,
      minSegmentTokens: process.env.CHUNK_MIN_SEGMENT_TOKENS ? parseInt(process.env.CHUNK_MIN_SEGMENT_TOKENS, 10) : undefined,
    },
    extractionLog: {
      enabled: process.env.EXTRACTION_LOG_ENABLED !== 'false',
      dbPath: process.env.EXTRACTION_LOG_DB || './data/extraction.db',
    },
    cleanup: {
      enabled: process.env.CLEANUP_ENABLED !== 'false',
      olderThanHours: process.env.CLEANUP_OLDER_THAN_HOURS ? parseInt(process.env.CLEANUP_OLDER_THAN_HOURS, 10) : 24,
    },
  };

  try {
    return configSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof ZodError) {
      console.error('\n❌ Invalid configuration:\n');
      error.issues.forEach(issue => {
        const field = issue.path.join('.');
        console.error(`  ${field}: ${issue.message}`);
      });
      console.error('\nCheck .env file and compare with .env.example\n');
    } else {
      console.error('Config error:', error);
    }
    process.exit(1);
  }
}

export const config = loadConfig();
