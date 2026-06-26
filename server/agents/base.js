import { globalRegistry } from "../tools/registry.js";
import { addStep, addToolInvocation } from "../memory/relational.js";
import { globalVectorStore } from "../memory/vector.js";

export class Agent {
  constructor(name, role, provider, systemPrompt, tools = [], permissions = []) {
    this.name = name;
    this.role = role;
    this.provider = provider;
    this.systemPrompt = systemPrompt;
    this.tools = tools; // Array of tool names
    this.permissions = permissions; // Array of permissions e.g. ["filesystem", "shell"]
    this.messages = [];
  }

  async runStep(taskDescription, runId, emitFn) {
    if (this.messages.length === 0) {
      this.messages.push({ role: "system", content: this.systemPrompt });
      this.messages.push({ role: "user", content: taskDescription });
    } else {
      this.messages.push({ role: "user", content: `Continue: ${taskDescription}` });
    }

    await emitFn({
      kind: "thought",
      title: `${this.name} (${this.role}) - Thinking`,
      detail: `Analyzing task step: "${taskDescription}"`
    });

    // 1. Get tool definitions for the provider if supported
    const toolsForLLM = this.tools.map(toolName => {
      const toolInstance = globalRegistry.get(toolName);
      if (!toolInstance) return null;
      return {
        type: "function",
        function: {
          name: toolInstance.name,
          description: toolInstance.description,
          parameters: toolInstance.schema
        }
      };
    }).filter(Boolean);

    let stepCount = 0;
    const maxSteps = 5;

    while (stepCount < maxSteps) {
      stepCount++;

      // Invoke LLM
      const response = await this.provider.chat(this.messages, {
        tools: toolsForLLM.length > 0 ? toolsForLLM : undefined
      });

      this.messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.toolCalls
      });

      if (response.content) {
        await emitFn({
          kind: "thought",
          title: `${this.name} (${this.role}) - Thought`,
          detail: response.content
        });
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          await emitFn({
            kind: "thought",
            title: `${this.name} (${this.role}) - Requesting Tool`,
            detail: `Tool: ${toolName}. Args: ${JSON.stringify(toolArgs)}`
          });

          // Execute tool via registry
          const executionContext = { runId, permissions: this.permissions };
          const result = await globalRegistry.execute(toolName, toolArgs, executionContext);

          // Append tool response
          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: result.success ? JSON.stringify(result.output) : result.error
          });

          if (result.success) {
            await emitFn({
              kind: "tool",
              title: `${this.name} (${this.role}) - Tool Success`,
              detail: `Tool: ${toolName}. Output: ${JSON.stringify(result.output)}`,
              tool: toolName,
              input: toolArgs,
              output: result.output,
              ms: result.durationMs
            });
          } else {
            await emitFn({
              kind: "tool",
              title: `${this.name} (${this.role}) - Tool Failed`,
              detail: `Tool: ${toolName}. Error: ${result.error}`,
              tool: toolName,
              input: toolArgs,
              error: result.error,
              ms: result.durationMs
            });

            if (
              result.error.includes("MissingCredentialsError") ||
              result.error.includes("PermissionDeniedError") ||
              result.error.includes("OllamaNotRunningError")
            ) {
              throw new Error(`Fatal tool failure: ${result.error}`);
            }
          }
        }
      } else {
        // No tool calls, step execution is complete
        return response.content;
      }
    }

    return "Step execution reached limit of iterations.";
  }
}
