import test from "node:test";
import assert from "node:assert/strict";
import { OpenAIAdapter } from "../server/providers/openai.js";
import { AnthropicAdapter } from "../server/providers/anthropic.js";
import { OllamaAdapter, OllamaNotRunningError } from "../server/providers/ollama.js";
import { GeminiAdapter } from "../server/providers/gemini.js";
import { MissingCredentialsError } from "../server/providers/base.js";

test("OpenAIAdapter throws MissingCredentialsError when API key is missing", () => {
  // Ensure env key is deleted for testing
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    new OpenAIAdapter();
    assert.fail("Should have thrown MissingCredentialsError");
  } catch (err) {
    assert.ok(err instanceof MissingCredentialsError);
    assert.equal(err.providerName, "OpenAI");
    assert.equal(err.envVar, "OPENAI_API_KEY");
  } finally {
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  }
});

test("AnthropicAdapter throws MissingCredentialsError when API key is missing", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    new AnthropicAdapter();
    assert.fail("Should have thrown MissingCredentialsError");
  } catch (err) {
    assert.ok(err instanceof MissingCredentialsError);
    assert.equal(err.providerName, "Anthropic");
    assert.equal(err.envVar, "ANTHROPIC_API_KEY");
  } finally {
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

test("OllamaAdapter throws OllamaNotRunningError when local daemon is not running", async () => {
  const adapter = new OllamaAdapter({ baseUrl: "http://localhost:54321" }); // Unused port
  
  try {
    await adapter.chat([{ role: "user", content: "hello" }]);
    assert.fail("Should have thrown OllamaNotRunningError");
  } catch (err) {
    assert.ok(err instanceof OllamaNotRunningError);
    assert.equal(err.baseUrl, "http://localhost:54321");
  }
});

test("Capability registry flags are correctly configured", () => {
  assert.deepEqual(OpenAIAdapter.capabilities, {
    streaming: true,
    toolCalls: true,
    structuredOutput: true
  });

  assert.deepEqual(AnthropicAdapter.capabilities, {
    streaming: true,
    toolCalls: true,
    structuredOutput: false
  });

  assert.deepEqual(OllamaAdapter.capabilities, {
    streaming: true,
    toolCalls: false,
    structuredOutput: false
  });

  assert.deepEqual(GeminiAdapter.capabilities, {
    streaming: true,
    toolCalls: true,
    structuredOutput: true
  });
});

test("GeminiAdapter throws MissingCredentialsError when API key is missing", () => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    new GeminiAdapter();
    assert.fail("Should have thrown MissingCredentialsError");
  } catch (err) {
    assert.ok(err instanceof MissingCredentialsError);
    assert.equal(err.providerName, "Gemini");
    assert.equal(err.envVar, "GEMINI_API_KEY");
  } finally {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  }
});
