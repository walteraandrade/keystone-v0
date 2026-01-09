# Factory Pattern: LLM Service Abstraction

## Pattern Overview

**Factory Pattern** creates objects without exposing instantiation logic to the client. It provides a centralized place to create objects based on configuration.

## Implementation

```typescript
interface LLMService {
  generateStructuredOutput<T>(params: LLMParams): Promise<T>;
  testConnection(): Promise<boolean>;
}

class OpenAILLMService implements LLMService { ... }
class AnthropicLLMService implements LLMService { ... }
class OpenRouterLLMService implements LLMService { ... }

class LLMServiceFactory {
  static createLLMService(): LLMService {
    const provider = config.llm.provider;

    switch (provider) {
      case 'openai':
        return new OpenAILLMService();
      case 'anthropic':
        return new AnthropicLLMService();
      case 'openrouter':
        return new OpenRouterLLMService();
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  }
}
```

**Usage in application**:

```typescript
// src/index.ts
const llmService = LLMServiceFactory.createLLMService();
const orchestrator = new IngestionOrchestrator(graphRepo, docStorage, vectorStore, llmService);
```

## Why This Pattern?

- **Abstraction**: Consumers use `LLMService` interface, not concrete implementations
- **Flexibility**: Switch providers via environment variable (`LLM_PROVIDER=openai`)
- **Testability**: Mock `LLMService` interface for tests
- **Encapsulation**: Provider-specific API details hidden from consumers

## Adding New Providers

1. **Create service implementation**:

```typescript
// src/services/llm/NewProviderLLMService.ts
export class NewProviderLLMService implements LLMService {
  private client: NewProviderClient;

  constructor() {
    this.client = new NewProviderClient({
      apiKey: config.llm.apiKey,
      model: config.llm.model,
    });
  }

  async generateStructuredOutput<T>(params: LLMParams): Promise<T> {
    const response = await this.client.generateJSON({
      prompt: params.systemPrompt + '\n\n' + params.userPrompt,
      schema: params.responseSchema,
      temperature: params.temperature,
    });
    return response.data as T;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
```

2. **Register in factory**:

```typescript
// src/services/llm/LLMServiceFactory.ts
case 'newprovider':
  return new NewProviderLLMService();
```

3. **Add to config schema**:

```typescript
// src/config/validation.ts
llm: z.object({
  provider: z.enum(['openai', 'anthropic', 'openrouter', 'newprovider']),
  // ...
}),
```

4. **Update .env.example**:

```bash
LLM_PROVIDER=newprovider
NEWPROVIDER_API_KEY=sk-...
```

## Keeping It Healthy

### ✅ Do
- Keep `LLMService` interface **minimal** (only essential methods)
- Make all implementations **interchangeable** (same behavior contract)
- Handle provider-specific errors, return **generic errors** to consumers
- Log provider details at initialization for debugging
- Use **client factories** for providers needing multiple configurations (see OpenAI/Embedding example)

### ❌ Don't
- Expose provider-specific types in interface (e.g., `OpenAI.Chat.Completions`)
- Add methods only one provider supports (breaks substitutability)
- Hardcode provider logic in consumers (defeats abstraction)
- Leak API keys or credentials in logs

## Client Factories (Advanced)

For providers supporting multiple services (LLM + embeddings):

```typescript
// src/services/llm/OpenAIClientFactory.ts
export class OpenAIClientFactory {
  private static chatClient: OpenAI | null = null;

  static getChatClient(): OpenAI {
    if (!this.chatClient) {
      this.chatClient = new OpenAI({
        apiKey: config.openai.apiKey,
        baseURL: config.openai.baseURL,
      });
    }
    return this.chatClient;
  }
}

// src/services/vector/EmbeddingClientFactory.ts
export class EmbeddingClientFactory {
  private static embeddingClient: OpenAI | null = null;

  static getEmbeddingClient(): OpenAI {
    if (!this.embeddingClient) {
      this.embeddingClient = new OpenAI({
        apiKey: config.embedding.apiKey,
        baseURL: config.embedding.baseURL,
      });
    }
    return this.embeddingClient;
  }
}
```

**Why separate?** Different API keys, rate limits, and base URLs for chat vs embeddings.

## Testing

**Mock for unit tests**:

```typescript
class MockLLMService implements LLMService {
  async generateStructuredOutput<T>(): Promise<T> {
    return { entities: [], relationships: [] } as T;
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}

const orchestrator = new IngestionOrchestrator(
  graphRepo,
  docStorage,
  vectorStore,
  new MockLLMService()  // Inject mock
);
```

## Architecture Flow

```
config.llm.provider → LLMServiceFactory.createLLMService()
                   → Returns concrete implementation (OpenAI/Anthropic/OpenRouter)
                   → Injected into IngestionOrchestrator
                   → Used via LLMService interface
```

## References

- [Factory Pattern - Refactoring Guru](https://refactoring.guru/design-patterns/factory-method)
- Related: `src/config/validation.ts` (provider configuration)
- Related: `src/services/llm/LLMService.interface.ts` (service contract)
