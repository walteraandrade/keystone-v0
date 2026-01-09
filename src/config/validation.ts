import { z } from 'zod';

export const configSchema = z.object({
  server: z.object({
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
    port: z.number().int().positive().default(3000),
    logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  }),
  neo4j: z.object({
    uri: z.string().min(1),
    user: z.string().min(1),
    password: z.string().min(1),
  }),
  qdrant: z.object({
    url: z.string().url(),
    collection: z.string().min(1),
  }),
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'openrouter']),
    apiKey: z.string().min(1),
    model: z.string().min(1),
    maxTokens: z.number().int().positive().default(4000),
  }),
  embedding: z.object({
    endpoint: z.string().url(),
    apiKey: z.string().min(1),
    apiVersion: z.string().min(1),
    deployment: z.string().min(1),
    dimension: z.number().int().positive(),
  }),
  storage: z.object({
    documentPath: z.string().min(1),
    maxUploadSizeMB: z.number().positive().default(100),
  }),
  extraction: z.object({
    minConfidenceThreshold: z.number().min(0).max(1).default(0.7),
    enableDeduplication: z.boolean().default(true),
  }),
  chunking: z.object({
    maxTokens: z.number().int().positive().default(8192),
    overlapTokens: z.number().int().positive().default(100),
  }),
});

export type Config = z.infer<typeof configSchema>;
