import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Tool } from "../base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../../../sandbox");

if (!fs.existsSync(SANDBOX_DIR)) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

export class FileSystemTool extends Tool {
  constructor() {
    super(
      "filesystem",
      "Read or write files within the sandboxed working directory.",
      {
        type: "object",
        properties: {
          action: { type: "string", enum: ["read", "write"] },
          filePath: { type: "string" },
          content: { type: "string" }
        },
        required: ["action", "filePath"]
      },
      "filesystem",
      5000,
      "write"
    );
  }

  async run(input, context = {}) {
    const targetPath = input.filePath || input.path;
    if (!targetPath) {
      throw new Error("MissingParameter: Either 'filePath' or 'path' must be specified.");
    }

    // Prevent path traversal
    const safePath = path.resolve(SANDBOX_DIR, targetPath);
    if (!safePath.startsWith(SANDBOX_DIR)) {
      throw new Error("AccessDenied: Path traversal attempt detected.");
    }

    const action = input.action || (input.content !== undefined ? "write" : "read");

    if (action === "read") {
      if (!fs.existsSync(safePath)) {
        throw new Error(`FileNotFound: File does not exist at path: ${targetPath}`);
      }
      return fs.readFileSync(safePath, "utf-8");
    } else if (action === "write") {
      // Auto-create parent folders if they don't exist
      fs.mkdirSync(path.dirname(safePath), { recursive: true });
      fs.writeFileSync(safePath, input.content || "", "utf-8");
      return `File successfully written to ${targetPath}`;
    } else {
      throw new Error(`InvalidAction: Action must be 'read' or 'write', got '${action}'`);
    }
  }
}
