import { db } from "./database.js";

export async function createSession(sessionId, scenarioId) {
  const timestamp = new Date().toISOString();
  await db.run(
    "INSERT INTO sessions (id, scenario_id, created_at) VALUES (?, ?, ?)",
    [sessionId, scenarioId, timestamp]
  );
}

export async function createRun(runId, sessionId, status) {
  const timestamp = new Date().toISOString();
  await db.run(
    "INSERT INTO runs (id, session_id, status, started_at) VALUES (?, ?, ?, ?)",
    [runId, sessionId, status, timestamp]
  );
}

export async function updateRunStatus(runId, status) {
  await db.run("UPDATE runs SET status = ? WHERE id = ?", [status, runId]);
}

export async function addStep(stepId, runId, kind, title, detail, ms = 0) {
  const timestamp = new Date().toISOString();
  await db.run(
    "INSERT INTO steps (id, run_id, kind, title, detail, ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [stepId, runId, kind, title, detail, ms, timestamp]
  );
}

export async function addToolInvocation(id, stepId, toolName, input, output, error, durationMs) {
  const timestamp = new Date().toISOString();
  await db.run(
    "INSERT INTO tool_invocations (id, step_id, tool_name, input, output, error, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      stepId,
      toolName,
      JSON.stringify(input),
      output ? JSON.stringify(output) : null,
      error,
      durationMs,
      timestamp
    ]
  );
}

export async function addMemoryRecord(id, sessionId, sourceRunId, sourceStepId, scope, content) {
  const timestamp = new Date().toISOString();
  await db.run(
    "INSERT INTO memory_records (id, session_id, source_run_id, source_step_id, scope, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, sessionId, sourceRunId, sourceStepId, scope, content, timestamp]
  );
}

export async function getConversationHistory(sessionId) {
  return db.all(
    `SELECT s.kind, s.title, s.detail, s.created_at 
     FROM steps s
     JOIN runs r ON s.run_id = r.id
     WHERE r.session_id = ?
     ORDER BY s.created_at ASC`,
    [sessionId]
  );
}

export async function getToolHistory(toolName, sessionId, startDate, endDate) {
  let query = `
    SELECT t.tool_name, t.input, t.output, t.error, t.duration_ms, t.created_at 
    FROM tool_invocations t
    JOIN steps s ON t.step_id = s.id
    JOIN runs r ON s.run_id = r.id
    WHERE r.session_id = ? AND t.tool_name = ?
  `;
  const params = [sessionId, toolName];

  if (startDate) {
    query += " AND t.created_at >= ?";
    params.push(startDate);
  }
  if (endDate) {
    query += " AND t.created_at <= ?";
    params.push(endDate);
  }

  return db.all(query, params);
}

export async function deleteSession(sessionId) {
  // Cascades to runs, steps, tool_invocations, and memory_records
  await db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

export async function clearAllRelational() {
  await db.run("DELETE FROM sessions");
}
