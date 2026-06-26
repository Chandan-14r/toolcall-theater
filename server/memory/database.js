import sqlite3 from "sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, "../../data");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, "memory.db");

// Promisified SQLite wrapper
class Database {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export const db = new Database(DB_PATH);

export async function initDatabase() {
  // Enforce foreign key constraints
  await db.run("PRAGMA foreign_keys = ON;");

  // Create tables
  await db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      scenario_id TEXT,
      created_at TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      status TEXT,
      approved INTEGER DEFAULT 0,
      started_at TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      kind TEXT,
      title TEXT,
      detail TEXT,
      ms INTEGER DEFAULT 0,
      created_at TEXT,
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS tool_invocations (
      id TEXT PRIMARY KEY,
      step_id TEXT,
      tool_name TEXT,
      input TEXT,
      output TEXT,
      error TEXT,
      duration_ms INTEGER DEFAULT 0,
      created_at TEXT,
      FOREIGN KEY(step_id) REFERENCES steps(id) ON DELETE CASCADE
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS memory_records (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      source_run_id TEXT,
      source_step_id TEXT,
      scope TEXT, -- 'history' | 'preference' | 'kb'
      content TEXT,
      created_at TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
}
