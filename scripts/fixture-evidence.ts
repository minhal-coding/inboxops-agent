import { writeFileSync } from "node:fs";
import { Store } from "../server/store.ts";
import { FixtureProvider } from "../server/provider.ts";
import { FixtureModel } from "../server/model.ts";
import { Knowledge } from "../server/knowledge.ts";
import { Agent } from "../server/agent.ts";
import { Approval } from "../server/approval.ts";
import { createToolServer, connectTools, callTool } from "../server/mcp.ts";
const store = new Store(":memory:");
const provider = new FixtureProvider(store);
const model = new FixtureModel();
const knowledge = new Knowledge(store, model);
await knowledge.import({
  title: "Meeting preferences.md",
  text: "My preferred meeting duration is 30 minutes during normal working hours.",
  approved: true,
});
const [task] = await new Agent(store, provider, model, knowledge).process({
  start: new Date(Date.now() + 7 * 86400000).toISOString(),
  timeZone: "UTC",
  duration: 30,
});
if (!task.plan) throw Error(task.error || "No plan");
const bundle = createToolServer(
  provider,
  knowledge,
  new Approval(store, provider),
);
const client = await connectTools(bundle.server);
const receipts = [];
for (const [kind, tool] of [
  ["draft", "gmail.create_draft"],
  ["event", "calendar.create_event"],
  ["send", "gmail.send_approved_draft"],
] as const) {
  receipts.push(
    await callTool(client, tool, {
      capability: bundle.grant(task.id, kind, task.hash!),
    }),
  );
}
const duplicate = await callTool(client, "gmail.send_approved_draft", {
  capability: bundle.grant(task.id, "send", task.hash!),
});
const record = {
  at: new Date().toISOString(),
  mode: "FIXTURE ONLY",
  liveAcceptance: "BLOCKED / UNVERIFIED",
  model: model.name,
  modelVersion: "scripted fixture v1, no inference",
  mcpTools: (await client.listTools()).tools.map((t) => t.name),
  selectedReadTools: task.trace,
  citationIds: task.plan.citations.map((c) => c.id),
  approvalHash: task.hash,
  receipts,
  retrySameReceipt: duplicate.id === receipts[2].id,
  sendCount: store.db
    .prepare("SELECT COUNT(*) AS n FROM external WHERE kind='send'")
    .get()!.n,
  irrelevantRetrieval: await knowledge.search("astronomy galaxy"),
};
writeFileSync(
  "evidence/fixture-run.json",
  JSON.stringify(record, null, 2) + "\n",
);
console.log(JSON.stringify(record, null, 2));
await client.close();
await bundle.server.close();
store.close();
