export const scenarios = [
  {
    id: "research",
    eyebrow: "Research assistant",
    title: "Vendor brief with sources",
    prompt: "Prepare a focused vendor brief for a security review.",
    accent: "violet",
    events: [
      { kind: "thought", title: "Plan the evidence trail", detail: "I need current policies, independent reports, and a concise risk summary.", ms: 450 },
      { kind: "tool", title: "Search knowledge base", tool: "knowledge.search", input: { query: "Northstar security policies SOC 2 data retention" }, output: { matches: 4, topResult: "Security & privacy overview · updated 12 days ago" }, evidence: ["Security & privacy overview", "Data processing addendum"], ms: 650 },
      { kind: "tool", title: "Extract control claims", tool: "document.extract", input: { document: "Security & privacy overview", fields: ["certifications", "encryption", "retention"] }, output: { certifications: ["SOC 2 Type II"], encryption: "AES-256 at rest; TLS 1.3 in transit", retention: "30-day configurable window" }, evidence: ["Control matrix §3", "Retention policy §2"], ms: 650 },
      { kind: "approval", title: "Approve external source lookup", detail: "The next step sends the vendor name to a public search provider.", ms: 0 },
      { kind: "tool", title: "Cross-check public reporting", tool: "web.search", input: { query: "Northstar breach history independent reporting" }, output: { sourcesReviewed: 6, finding: "No material incidents found in reviewed public sources." }, evidence: ["Independent reporting scan · 6 sources"], ms: 700 },
      { kind: "result", title: "Brief ready", detail: "Risk: low-to-moderate. Strong baseline controls; validate retention configuration during procurement.", ms: 300 }
    ]
  },
  {
    id: "support",
    eyebrow: "Support copilot",
    title: "Recover a failed export",
    prompt: "Help Maya diagnose why yesterday's CSV export timed out.",
    accent: "cyan",
    events: [
      { kind: "thought", title: "Confirm scope before changing anything", detail: "I will inspect the job and account context first.", ms: 450 },
      { kind: "tool", title: "Find export job", tool: "exports.get", input: { jobId: "exp_84KF", include: ["status", "attempts", "error"] }, output: { status: "failed", attempts: 1, error: "row limit exceeded: 250,000" }, evidence: ["Export job exp_84KF"], ms: 600 },
      { kind: "tool", title: "Read account limits", tool: "accounts.entitlements", input: { account: "maya@acme.co" }, output: { plan: "Growth", exportRowLimit: 250000, scheduledExports: true }, evidence: ["Acme workspace entitlement record"], ms: 600 },
      { kind: "approval", title: "Approve replacement export", detail: "Create a partitioned export and email Maya the secure download links.", ms: 0 },
      { kind: "tool", title: "Create partitioned export", tool: "exports.create", input: { format: "csv", partitions: 3, notify: "maya@acme.co" }, output: { status: "queued", jobs: ["exp_84KG", "exp_84KH", "exp_84KJ"] }, evidence: ["New export request · 3 partitions"], ms: 700 },
      { kind: "result", title: "Recovery queued", detail: "Three exports stay within the plan limit. Maya will receive secure links when processing finishes.", ms: 300 }
    ]
  },
  {
    id: "release",
    eyebrow: "Release coordinator",
    title: "Prepare a safe deploy",
    prompt: "Turn the merged checkout fix into a low-risk production release.",
    accent: "orange",
    events: [
      { kind: "thought", title: "Check the release signal", detail: "I need merged changes, tests, and rollout conditions before proposing a deploy.", ms: 450 },
      { kind: "tool", title: "Inspect merged pull request", tool: "github.pull_request", input: { number: 418, include: ["files", "checks", "labels"] }, output: { filesChanged: 4, checks: "passing", label: "checkout" }, evidence: ["PR #418 · merged 14 min ago"], ms: 600 },
      { kind: "tool", title: "Read error budget", tool: "observability.slo", input: { service: "checkout-api", window: "30d" }, output: { remaining: "99.1%", activeIncidents: 0, p95Latency: "183 ms" }, evidence: ["checkout-api SLO · healthy"], ms: 600 },
      { kind: "approval", title: "Approve canary rollout", detail: "Deploy to 5% of traffic, watch payment errors for 10 minutes, then continue automatically if healthy.", ms: 0 },
      { kind: "tool", title: "Start canary", tool: "deployments.create", input: { version: "2026.06.26.3", traffic: "5%", hold: "10m" }, output: { deployment: "dep_19AT", state: "monitoring" }, evidence: ["Deployment dep_19AT"], ms: 700 },
      { kind: "result", title: "Canary monitoring", detail: "The release is at 5% traffic with a 10-minute checkpoint. No production changes happen without the approval gate.", ms: 300 }
    ]
  }
];
