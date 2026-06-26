import test from "node:test";
import assert from "node:assert/strict";
import { createSession, runAgentLoop, executeWithRetry } from "../server/runtime.js";
import { getRun, getEvents, clearAll } from "../server/store.js";
import { initDatabase } from "../server/memory/database.js";
import { globalRegistry } from "../server/tools/registry.js";
import { Tool } from "../server/tools/base.js";

test.before(async () => {
  await initDatabase();
});

test.beforeEach(() => {
  clearAll();
  process.env.NODE_ENV = "test";
  process.env.PROVIDER = "dummy";
});

test("createSession stores a new run state starting in pending", () => {
  const runId = createSession("research");
  assert.ok(runId.startsWith("run_"));
  
  const run = getRun(runId);
  assert.ok(run);
  assert.equal(run.scenarioId, "research");
  assert.equal(run.status, "pending");
});

test("executeWithRetry backoff and exhaustion behavior", async () => {
  const stats = { attempts: [] };
  let calls = 0;
  
  try {
    await executeWithRetry(
      "test_step",
      "tool",
      async () => {
        calls++;
        throw new Error("Temporary error");
      },
      "run_123",
      stats
    );
    assert.fail("Should have thrown error on retry exhaustion");
  } catch (err) {
    assert.equal(err.message, "Temporary error");
    assert.equal(calls, 3); // Max attempts is 3 for tool
    assert.equal(stats.attempts.length, 3);
  }
});

test("runAgentLoop runs Coordinator with dummy provider and transitions to succeeded", async () => {
  const runId = createSession("research");
  
  class MockSearchTool extends Tool {
    constructor() { super("websearch", "Mock search", {}, "websearch"); }
    async run(input) { return [{ title: "Mock SOC 2 Result", content: "30-day data retention" }]; }
  }
  class MockPythonTool extends Tool {
    constructor() { super("python", "Mock python", {}, "python"); }
    async run(input) { return { stdout: "Verification check: data retention policy is 30 days - PASS", stderr: "" }; }
  }
  
  const originalSearch = globalRegistry.get("websearch");
  const originalPython = globalRegistry.get("python");
  
  globalRegistry.register(new MockSearchTool());
  globalRegistry.register(new MockPythonTool());

  // Set test environment
  process.env.PROVIDER = "dummy";
  process.env.NODE_ENV = "test";

  try {
    await runAgentLoop(runId, false);
    
    const run = getRun(runId);
    assert.equal(run.status, "succeeded");
    
    const events = getEvents(runId);
    assert.ok(events.length >= 3);
    assert.ok(events.some(e => e.title.includes("Coordinator - Plan Ready")));
    assert.ok(events.some(e => e.title.includes("Alice (Researcher) - Thought")));
    assert.ok(events.some(e => e.title.includes("Task Completed")));
  } finally {
    if (originalSearch) globalRegistry.register(originalSearch);
    if (originalPython) globalRegistry.register(originalPython);
  }
});

test("runAgentLoop transitions to failed when forceFailure is true", async () => {
  const runId = createSession("research");
  
  await runAgentLoop(runId, true);
  
  const run = getRun(runId);
  assert.equal(run.status, "failed");
  
  const events = getEvents(runId);
  assert.ok(events.some(e => e.title === "Run Failed"));
  assert.ok(events.find(e => e.title === "Run Failed").detail.includes("Forced execution failure"));
});
