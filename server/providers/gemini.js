import { OpenAI } from "openai";
import { ProviderAdapter, MissingCredentialsError, RateLimitError } from "./base.js";

export class GeminiAdapter extends ProviderAdapter {
  constructor(config = {}) {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new MissingCredentialsError("Gemini", "GEMINI_API_KEY");
    }
    super({ apiKey, model: "gemini-2.5-flash", ...config });
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai/",
      timeout: this.config.timeout,
      maxRetries: 0
    });
    this.lastRequestTime = 0;
  }

  static get capabilities() {
    return {
      streaming: true,
      toolCalls: true,
      structuredOutput: true
    };
  }

  async chat(messages, options = {}) {
    const maxRetries = 5;
    const retryableStatuses = [429, 500, 502, 503, 504];

    // Enforce rate-limit pacing (4000ms minimum between requests)
    const minInterval = 4000;
    const elapsedSinceLast = Date.now() - this.lastRequestTime;
    if (elapsedSinceLast < minInterval) {
      const waitMs = minInterval - elapsedSinceLast;
      await new Promise(r => setTimeout(r, waitMs));
    }
    this.lastRequestTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        const response = await this.client.chat.completions.create({
          model: options.model || this.config.model,
          messages,
          tools: options.tools || undefined,
          response_format: options.responseFormat || undefined,
          temperature: options.temperature ?? 0.7
        });

        this.lastRequestTime = Date.now();
        const latency = Date.now() - startTime;
        return {
          content: response.choices[0]?.message?.content || "",
          toolCalls: response.choices[0]?.message?.tool_calls || [],
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0
          },
          latency
        };
      } catch (err) {
        const isRetryable = retryableStatuses.includes(err.status) ||
          err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';

        if (isRetryable && attempt < maxRetries) {
          // Generous backoff for rate limit recovery
          const delayMs = Math.min(3000 * Math.pow(2, attempt - 1), 24000);
          console.warn(`Gemini API error (${err.status || err.code}), retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, delayMs));
          this.lastRequestTime = Date.now();
          continue;
        }

        if (err.status === 429) {
          throw new RateLimitError("Gemini", err.message);
        }
        throw err;
      }
    }
  }

  async *streamChat(messages, options = {}) {
    try {
      const stream = await this.client.chat.completions.create({
        model: options.model || this.config.model,
        messages,
        stream: true,
        temperature: options.temperature ?? 0.7
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) yield delta;
      }
    } catch (err) {
      if (err.status === 429) {
        throw new RateLimitError("Gemini", err.message);
      }
      throw err;
    }
  }
}
