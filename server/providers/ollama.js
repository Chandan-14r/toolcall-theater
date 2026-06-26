import { ProviderAdapter } from "./base.js";

export class OllamaNotRunningError extends Error {
  constructor(baseUrl, message) {
    super(`OllamaNotRunningError: Local Ollama daemon is not responding at ${baseUrl}. Details: ${message}`);
    this.name = "OllamaNotRunningError";
    this.baseUrl = baseUrl;
  }
}

export class OllamaAdapter extends ProviderAdapter {
  constructor(config = {}) {
    const baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    super({ baseUrl, model: "llama3", ...config });
  }

  static get capabilities() {
    return {
      streaming: true,
      toolCalls: false,
      structuredOutput: false
    };
  }

  async _verifyConnection() {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      throw new OllamaNotRunningError(this.config.baseUrl, err.message);
    }
  }

  async chat(messages, options = {}) {
    await this._verifyConnection();
    const startTime = Date.now();
    
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model || this.config.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;
    return {
      content: data.message?.content || "",
      toolCalls: [],
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      },
      latency
    };
  }

  async *streamChat(messages, options = {}) {
    await this._verifyConnection();
    
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model || this.config.model,
        messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP Error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (line.trim()) {
            const data = JSON.parse(line);
            const delta = data.message?.content || "";
            if (delta) yield delta;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
