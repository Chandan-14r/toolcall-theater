import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Tool } from "../base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../../../sandbox");

export class PythonTool extends Tool {
  constructor() {
    super(
      "python",
      "Execute arbitrary Python code in isolation inside the sandbox.",
      {
        type: "object",
        properties: {
          code: { type: "string" }
        },
        required: ["code"]
      },
      "python",
      10000,
      "execute"
    );
  }

  async run(input, context = {}) {
    const filename = `script_${Math.random().toString(36).substring(2, 11)}.py`;
    const tempPath = path.join(SANDBOX_DIR, filename);

    fs.writeFileSync(tempPath, input.code, "utf-8");

    return new Promise((resolve, reject) => {
      execFile(
        "python",
        [filename],
        {
          cwd: SANDBOX_DIR,
          timeout: this.timeoutMs - 1000
        },
        (error, stdout, stderr) => {
          // Cleanup script immediately
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch (cleanupErr) {
            console.error("Cleanup error in PythonTool:", cleanupErr);
          }

          if (error) {
            reject(new Error(`PythonError: ${error.message} (stderr: ${stderr})`));
            return;
          }
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        }
      );
    });
  }
}
