import { readFileSync, writeFileSync } from "node:fs";
import { Ollama } from "../server/model.ts";
import { Knowledge, RETRIEVAL_MIN_SCORE } from "../server/knowledge.ts";
import { Store } from "../server/store.ts";
const model = new Ollama();
const store = new Store(":memory:");
const source = readFileSync("fixtures/model-preferences.md", "utf8").trim();
const record: any = {
  at: new Date().toISOString(),
  command: "npm run model:retrieval",
  mode: "REAL LOCAL EMBEDDINGS; FICTIONAL APPROVED DOCUMENT",
  model: model.embedding,
  space: model.embeddingSpace,
  threshold: RETRIEVAL_MIN_SCORE,
  status: "FAIL",
  queries: [],
};
try {
  const knowledge = new Knowledge(store, model);
  const [id] = await knowledge.import({
    title: "model-preferences.md",
    text: source,
    approved: true,
  });
  const row = store.db
    .prepare("SELECT vector FROM documents WHERE id=?")
    .get(id)!;
  const vector = JSON.parse(row.vector as string) as number[];
  const bareVector = (
    await model.request("embed", {
      model: model.embedding,
      input: source,
      truncate: false,
    })
  ).embeddings[0] as number[];
  const cosine = (a: number[], b: number[]) =>
    a.reduce((s, x, i) => s + x * b[i], 0) /
    (Math.hypot(...a) * Math.hypot(...b));
  for (const [query, relevant] of [
    [
      "How long should an appointment last, and when am I available for one?",
      true,
    ],
    ["What are my working hours for scheduling meetings?", true],
    ["What is my preferred meeting duration?", true],
    ["What should happen if the date or time zone is ambiguous?", true],
    ["How do black holes emit Hawking radiation?", false],
    ["How do I cook spaghetti carbonara?", false],
    ["Which hotel is closest to the airport?", false],
    ["What is the current stock price of Apple?", false],
  ] as const) {
    const q = await model.embed(query);
    const bare = (
      await model.request("embed", {
        model: model.embedding,
        input: query,
        truncate: false,
      })
    ).embeddings[0];
    const result = await knowledge.search(query);
    record.queries.push({
      query,
      relevant,
      score: cosine(vector, q),
      beforeTaskPrefixesScore: cosine(bareVector, bare),
      chunkIds: result.map((c) => c.id),
      pass: relevant
        ? result.some((c) => c.id === id && c.snippet === source)
        : result.length === 0,
    });
  }
  record.status = record.queries.every((q: any) => q.pass) ? "PASS" : "FAIL";
} catch (e) {
  record.error = e instanceof Error ? e.message : "Retrieval check failed";
} finally {
  store.close();
}
writeFileSync(
  "evidence/retrieval-check.json",
  JSON.stringify(record, null, 2) + "\n",
);
console.log(JSON.stringify(record, null, 2));
if (record.status !== "PASS") process.exitCode = 1;
