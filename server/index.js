import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, runAgentLoop, runtimeEvents } from "./runtime.js";
import { getRun, getEvents } from "./store.js";
import { scenarios } from "../public/data.js";
import { db, initDatabase } from "./memory/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

initDatabase().catch(err => {
  console.error("Database initialization failed:", err);
});

app.get("/api/scenarios", (req, res) => {
  res.json(scenarios);
});

// Get relational database stats
app.get("/api/stats", async (req, res) => {
  try {
    const sessionCount = await db.get("SELECT COUNT(*) as count FROM sessions");
    const runCounts = await db.all("SELECT status, COUNT(*) as count FROM runs GROUP BY status");
    const toolCounts = await db.all("SELECT tool_name, COUNT(*) as count, AVG(duration_ms) as avg_duration FROM tool_invocations GROUP BY tool_name");
    const memoryCount = await db.get("SELECT COUNT(*) as count FROM memory_records");

    res.json({
      sessions: sessionCount?.count || 0,
      runs: runCounts,
      tools: toolCounts,
      memories: memoryCount?.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats: " + err.message });
  }
});

// Create a new agent run session
app.post("/api/runs", (req, res) => {
  const { scenarioId, forceFailure } = req.body;
  if (!scenarioId) {
    return res.status(400).json({ error: "Missing scenarioId" });
  }
  const runId = createSession(scenarioId);
  
  // Start the agent runtime loop asynchronously
  runAgentLoop(runId, Boolean(forceFailure)).catch(err => {
    console.error(`Error in agent loop for run ${runId}:`, err);
  });

  res.json({ runId });
});

// Get run details
app.get("/api/runs/:id", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: "Run not found" });
  res.json(run);
});

// SSE Event Stream for a run session
app.get("/api/runs/:id/stream", (req, res) => {
  const runId = req.params.id;
  const run = getRun(runId);
  if (!run) return res.status(404).json({ error: "Run not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // 1. Immediately send any previously saved events
  const existingEvents = getEvents(runId);
  for (const event of existingEvents) {
    res.write(`data: ${JSON.stringify({ type: "step_added", event })}\n\n`);
  }
  
  // Also send current status
  res.write(`data: ${JSON.stringify({ type: "status_changed", status: run.status })}\n\n`);

  // 2. Listen to live runtime events
  const onRuntimeEvent = (msg) => {
    if (msg.runId === runId) {
      res.write(`data: ${JSON.stringify(msg)}\n\n`);
      if (msg.status === "complete" || msg.status === "failed") {
        // Run has finished, but we don't necessarily close the stream immediately
        // to let the client receive the complete event.
      }
    }
  };

  runtimeEvents.on("event", onRuntimeEvent);

  req.on("close", () => {
    runtimeEvents.off("event", onRuntimeEvent);
  });
});

app.listen(PORT, () => {
  console.log(`Toolcall Theater Server running at http://localhost:${PORT}`);
});
