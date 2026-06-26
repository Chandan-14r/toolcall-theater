import { Researcher, Programmer, Reviewer } from "./roles.js";
import { db } from "../memory/database.js";
import {
  createSession as dbCreateSession,
  createRun as dbCreateRun,
  updateRunStatus as dbUpdateRunStatus,
  addStep as dbAddStep,
  addToolInvocation as dbAddToolInvocation,
  addMemoryRecord as dbAddMemoryRecord,
  getConversationHistory
} from "../memory/relational.js";
import { globalVectorStore } from "../memory/vector.js";

export class Coordinator {
  constructor(provider, sessionId, runId, emitFn) {
    this.provider = provider;
    this.sessionId = sessionId;
    this.runId = runId;
    this.emitFn = emitFn;
    this.agents = {
      Researcher: new Researcher(provider),
      Programmer: new Programmer(provider),
      Reviewer: new Reviewer(provider)
    };
  }

  async run(taskPrompt) {
    // 1. Initial relational logging
    const runExists = await db.get("SELECT 1 FROM runs WHERE id = ?", [this.runId]);
    if (!runExists) {
      await dbCreateRun(this.runId, this.sessionId, "running");
    } else {
      await dbUpdateRunStatus(this.runId, "running");
    }

    await this.emitFn({
      kind: "thought",
      title: "Coordinator - Planning",
      detail: `Decomposing overall task: "${taskPrompt}"`
    });

    // 2. Query vector memory for similar past events
    const memoryMatches = globalVectorStore.search(taskPrompt, "history", 3);
    let semanticContext = "";
    if (memoryMatches.length > 0) {
      semanticContext = "\nSemantic recall from past runs:\n" + 
        memoryMatches.map(m => `- ${m.content}`).join("\n");
      
      await this.emitFn({
        kind: "thought",
        title: "Coordinator - Semantic Recall",
        detail: `Retrieved ${memoryMatches.length} matching record(s) from vector memory.`
      });
    }

    // 3. Ask LLM to generate plan
    const systemPrompt = `You are the Coordinator/Planner agent. Your task is to decompose the user's request into a sequential plan of 2 to 4 steps.
Each step MUST be assigned to one of the specialized roles: "Researcher", "Programmer", or "Reviewer".
Respond ONLY with a JSON object in this format:
{
  "plan": [
    { "role": "Researcher" | "Programmer" | "Reviewer", "task": "detailed instruction for the agent" }
  ]
}`;

    const userPrompt = `Task: "${taskPrompt}"${semanticContext}\nPlease generate the plan.`;

    let planObj;
    try {
      const response = await this.provider.chat([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]);
      // Robust JSON extraction & parsing (handles markdown wrappers like ```json ... ```)
      let cleaned = response.content.trim();
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      const data = JSON.parse(cleaned);
      planObj = data.plan;
    } catch (err) {
      // Fallback if JSON parsing fails or Provider throws
      await this.emitFn({
        kind: "thought",
        title: "Coordinator - Planning Error",
        detail: `Failed to plan: ${err.message}. Using default fallback plan.`
      });
      throw err;
    }

    await this.emitFn({
      kind: "thought",
      title: "Coordinator - Plan Ready",
      detail: `Plan constructed:\n${planObj.map((s, idx) => `${idx + 1}. [${s.role}] ${s.task}`).join("\n")}`
    });

    // Save plan steps to relational memory
    for (let i = 0; i < planObj.length; i++) {
      const step = planObj[i];
      const stepId = `step_${this.runId}_${i}`;
      await dbAddStep(stepId, this.runId, "thought", `Planned Step: ${step.role}`, step.task);
    }

    // 4. Execute the plan steps (Agent Handoffs)
    let workspaceState = "Initial workspace setup.";
    let activeReworkLimit = 2;

    for (let i = 0; i < planObj.length; i++) {
      const step = planObj[i];
      const stepId = `step_${this.runId}_${i}`;
      const agent = this.agents[step.role];

      if (!agent) {
        throw new Error(`Plan contains unregistered agent role: ${step.role}`);
      }

      await this.emitFn({
        kind: "thought",
        title: `Handoff to ${agent.name} (${agent.role})`,
        detail: `Starting step ${i + 1}/${planObj.length}: "${step.task}"`
      });

      // Fetch latest conversation history from SQLite as context
      const history = await getConversationHistory(this.sessionId);
      const historyCtx = history.map(h => `[${h.kind}] ${h.title}: ${h.detail}`).join("\n");

      // Execute step
      const taskInput = `Context:\n${historyCtx}\n\nWorkspace State:\n${workspaceState}\n\nInstruction:\n${step.task}`;
      
      let stepResult = await agent.runStep(taskInput, this.runId, this.emitFn);
      
      const lowerResult = stepResult.toLowerCase();
      if (
        lowerResult.includes("cannot complete") ||
        lowerResult.includes("unable to complete") ||
        lowerResult.includes("failed to") ||
        lowerResult.includes("missing credentials") ||
        lowerResult.includes("fatal tool failure")
      ) {
        throw new Error(`Step execution blocked or failed during ${agent.role} run: ${stepResult}`);
      }
      
      // Save step completion in SQLite relational memory
      const completionStepId = `step_complete_${this.runId}_${i}`;
      await dbAddStep(completionStepId, this.runId, "thought", `${agent.name} (${agent.role}) Complete`, stepResult);

      // If Reviewer, verify success. If rejected, trigger Rework Loop
      if (agent.role === "Reviewer") {
        let reworkCount = 0;
        while (
          (stepResult.toLowerCase().includes("reject") || stepResult.toLowerCase().includes("fail")) &&
          reworkCount < activeReworkLimit
        ) {
          reworkCount++;
          await this.emitFn({
            kind: "thought",
            title: `Reviewer Reject - Rework Loop #${reworkCount}`,
            detail: `Validation failed: "${stepResult}". Directing Programmer to repair.`
          });

          // Handoff back to Programmer
          const progAgent = this.agents.Programmer;
          const repairTask = `Reviewer feedback: "${stepResult}". Please correct the implementation and execution tools to pass verification.`;
          
          const repairStepId = `step_rework_${this.runId}_${i}_${reworkCount}`;
          await dbAddStep(repairStepId, this.runId, "thought", `Rework Instruction`, repairTask);

          const repairResult = await progAgent.runStep(repairTask, this.runId, this.emitFn);
          
          await dbAddStep(`step_rework_done_${this.runId}_${i}_${reworkCount}`, this.runId, "thought", `Programmer Repair Done`, repairResult);

          // Re-review
          await this.emitFn({
            kind: "thought",
            title: `Handoff to Reviewer (Re-evaluation)`,
            detail: `Charlie (Reviewer) is checking the repaired state...`
          });

          stepResult = await agent.runStep(
            `Previous feedback was addressed. New programmer output: "${repairResult}". Please re-evaluate.`,
            this.runId,
            this.emitFn
          );

          await dbAddStep(`step_rereview_${this.runId}_${i}_${reworkCount}`, this.runId, "thought", `Reviewer Recheck Result`, stepResult);
        }

        if (stepResult.toLowerCase().includes("reject") || stepResult.toLowerCase().includes("fail")) {
          throw new Error(`Reviewer rejected the task after retries: ${stepResult}`);
        }
      }

      workspaceState = stepResult;
      
      // Index the outcome into Vector Memory for semantic recall in future runs
      globalVectorStore.add(stepId, "history", `Task: ${step.task} | Outcome: ${stepResult}`);
      await dbAddMemoryRecord(`mem_${stepId}`, this.sessionId, this.runId, stepId, "history", `Step: ${step.task}. Outcome: ${stepResult}`);
    }

    // Success transition
    await dbUpdateRunStatus(this.runId, "succeeded");
    return workspaceState;
  }
}
