import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.ts";
import { FixtureProvider } from "../server/provider.ts";
import { FixtureModel } from "../server/model.ts";
import { Knowledge } from "../server/knowledge.ts";
import { Agent } from "../server/agent.ts";
import { Approval } from "../server/approval.ts";
test("SQLite close/reopen preserves duplicate-send protection", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inboxops-test-"));
  const path = join(directory, "state.sqlite");
  let store = new Store(path);
  try {
    let provider = new FixtureProvider(store);
    const knowledge = new Knowledge(store, new FixtureModel());
    await knowledge.import({
      title: "Hours.md",
      text: "Working hours for a meeting",
      approved: true,
    });
    const [task] = await new Agent(
      store,
      provider,
      new FixtureModel(),
      knowledge,
    ).process({
      start: new Date(Date.now() + 86400000).toISOString(),
      timeZone: "UTC",
      duration: 30,
    });
    const approval = new Approval(store, provider);
    await approval.execute(task.id, "draft", task.hash!, true);
    const first = await approval.execute(task.id, "send", task.hash!, true);
    store.close();
    store = new Store(path);
    provider = new FixtureProvider(store);
    const again = await new Approval(store, provider).execute(
      task.id,
      "send",
      task.hash!,
      true,
    );
    assert.equal(again.id, first.id);
    assert.equal(
      store.db
        .prepare("SELECT COUNT(*) AS n FROM external WHERE kind='send'")
        .get()!.n,
      1,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
