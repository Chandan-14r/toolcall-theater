import Anthropic from "@anthropic-ai/sdk";
import { ProviderAdapter, MissingCredentialsError, RateLimitError } from "./base.js";

export class AnthropicAdapter extends ProviderAdapter {
  constructor(config = {}) {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MissingCredentialsError("Anthropic", "ANTHROPIC_API_KEY");
    }
    super({ apiKey, model: "claude-3-5-sonnet-latest", ...config });
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout
    });
  }

  static get capabilities() {
    return {
      streaming: true,
      toolCalls: true,
      structuredOutput: false
    };
  }

  async chat(messages, options = {}) {
    const startTime = Date.now();
    try {
      // Map OpenAI message role format 'user'/'assistant'/'system' to Anthropic format
      const systemMessage = messages.find(m => m.role === "system");
      const anthropicMessages = messages
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content
        }));

      const response = await this.client.messages.create({
        model: options.model || this.config.model,
        max_tokens: options.maxTokens || 1024,
        system: systemMessage?.content || undefined,
        messages: anthropicMessages,
        temperature: options.temperature ?? 0.7
      });

      const latency = Date.now() - startTime;
      return {
        content: response.content[0]?.text || "",
        toolCalls: [], // Implement tool calls mapping if needed
        usage: {
          promptTokens: response.usage?.input_tokens || 0,
          completionTokens: response.usage?.output_tokens || 0,
          totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        },
        latency
      };
    } catch (err) {
      if (err.status === 429) {
        throw new RateLimitError("Anthropic", err.message);
      }
      throw err;
    }
  }

  async *streamChat(messages, options = {}) {
    try {
      const systemMessage = messages.find(m => m.role === "system");
      const anthropicMessages = messages
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content
        }));

      const stream = await this.client.messages.create({
        model: options.model || this.config.model,
        max_tokens: options.maxTokens || 1024,
        system: systemMessage?.content || undefined,
        messages: anthropicMessages,
        stream: true,
        temperature: options.temperature ?? 0.7
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.text) {
          yield event.delta.text;
        }
      }
    } catch (err) {
      if (err.status === 429) {
        throw new RateLimitError("Anthropic", err.message);
      }
      throw err;
    }
  }
}
