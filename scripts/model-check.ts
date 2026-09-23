import { Ollama } from "../server/model.ts";
import { writeFileSync, mkdirSync } from "node:fs";
function report(value: unknown) {
  mkdirSync("evidence", { recursive: true });
  const text = JSON.stringify(value, null, 2);
  writeFileSync("evidence/model-check.json", text + "\n");
  console.log(text);
}
const model = new Ollama();
let reachable = false;
const observed: Record<string, unknown> = {};
try {
  const v = await fetch("http://127.0.0.1:11434/api/version", {
    signal: AbortSignal.timeout(3000),
  }).then((r) => r.json());
  reachable = true;
  observed.ollamaVersion = v.version;
  const structured = await model.decide(
    [{ role: "user", content: 'Return JSON only: {"ok":true}' }],
    [],
  );
  observed.structuredResponse = structured;
  if (JSON.parse(structured.content || "").ok !== true)
    throw Error("Structured prompt failed.");
  const decision = await model.decide(
    [{ role: "user", content: "Use calendar.freebusy to check availability." }],
    [
      {
        name: "calendar.freebusy",
        description: "Check availability",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  );
  observed.toolSelection = decision;
  if (decision.tool_calls?.[0]?.function.name !== "calendar.freebusy")
    throw Error("Tool selection failed.");
  const embedding = await model.embed("meeting duration");
  const tags = await fetch("http://127.0.0.1:11434/api/tags", {
    signal: AbortSignal.timeout(3000),
  }).then((r) => r.json());
  report({
    status: "PASS",
    command: "npm run model:check",
    at: new Date().toISOString(),
    model: model.name,
    ollamaVersion: v.version,
    structured: true,
    tool: "calendar.freebusy",
    embeddingDimensions: embedding.length,
    observedStructuredResponse: structured,
    observedToolSelection: decision,
    embeddingFinite: embedding.every(Number.isFinite),
    embeddingNorm: Math.hypot(...embedding),
    models: tags.models
      .filter((m: any) =>
        [model.name, model.embedding, model.embedding + ":latest"].includes(
          m.name,
        ),
      )
      .map((m: any) => ({ name: m.name, digest: m.digest, size: m.size })),
  });
} catch (e) {
  report({
    status: reachable ? "FAIL" : "BLOCKED",
    command: "npm run model:check",
    at: new Date().toISOString(),
    model: model.name,
    reason: e instanceof Error ? e.message : "Model unavailable",
    observed,
  });
  process.exitCode = 1;
}
