export class MissingCredentialsError extends Error {
  constructor(providerName, envVar) {
    super(`MissingCredentialsError: API key for provider "${providerName}" is not configured. Please set the "${envVar}" environment variable.`);
    this.name = "MissingCredentialsError";
    this.providerName = providerName;
    this.envVar = envVar;
  }
}

export class RateLimitError extends Error {
  constructor(providerName, message) {
    super(`RateLimitError: Rate limit or 429 encountered from "${providerName}". Detail: ${message}`);
    this.name = "RateLimitError";
    this.providerName = providerName;
  }
}

export class ProviderAdapter {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || "",
      baseUrl: config.baseUrl || "",
      model: config.model || "",
      timeout: config.timeout || parseInt(process.env.PROVIDER_TIMEOUT || "60000", 10),
      maxRetries: config.maxRetries || 3,
      ...config
    };
  }

  // Capability registry flags
  static get capabilities() {
    return {
      streaming: false,
      toolCalls: false,
      structuredOutput: false
    };
  }

  // Abstract invocation methods
  async chat(messages, options = {}) {
    throw new Error("Method 'chat' not implemented.");
  }

  async streamChat(messages, options = {}) {
    throw new Error("Method 'streamChat' not implemented.");
  }
}
