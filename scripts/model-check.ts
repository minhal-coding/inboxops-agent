import { Ollama } from "../server/model.ts";
import { writeFileSync, mkdirSync } from "node:fs";
function report(value: unknown) {
  mkdirSync("evidence", { recursive: true });
  const text = JSON.stringify(value, null, 2);
  writeFileSync("evidence/model-check.json", text + "\n");
  console.log(text);
}
const model = new Ollama();
try {
  const v = await fetch("http://127.0.0.1:11434/api/version", {
    signal: AbortSignal.timeout(3000),
  }).then((r) => r.json());
  const structured = await model.decide(
    [{ role: "user", content: 'Return JSON only: {"ok":true}' }],
    [],
  );
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
  if (decision.tool_calls?.[0]?.function.name !== "calendar.freebusy")
    throw Error("Tool selection failed.");
  const embedding = await model.embed("meeting duration");
  report({
    status: "PASS",
    at: new Date().toISOString(),
    model: model.name,
    ollamaVersion: v.version,
    structured: true,
    tool: "calendar.freebusy",
    embeddingDimensions: embedding.length,
  });
} catch (e) {
  report({
    status: "BLOCKED",
    at: new Date().toISOString(),
    model: model.name,
    reason: e instanceof Error ? e.message : "Model unavailable",
  });
  process.exitCode = 1;
}
