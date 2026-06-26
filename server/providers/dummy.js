import { ProviderAdapter } from "./base.js";

export class DummyAdapter extends ProviderAdapter {
  constructor(config = {}) {
    super(config);
    this.name = "DummyProvider";
  }

  static get capabilities() {
    return {
      streaming: true,
      toolCalls: true,
      structuredOutput: true
    };
  }

  async chat(messages, options = {}) {
    const lastMessage = messages[messages.length - 1]?.content || "";
    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    
    // Simulate latency
    const latency = 10;

    // 1. Planner logic
    if (systemMessage.includes("Planner") || systemMessage.includes("Coordinator")) {
      // Coordinator is decomposing task
      return {
        content: JSON.stringify({
          plan: [
            { role: "Researcher", task: "Search for security policies and extract SOC 2 details." },
            { role: "Programmer", task: "Write a python script sandbox/verify.py to validate the policy." },
            { role: "Reviewer", task: "Review the python script output and verify correctness." }
          ]
        }),
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
        latency
      };
    }

    // 2. Researcher logic
    if (systemMessage.includes("Researcher")) {
      // Check if we already performed tool calls
      const lastToolMessage = messages.find(m => m.role === "tool");
      if (!lastToolMessage) {
        // Return tool call to websearch
        return {
          content: "I will search the web for security policies.",
          toolCalls: [
            {
              id: "call_web_1",
              type: "function",
              function: {
                name: "websearch",
                arguments: JSON.stringify({ query: "SOC 2 security policies data retention" })
              }
            }
          ],
          usage: { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
          latency
        };
      } else {
        // We got tool output
        return {
          content: "I found that the data retention policy requires 30-day configurable window for SOC 2 Type II.",
          toolCalls: [],
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          latency
        };
      }
    }

    // 3. Programmer logic
    if (systemMessage.includes("Programmer")) {
      const lastToolMessage = messages.find(m => m.role === "tool");
      if (!lastToolMessage) {
        // Return tool call to write python script
        return {
          content: "I will write a Python script to verify the policy.",
          toolCalls: [
            {
              id: "call_py_1",
              type: "function",
              function: {
                name: "python",
                arguments: JSON.stringify({
                  code: "print('Verification check: data retention policy is 30 days - PASS')"
                })
              }
            }
          ],
          usage: { promptTokens: 30, completionTokens: 50, totalTokens: 80 },
          latency
        };
      } else {
        return {
          content: "The python script was written and executed, confirming 30 days check passes.",
          toolCalls: [],
          usage: { promptTokens: 70, completionTokens: 20, totalTokens: 90 },
          latency
        };
      }
    }

    // 4. Reviewer logic
    if (systemMessage.includes("Reviewer")) {
      // Reviewer approves the work
      return {
        content: "I reviewed the execution logs. The data retention policy verification script successfully checked out. Task completed.",
        toolCalls: [],
        usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
        latency
      };
    }

    // Fallback default response
    return {
      content: "Task completed successfully by Dummy Adapter.",
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      latency
    };
  }

  async *streamChat(messages, options = {}) {
    const res = await this.chat(messages, options);
    yield res.content;
  }
}
