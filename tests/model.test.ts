import { test } from "node:test";
import assert from "node:assert/strict";
import { Ollama, unwrapModelContent } from "../server/model.ts";
import { Knowledge } from "../server/knowledge.ts";
import { Store } from "../server/store.ts";

test("local model framing accepts closed thinking and whole JSON fences", () => {
  assert.equal(
    unwrapModelContent(
      'Okay, check the instructions.\n</think>\n\n{"ok":true}',
    ),
    '{"ok":true}',
  );
  assert.equal(unwrapModelContent('```json\n{"ok":true}\n```'), '{"ok":true}');
  assert.equal(unwrapModelContent('  {"ok":true}  '), '{"ok":true}');
});

test("retrieval uses document/query prompts and cannot reuse pre-migration vectors", async () => {
  const inputs: unknown[] = [];
  const model = new Ollama("test-model", "embeddinggemma");
  model.request = async (_path, body) => {
    inputs.push((body as { input: string }).input);
    return { embeddings: [[1, 0]] };
  };
  const store = new Store(":memory:");
  try {
    const knowledge = new Knowledge(store, model);
    await knowledge.import({
      title: "prefs.md",
      text: "Thirty minute meetings.",
      approved: true,
    });
    assert.equal((await knowledge.search("Meeting duration?")).length, 1);
    assert.deepEqual(inputs, [
      "title: prefs.md | text: Thirty minute meetings.",
      "task: search result | query: Meeting duration?",
    ]);
    store.db.prepare("UPDATE documents SET model=?").run("embeddinggemma");
    assert.deepEqual(await knowledge.search("Meeting duration?"), []);
  } finally {
    store.close();
  }
});

test("unframed prose, unfinished thinking and trailing text still fail JSON parsing", () => {
  for (const text of [
    'Here is the result: {"ok":true}',
    '<think>unfinished {"ok":true}',
    '```json\n{"ok":true}\n``` trailing text',
    '{"ok":true}\nextra',
  ]) {
    assert.throws(() => JSON.parse(unwrapModelContent(text)));
  }
});
