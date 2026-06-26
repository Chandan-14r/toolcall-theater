import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const RUNS_FILE = path.join(DATA_DIR, "runs.jsonl");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function appendJsonl(filePath, record) {
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
}

export function saveRun(run) {
  const runs = readJsonl(RUNS_FILE);
  const index = runs.findIndex(r => r.id === run.id);
  if (index !== -1) {
    // We update by rewriting (for simple JSONL persistence)
    runs[index] = { ...runs[index], ...run };
    fs.writeFileSync(RUNS_FILE, runs.map(r => JSON.stringify(r)).join("\n") + "\n", "utf-8");
  } else {
    appendJsonl(RUNS_FILE, run);
  }
}

export function getRun(runId) {
  const runs = readJsonl(RUNS_FILE);
  return runs.find(r => r.id === runId) || null;
}

export function saveEvent(event) {
  appendJsonl(EVENTS_FILE, { ...event, timestamp: new Date().toISOString() });
}

export function getEvents(runId) {
  const events = readJsonl(EVENTS_FILE);
  return events.filter(e => e.runId === runId);
}

export function clearAll() {
  if (fs.existsSync(RUNS_FILE)) fs.unlinkSync(RUNS_FILE);
  if (fs.existsSync(EVENTS_FILE)) fs.unlinkSync(EVENTS_FILE);
}
