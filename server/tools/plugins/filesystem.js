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
    // Prevent path traversal
    const safePath = path.resolve(SANDBOX_DIR, input.filePath);
    if (!safePath.startsWith(SANDBOX_DIR)) {
      throw new Error("AccessDenied: Path traversal attempt detected.");
    }

    if (input.action === "read") {
      if (!fs.existsSync(safePath)) {
        throw new Error(`FileNotFound: File does not exist at path: ${input.filePath}`);
      }
      return fs.readFileSync(safePath, "utf-8");
    } else if (input.action === "write") {
      fs.writeFileSync(safePath, input.content || "", "utf-8");
      return `File successfully written to ${input.filePath}`;
    }
  }
}
