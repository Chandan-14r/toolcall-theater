import { PermissionDeniedError } from "./base.js";
import { saveEvent } from "../store.js";

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(toolInstance) {
    this.tools.set(toolInstance.name, toolInstance);
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  async execute(toolName, input, context = {}) {
    const tool = this.get(toolName);
    if (!tool) {
      return {
        success: false,
        output: null,
        error: `ToolNotFound: Tool "${toolName}" is not registered.`,
        durationMs: 0
      };
    }

    // 1. Permission hook check
    const sessionPermissions = context.permissions || [];
    if (tool.requiredPermission && !sessionPermissions.includes(tool.requiredPermission)) {
      throw new PermissionDeniedError(toolName, tool.requiredPermission);
    }

    const startTime = Date.now();
    
    // Log tool invocation start event in DB
    const runId = context.runId || "system";
    saveEvent({
      runId,
      kind: "tool",
      title: `Invoking Tool: ${toolName}`,
      detail: `Parameters: ${JSON.stringify(input)}`,
      tool: toolName,
      input
    });

    try {
      // 2. Wrap execution in a timeout promise
      const executionPromise = tool.run(input, context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`TimeoutError: Execution exceeded limit of ${tool.timeoutMs}ms`)), tool.timeoutMs)
      );

      const output = await Promise.race([executionPromise, timeoutPromise]);
      const durationMs = Date.now() - startTime;

      // Log tool success
      saveEvent({
        runId,
        kind: "tool",
        title: `Tool Success: ${toolName}`,
        detail: `Completed in ${durationMs}ms`,
        tool: toolName,
        output,
        ms: durationMs
      });

      return { success: true, output, error: null, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startTime;

      // Log tool failure
      saveEvent({
        runId,
        kind: "tool",
        title: `Tool Failed: ${toolName}`,
        detail: `Error: ${err.message}`,
        tool: toolName,
        error: err.message,
        ms: durationMs
      });

      return { success: false, output: null, error: err.message, durationMs };
    }
  }
}

import { FileSystemTool } from "./plugins/filesystem.js";
import { ShellTool } from "./plugins/shell.js";
import { PythonTool } from "./plugins/python.js";
import { WebSearchTool } from "./plugins/websearch.js";
import { BrowserTool } from "./plugins/browser.js";

export const globalRegistry = new ToolRegistry();

globalRegistry.register(new FileSystemTool());
globalRegistry.register(new ShellTool());
globalRegistry.register(new PythonTool());
globalRegistry.register(new WebSearchTool());
globalRegistry.register(new BrowserTool());

