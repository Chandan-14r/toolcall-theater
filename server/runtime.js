import { EventEmitter } from "node:events";
import { saveRun, saveEvent, getRun } from "./store.js";
import { scenarios } from "../public/data.js";
import { db, initDatabase } from "./memory/database.js";
import {
  createSession as dbCreateSession,
  createRun as dbCreateRun,
  addStep as dbAddStep,
  addToolInvocation as dbAddToolInvocation,
  updateRunStatus as dbUpdateRunStatus
} from "./memory/relational.js";
import { OpenAIAdapter } from "./providers/openai.js";
import { AnthropicAdapter } from "./providers/anthropic.js";
import { OllamaAdapter } from "./providers/ollama.js";
import { DummyAdapter } from "./providers/dummy.js";
import { GeminiAdapter } from "./providers/gemini.js";
import { Coordinator } from "./agents/coordinator.js";

export const runtimeEvents = new EventEmitter();

export const RETRY_POLICIES = {
  thought: { maxAttempts: 1, initialDelayMs: 0, backoffFactor: 1 },
  tool: { maxAttempts: 3, initialDelayMs: 50, backoffFactor: 2 },
  result: { maxAttempts: 1, initialDelayMs: 0, backoffFactor: 1 }
};

export function createSession(scenarioId) {
  const runId = "run_" + Math.random().toString(36).substring(2, 11);
  const run = {
    id: runId,
    scenarioId,
    status: "pending",
    approved: false,
    startedAt: new Date().toISOString()
  };
  saveRun(run);
  return runId;
}

export async function executeWithRetry(stepName, stepKind, stepFn, runId, stats) {
  const policy = RETRY_POLICIES[stepKind] || { maxAttempts: 1, initialDelayMs: 0, backoffFactor: 1 };
  let attempt = 0;
  
  while (attempt < policy.maxAttempts) {
    attempt++;
    try {
      return await stepFn();
    } catch (error) {
      if (stats && stats.attempts) {
        stats.attempts.push({ stepName, attempt, error: error.message });
      }
      
      if (attempt < policy.maxAttempts) {
        const delayTime = policy.initialDelayMs * Math.pow(policy.backoffFactor, attempt - 1);
        await emitStep(runId, {
          kind: "thought",
          title: `Step Failed (Attempt ${attempt}/${policy.maxAttempts})`,
          detail: `Retrying "${stepName}" in ${delayTime}ms due to: ${error.message}`
        });
        await delay(delayTime);
      } else {
        throw error;
      }
    }
  }
}

export async function runAgentLoop(runId, forceFailure = false) {
  const run = getRun(runId);
  if (!run) throw new Error("Run not found: " + runId);

  // Initialize SQLite Memory Tables
  await initDatabase();

  run.status = "running";
  saveRun(run);
  runtimeEvents.emit("event", { runId, type: "status_changed", status: "running" });

  const scenario = scenarios.find(s => s.id === run.scenarioId);
  const taskPrompt = scenario ? scenario.prompt : run.scenarioId;

  // Insert session and run in relational DB
  await dbCreateSession(runId, run.scenarioId);
  await dbCreateRun(runId, runId, "running");

  // Initialize selected provider
  let provider;
  const providerName = process.env.PROVIDER || "openai";

  try {
    if (forceFailure) {
      // Force an execution error for testing/demo error-handling paths
      throw new Error("Forced execution failure for verification.");
    }

    if (providerName === "dummy" || process.env.NODE_ENV === "test") {
      provider = new DummyAdapter();
    } else if (providerName === "anthropic") {
      provider = new AnthropicAdapter();
    } else if (providerName === "ollama") {
      provider = new OllamaAdapter();
    } else if (providerName === "gemini") {
      provider = new GeminiAdapter();
    } else {
      provider = new OpenAIAdapter();
    }

    const emitFn = async (eventData) => {
      const event = {
        id: "evt_" + Math.random().toString(36).substring(2, 11),
        runId,
        kind: eventData.kind,
        title: eventData.title,
        detail: eventData.detail,
        tool: eventData.tool,
        input: eventData.input,
        output: eventData.output,
        error: eventData.error,
        evidence: eventData.evidence,
        ms: eventData.ms || 0
      };
      saveEvent(event);
      runtimeEvents.emit("event", { runId, type: "step_added", event });

      try {
        const runExists = await db.get("SELECT 1 FROM runs WHERE id = ?", [runId]);
        if (runExists) {
          await dbAddStep(event.id, runId, event.kind, event.title, event.detail, event.ms);
          if (event.kind === "tool" && event.tool) {
            await dbAddToolInvocation(
              "ti_" + event.id,
              event.id,
              event.tool,
              event.input || {},
              event.output || null,
              event.error || null,
              event.ms
            );
          }
        }
      } catch (dbErr) {
        console.error("Failed to mirror event to SQLite:", dbErr);
      }
    };

    const coordinator = new Coordinator(provider, runId, runId, emitFn);
    const result = await coordinator.run(taskPrompt);

    run.status = "succeeded";
    saveRun(run);
    runtimeEvents.emit("event", { runId, type: "status_changed", status: "succeeded" });

    await emitFn({
      kind: "result",
      title: "Task Completed",
      detail: `Final result: ${result}`
    });

  } catch (error) {
    run.status = "failed";
    saveRun(run);

    try {
      await dbUpdateRunStatus(runId, "failed");
    } catch (dbErr) {
      console.error("Failed to update status in DB:", dbErr);
    }

    const emitFn = async (eventData) => {
      const event = {
        id: "evt_" + Math.random().toString(36).substring(2, 11),
        runId,
        kind: eventData.kind,
        title: eventData.title,
        detail: eventData.detail,
        ms: eventData.ms || 0
      };
      saveEvent(event);
      runtimeEvents.emit("event", { runId, type: "step_added", event });

      try {
        const runExists = await db.get("SELECT 1 FROM runs WHERE id = ?", [runId]);
        if (runExists) {
          await dbAddStep(event.id, runId, event.kind, event.title, event.detail, event.ms);
        }
      } catch (dbErr) {
        console.error("Failed to mirror event to SQLite:", dbErr);
      }
    };

    await emitFn({
      kind: "result",
      title: "Run Failed",
      detail: `Fatal: ${error.message}`
    });

    runtimeEvents.emit("event", { runId, type: "status_changed", status: "failed" });
  }
}

async function emitStep(runId, eventData) {
  const event = {
    id: "evt_" + Math.random().toString(36).substring(2, 11),
    runId,
    kind: eventData.kind,
    title: eventData.title,
    detail: eventData.detail,
    ms: eventData.ms || 0
  };
  saveEvent(event);
  runtimeEvents.emit("event", { runId, type: "step_added", event });

  try {
    const runExists = await db.get("SELECT 1 FROM runs WHERE id = ?", [runId]);
    if (runExists) {
      await dbAddStep(event.id, runId, event.kind, event.title, event.detail, event.ms);
    }
  } catch (dbErr) {
    console.error("Failed to mirror step event to SQLite:", dbErr);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
