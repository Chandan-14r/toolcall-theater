import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Tool } from "../base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../../../sandbox");

export class ShellTool extends Tool {
  constructor() {
    super(
      "shell",
      "Execute shell commands in the isolated sandbox directory.",
      {
        type: "object",
        properties: {
          command: { type: "string" }
        },
        required: ["command"]
      },
      "shell",
      10000,
      "execute"
    );
  }

  async run(input, context = {}) {
    return new Promise((resolve, reject) => {
      // Subprocess isolation: enforce working directory
      exec(
        input.command,
        {
          cwd: SANDBOX_DIR,
          timeout: this.timeoutMs - 1000
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`ShellError: ${error.message} (stderr: ${stderr})`));
            return;
          }
          resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        }
      );
    });
  }
}
