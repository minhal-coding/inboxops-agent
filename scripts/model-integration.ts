import { readFileSync, writeFileSync } from "node:fs";
import { Ollama, type ToolSpec } from "../server/model.ts";
import { Store } from "../server/store.ts";
import { FixtureProvider, fixtureThread } from "../server/provider.ts";
import { Knowledge } from "../server/knowledge.ts";
import { Agent } from "../server/agent.ts";
import { hash } from "../server/domain.ts";

const decisions: unknown[] = [];
class ObservedOllama extends Ollama {
  async decide(messages: unknown[], tools: ToolSpec[]) {
    const start = Date.now();
    const result = await super.decide(messages, tools);
    decisions.push({ elapsedMs: Date.now() - start, ...result });
    return result;
  }
}
const model = new ObservedOllama();
const source = readFileSync("fixtures/model-preferences.md", "utf8").trim();
const record: any = {
  at: new Date().toISOString(),
  command: "npm run model:integration",
  mode: "REAL LOCAL MODEL + FICTIONAL GMAIL/CALENDAR; NO EXTERNAL WRITES",
  model: model.name,
  embeddingModel: model.embedding,
  status: "FAIL",
  cases: [],
};
try {
  const version = await fetch("http://127.0.0.1:11434/api/version").then((r) =>
    r.json(),
  );
  const tags = await fetch("http://127.0.0.1:11434/api/tags").then((r) =>
    r.json(),
  );
  record.ollamaVersion = version.version;
  record.models = tags.models
    .filter((m: any) =>
      [model.name, model.embedding, model.embedding + ":latest"].includes(
        m.name,
      ),
    )
    .map((m: any) => ({ name: m.name, digest: m.digest, size: m.size }));
  const store = new Store(":memory:");
  try {
    const knowledge = new Knowledge(store, model);
    await knowledge.import({
      title: "model-preferences.md",
      text: source,
      approved: true,
    });
    const relevant = await knowledge.search(
      "How long should an appointment last, and when am I available for one?",
    );
    const irrelevant = await knowledge.search(
      "How do black holes emit Hawking radiation?",
    );
    record.retrieval = {
      relevant,
      irrelevant,
      pass:
        relevant.some(
          (c) => c.title === "model-preferences.md" && c.snippet === source,
        ) && irrelevant.length === 0,
    };
  } finally {
    store.close();
  }
  const start = new Date(Date.now() + 7 * 86400000);
  start.setUTCHours(14, 0, 0, 0);
  for (const c of [
    {
      id: "schedule",
      body: "Could we meet for 30 minutes? The user has confirmed the intended date and time in the scheduling form.",
      context: { start: start.toISOString(), timeZone: "UTC", duration: 30 },
      expected: "awaiting approval",
    },
    {
      id: "other",
      body: "Here is the monthly product newsletter. No meeting or reply is requested.",
      context: undefined,
      expected: "other",
    },
    {
      id: "uncertain",
      body: "Can we meet Tuesday afternoon for 30 minutes?",
      context: undefined,
      expected: "needs clarification",
    },
  ]) {
    const store = new Store(":memory:");
    try {
      const provider = new FixtureProvider(store);
      const original = fixtureThread();
      const thread = { ...original, body: c.body, fingerprint: hash(c.body) };
      provider.list = async () => [thread];
      provider.thread = async () => thread;
      const knowledge = new Knowledge(store, model);
      await knowledge.import({
        title: "model-preferences.md",
        text: source,
        approved: true,
      });
      const from = decisions.length;
      const [task] = await new Agent(store, provider, model, knowledge).process(
        c.context,
      );
      const result = {
        id: c.id,
        expected: c.expected,
        status: task.status,
        pass:
          task.status === c.expected &&
          (c.id !== "schedule" || !!task.plan?.citations.length),
        error: task.error,
        question: task.question,
        tools: task.trace,
        citationIds: task.plan?.citations.map((x) => x.id) || [],
        writeCount: store.actions(task.id).length,
        decisions: decisions.slice(from),
      };
      record.cases.push(result);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      store.close();
    }
  }
  record.status =
    record.retrieval.pass &&
    record.cases.every((c: any) => c.pass && c.writeCount === 0)
      ? "PASS"
      : "FAIL";
} catch (e) {
  record.error = e instanceof Error ? e.message : "Model integration failed";
}
writeFileSync(
  "evidence/model-integration.json",
  JSON.stringify(record, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      status: record.status,
      retrieval: record.retrieval,
      models: record.models,
    },
    null,
    2,
  ),
);
if (record.status !== "PASS") process.exitCode = 1;
