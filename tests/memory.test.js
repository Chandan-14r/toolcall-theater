import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { db, initDatabase } from "../server/memory/database.js";
import {
  createSession,
  createRun,
  updateRunStatus,
  addStep,
  addToolInvocation,
  addMemoryRecord,
  getConversationHistory,
  getToolHistory,
  deleteSession,
  clearAllRelational
} from "../server/memory/relational.js";
import { VectorStore } from "../server/memory/vector.js";

test.before(async () => {
  await initDatabase();
});

test.beforeEach(async () => {
  await clearAllRelational();
});

test("Database Schema has tables and Foreign Key enforcement", async () => {
  // Test if we can insert and foreign keys constraint works
  await assert.rejects(
    async () => {
      // Should fail because session 'non_existent_session' does not exist
      await createRun("run_1", "non_existent_session", "pending");
    },
    /FOREIGN KEY/
  );
});

test("Relational cascade delete works", async () => {
  const sessionId = "session_cascade_test";
  await createSession(sessionId, "research");
  await createRun("run_1", sessionId, "pending");
  await addStep("step_1", "run_1", "thought", "Init", "Detail");
  await addToolInvocation("tool_1", "step_1", "shell", { cmd: "ls" }, { stdout: "ok" }, null, 10);
  await addMemoryRecord("mem_1", sessionId, "run_1", "step_1", "history", "Important fact");

  // Verify everything exists
  const runBefore = await db.get("SELECT * FROM runs WHERE id = ?", ["run_1"]);
  assert.ok(runBefore);
  const stepBefore = await db.get("SELECT * FROM steps WHERE id = ?", ["step_1"]);
  assert.ok(stepBefore);
  const toolBefore = await db.get("SELECT * FROM tool_invocations WHERE id = ?", ["tool_1"]);
  assert.ok(toolBefore);
  const memBefore = await db.get("SELECT * FROM memory_records WHERE id = ?", ["mem_1"]);
  assert.ok(memBefore);

  // Perform cascade delete
  await deleteSession(sessionId);

  // Verify everything is deleted
  const sessionAfter = await db.get("SELECT * FROM sessions WHERE id = ?", [sessionId]);
  assert.equal(sessionAfter, undefined);
  const runAfter = await db.get("SELECT * FROM runs WHERE id = ?", ["run_1"]);
  assert.equal(runAfter, undefined);
  const stepAfter = await db.get("SELECT * FROM steps WHERE id = ?", ["step_1"]);
  assert.equal(stepAfter, undefined);
  const toolAfter = await db.get("SELECT * FROM tool_invocations WHERE id = ?", ["tool_1"]);
  assert.equal(toolAfter, undefined);
  const memAfter = await db.get("SELECT * FROM memory_records WHERE id = ?", ["mem_1"]);
  assert.equal(memAfter, undefined);
});

test("Retrieve conversation history and tool logs with date filtering", async () => {
  const sessionId = "session_history_test";
  await createSession(sessionId, "support");
  
  await createRun("run_1", sessionId, "running");
  
  // Add steps
  await addStep("step_1", "run_1", "thought", "First Step", "First Detail");
  await addStep("step_2", "run_1", "tool", "Second Step", "Second Detail");
  
  // Add tool invocations
  await addToolInvocation("tool_1", "step_2", "websearch", { q: "query1" }, { result: "res1" }, null, 50);
  // Wait slightly to ensure different timestamps if needed, or query tool history directly
  await addToolInvocation("tool_2", "step_2", "websearch", { q: "query2" }, { result: "res2" }, null, 60);

  // Fetch Conversation History
  const history = await getConversationHistory(sessionId);
  assert.equal(history.length, 2);
  assert.equal(history[0].title, "First Step");
  assert.equal(history[1].title, "Second Step");

  // Fetch Tool History
  const toolHistory = await getToolHistory("websearch", sessionId);
  assert.equal(toolHistory.length, 2);
  assert.equal(JSON.parse(toolHistory[0].input).q, "query1");
  assert.equal(JSON.parse(toolHistory[1].input).q, "query2");

  // Fetch with date limits (use actual records timestamps)
  const firstTimestamp = toolHistory[0].created_at;
  const filteredHistory = await getToolHistory("websearch", sessionId, firstTimestamp);
  assert.ok(filteredHistory.length >= 1);
});

test("TF-IDF Vector Space Model vector search ranking & scope filtering", () => {
  const store = new VectorStore();
  
  // Add documents with different scopes
  store.add("doc1", "kb", "NodeJS is a JavaScript runtime built on Chrome's V8 engine.");
  store.add("doc2", "kb", "Python is an interpreted high-level programming language.");
  store.add("doc3", "history", "NodeJS server running on port 8080 successfully.");
  store.add("doc4", "kb", "JavaScript is a programming language used for web development.");

  // Query KB for JavaScript
  const kbResults = store.search("javascript", "kb");
  assert.ok(kbResults.length >= 2);
  // doc4 should be ranked higher than doc1 because "javascript" is in both, but doc4 has "language" and other JavaScript related contexts
  // Let's verify doc4 and doc1 are returned in KB, and NOT doc3 (which has 'history' scope)
  assert.ok(kbResults.some(r => r.id === "doc1"));
  assert.ok(kbResults.some(r => r.id === "doc4"));
  assert.ok(!kbResults.some(r => r.id === "doc3"));

  // Check that the best match is returned first
  // Query for "Python language" in KB
  const pythonResults = store.search("Python language", "kb");
  assert.equal(pythonResults[0].id, "doc2");

  // Clear works
  store.clear();
  const emptyResults = store.search("javascript", "kb");
  assert.equal(emptyResults.length, 0);
});
