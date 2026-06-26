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
      timeout: this.config.timeout
    });
  }

  static get capabilities() {
    return {
      streaming: true,
      toolCalls: true,
      structuredOutput: true
    };
  }

  async chat(messages, options = {}) {
    const startTime = Date.now();
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.config.model,
        messages,
        tools: options.tools || undefined,
        response_format: options.responseFormat || undefined,
        temperature: options.temperature ?? 0.7
      });

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
      if (err.status === 429) {
        throw new RateLimitError("Gemini", err.message);
      }
      throw err;
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
