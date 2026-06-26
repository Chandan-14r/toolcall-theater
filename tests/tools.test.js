import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ToolRegistry } from "../server/tools/registry.js";
import { FileSystemTool } from "../server/tools/plugins/filesystem.js";
import { ShellTool } from "../server/tools/plugins/shell.js";
import { PythonTool } from "../server/tools/plugins/python.js";
import { WebSearchTool } from "../server/tools/plugins/websearch.js";
import { BrowserTool } from "../server/tools/plugins/browser.js";
import { PermissionDeniedError, SchemaValidationError, Tool } from "../server/tools/base.js";
import { MissingCredentialsError } from "../server/providers/base.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX_DIR = path.resolve(__dirname, "../sandbox");

test.beforeEach(() => {
  // Clear sandbox directory
  if (fs.existsSync(SANDBOX_DIR)) {
    fs.readdirSync(SANDBOX_DIR).forEach(file => {
      fs.unlinkSync(path.join(SANDBOX_DIR, file));
    });
  }
});

test("Tool initialization throws SchemaValidationError on invalid definition", () => {
  try {
    new Tool(null, "No Name", {});
    assert.fail("Should have failed");
  } catch (err) {
    assert.ok(err instanceof SchemaValidationError);
  }
});

test("ToolRegistry execute checks permissions and throws PermissionDeniedError", async () => {
  const registry = new ToolRegistry();
  const fsTool = new FileSystemTool();
  registry.register(fsTool);

  try {
    await registry.execute("filesystem", { action: "read", filePath: "test.txt" }, { permissions: [] });
    assert.fail("Should have thrown PermissionDeniedError");
  } catch (err) {
    assert.ok(err instanceof PermissionDeniedError);
    assert.equal(err.toolName, "filesystem");
    assert.equal(err.requiredPermission, "filesystem");
  }
});

test("ToolRegistry execute handles timeout errors correctly", async () => {
  const registry = new ToolRegistry();
  
  // Create a slow dummy tool
  class SlowTool extends Tool {
    constructor() {
      super("slow", "Slow tool", { type: "object" }, "slow", 100);
    }
    async run() {
      return new Promise(resolve => setTimeout(() => resolve("done"), 500));
    }
  }

  registry.register(new SlowTool());
  const res = await registry.execute("slow", {}, { permissions: ["slow"] });
  assert.equal(res.success, false);
  assert.equal(res.output, null);
  assert.ok(res.error.includes("TimeoutError"));
});

test("FileSystemTool writes and reads files inside sandbox", async () => {
  const registry = new ToolRegistry();
  registry.register(new FileSystemTool());

  // Write file
  const writeRes = await registry.execute(
    "filesystem",
    { action: "write", filePath: "hello.txt", content: "sandbox content" },
    { permissions: ["filesystem"] }
  );
  assert.equal(writeRes.success, true);
  assert.equal(writeRes.output, "File successfully written to hello.txt");

  // Read file
  const readRes = await registry.execute(
    "filesystem",
    { action: "read", filePath: "hello.txt" },
    { permissions: ["filesystem"] }
  );
  assert.equal(readRes.success, true);
  assert.equal(readRes.output, "sandbox content");
  
  // Verify real disk file exists
  assert.ok(fs.existsSync(path.join(SANDBOX_DIR, "hello.txt")));
});

test("FileSystemTool prevents path traversal", async () => {
  const registry = new ToolRegistry();
  registry.register(new FileSystemTool());

  const res = await registry.execute(
    "filesystem",
    { action: "read", filePath: "../outside.txt" },
    { permissions: ["filesystem"] }
  );
  assert.equal(res.success, false);
  assert.ok(res.error.includes("AccessDenied"));
});

test("ShellTool executes subprocesses inside sandbox", async () => {
  const registry = new ToolRegistry();
  registry.register(new ShellTool());

  const res = await registry.execute(
    "shell",
    { command: "echo hello shell" },
    { permissions: ["shell"] }
  );
  assert.equal(res.success, true);
  assert.equal(res.output.stdout, "hello shell");
});

test("PythonTool executes python code in isolation", async () => {
  const registry = new ToolRegistry();
  registry.register(new PythonTool());

  const res = await registry.execute(
    "python",
    { code: "print('hello from python')" },
    { permissions: ["python"] }
  );
  assert.equal(res.success, true);
  assert.equal(res.output.stdout, "hello from python");
});

test("WebSearchTool throws MissingCredentialsError if TAVILY_API_KEY is not set", async () => {
  const registry = new ToolRegistry();
  registry.register(new WebSearchTool());

  const originalKey = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;

  const res = await registry.execute(
    "websearch",
    { query: "AI agents platform" },
    { permissions: ["websearch"] }
  );
  assert.equal(res.success, false);
  assert.ok(res.error.includes("MissingCredentialsError"));

  if (originalKey) process.env.TAVILY_API_KEY = originalKey;
});

test("BrowserTool automates chromium, clicks, fills, and takes screenshots", async () => {
  const registry = new ToolRegistry();
  const browserTool = new BrowserTool();
  registry.register(browserTool);

  // Write a temp html file inside the sandbox
  const tempHtmlPath = path.join(SANDBOX_DIR, "temp.html");
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <body>
      <h1 id="title">Hello Browser</h1>
      <input id="input-box" type="text" />
      <button id="btn" onclick="document.getElementById('title').innerText = 'Clicked!'">Click Me</button>
    </body>
    </html>
  `;
  fs.writeFileSync(tempHtmlPath, htmlContent, "utf-8");

  // Get file URL
  const fileUrl = `file:///${tempHtmlPath.replace(/\\/g, "/")}`;

  // 1. Navigate
  const navRes = await registry.execute(
    "browser",
    { action: "navigate", url: fileUrl },
    { permissions: ["browser"] }
  );
  assert.equal(navRes.success, true);

  // 2. Read content
  const contentRes = await registry.execute(
    "browser",
    { action: "content" },
    { permissions: ["browser"] }
  );
  assert.equal(contentRes.success, true);
  assert.ok(contentRes.output.includes("Hello Browser"));

  // 3. Fill input
  const fillRes = await registry.execute(
    "browser",
    { action: "fill", selector: "#input-box", value: "testing input" },
    { permissions: ["browser"] }
  );
  assert.equal(fillRes.success, true);

  // 4. Click button
  const clickRes = await registry.execute(
    "browser",
    { action: "click", selector: "#btn" },
    { permissions: ["browser"] }
  );
  assert.equal(clickRes.success, true);

  // 5. Verify text changed
  const contentRes2 = await registry.execute(
    "browser",
    { action: "content" },
    { permissions: ["browser"] }
  );
  assert.equal(contentRes2.success, true);
  assert.ok(contentRes2.output.includes("Clicked!"));

  // 6. Screenshot
  const screenshotRes = await registry.execute(
    "browser",
    { action: "screenshot", filePath: "screenshot.png" },
    { permissions: ["browser"] }
  );
  assert.equal(screenshotRes.success, true);
  assert.ok(fs.existsSync(path.join(SANDBOX_DIR, "screenshot.png")));

  // Clean up
  await browserTool.close();
});

