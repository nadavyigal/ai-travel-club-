import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  apiKey: string;
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  latencyMs: number;
}

export interface AIProviderInterface {
  generateCompletion(prompt: string, schema?: any): Promise<AIResponse>;
}

class OpenAIProvider implements AIProviderInterface {
  private client: OpenAI;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout || 120000, // 120 seconds for complex trip planning
    });
  }

  async generateCompletion(prompt: string, schema?: any): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert travel concierge AI. Generate detailed, accurate, and personalized trip itineraries in valid JSON format only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature || 0.4,
        max_tokens: this.config.maxTokens || 4000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content || '{}';
      const tokensUsed = response.usage?.total_tokens;

      return {
        content,
        model: this.config.model,
        tokensUsed,
        latencyMs: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('OpenAI provider error:', error);
      throw new Error(`OpenAI generation failed: ${error.message}`);
    }
  }
}

class AnthropicProvider implements AIProviderInterface {
  private client: Anthropic;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout || 30000,
    });
  }

  async generateCompletion(prompt: string, schema?: any): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 4000,
        temperature: this.config.temperature || 0.4,
        system: 'You are an expert travel concierge AI. Generate detailed, accurate, and personalized trip itineraries in valid JSON format only.',
        messages: [
          {
            role: 'user',
            content: prompt + '\n\nRespond with valid JSON only.'
          }
        ]
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
      const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

      return {
        content,
        model: this.config.model,
        tokensUsed,
        latencyMs: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('Anthropic provider error:', error);
      throw new Error(`Anthropic generation failed: ${error.message}`);
    }
  }
}

class GeminiProvider implements AIProviderInterface {
  private client: GoogleGenerativeAI;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new GoogleGenerativeAI(config.apiKey);
  }

  async generateCompletion(prompt: string, schema?: any): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const model = this.client.getGenerativeModel({
        model: this.config.model,
        generationConfig: {
          temperature: this.config.temperature || 0.4,
          maxOutputTokens: this.config.maxTokens || 4000,
        }
      });

      const systemPrompt = 'You are an expert travel concierge AI. Generate detailed, accurate, and personalized trip itineraries in valid JSON format only.';
      const fullPrompt = `${systemPrompt}\n\n${prompt}\n\nRespond with valid JSON only.`;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const content = response.text();

      return {
        content,
        model: this.config.model,
        tokensUsed: undefined, // Gemini doesn't always provide token counts
        latencyMs: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('Gemini provider error:', error);
      throw new Error(`Gemini generation failed: ${error.message}`);
    }
  }
}

export class AIProviders {
  private providers: AIProviderInterface[] = [];
  private currentProviderIndex = 0;

  constructor(configs: AIProviderConfig[]) {
    for (const config of configs) {
      switch (config.provider) {
        case 'openai':
          this.providers.push(new OpenAIProvider(config));
          break;
        case 'anthropic':
          this.providers.push(new AnthropicProvider(config));
          break;
        case 'gemini':
          this.providers.push(new GeminiProvider(config));
          break;
        default:
          console.warn(`Unknown AI provider: ${config.provider}`);
      }
    }

    if (this.providers.length === 0) {
      throw new Error('No valid AI providers configured');
    }
  }

  async generateWithFallback(prompt: string, schema?: any): Promise<AIResponse> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.providers.length; i++) {
      const providerIndex = (this.currentProviderIndex + i) % this.providers.length;

      if (providerIndex >= this.providers.length) {
        continue;
      }

      const provider = this.providers[providerIndex]!; // Non-null assertion - we checked bounds above

      try {
        const response = await provider.generateCompletion(prompt, schema);

        // Success - update current provider for next call
        this.currentProviderIndex = providerIndex;

        return response;
      } catch (error: any) {
        console.error(`Provider ${providerIndex} failed:`, error.message);
        lastError = error;

        // Try next provider
        continue;
      }
    }

    // All providers failed
    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }

  getProviderCount(): number {
    return this.providers.length;
  }
}

// Factory function to create AIProviders from environment
export function createAIProvidersFromEnv(): AIProviders {
  const configs: AIProviderConfig[] = [];

  // Primary provider
  const primaryProvider = process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'gemini' || 'openai';
  const primaryModel = process.env.AI_MODEL || 'gpt-4o';
  const timeout = parseInt(process.env.AI_TIMEOUT_MS || '30000');

  if (primaryProvider === 'openai' && process.env.OPENAI_API_KEY) {
    configs.push({
      provider: 'openai',
      model: primaryModel,
      apiKey: process.env.OPENAI_API_KEY,
      timeout,
      temperature: 0.4,
      maxTokens: 4000
    });
  }

  if (primaryProvider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    configs.push({
      provider: 'anthropic',
      model: primaryModel,
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout,
      temperature: 0.4,
      maxTokens: 4000
    });
  }

  if (primaryProvider === 'gemini' && process.env.GEMINI_API_KEY) {
    configs.push({
      provider: 'gemini',
      model: primaryModel,
      apiKey: process.env.GEMINI_API_KEY,
      timeout,
      temperature: 0.4,
      maxTokens: 4000
    });
  }

  // Add fallback providers
  if (process.env.ANTHROPIC_API_KEY && primaryProvider !== 'anthropic') {
    configs.push({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout,
      temperature: 0.4,
      maxTokens: 4000
    });
  }

  if (process.env.GEMINI_API_KEY && primaryProvider !== 'gemini') {
    configs.push({
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      apiKey: process.env.GEMINI_API_KEY,
      timeout,
      temperature: 0.4,
      maxTokens: 4000
    });
  }

  if (configs.length === 0) {
    throw new Error('No AI provider API keys configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY');
  }

  return new AIProviders(configs);
}