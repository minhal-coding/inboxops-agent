import { writeFileSync, existsSync } from "node:fs";
import { Store } from "../server/store.ts";
import { hash } from "../server/domain.ts";
const path = process.env.INBOXOPS_DB || ".data/live.sqlite";
if (!existsSync(path))
  throw Error(
    "No live database exists. Connect the test account and run acceptance first.",
  );
const store = new Store(path);
const evidence = {
  at: new Date().toISOString(),
  status:
    "UNVERIFIED — manually validate against model smoke check and Google account",
  tasks: store
    .tasks()
    .filter((t) => t.plan?.mode === "live")
    .map((t) => ({
      taskHash: hash(t.id),
      status: t.status,
      model: t.plan!.model,
      selectedTools: t.trace,
      citationIds: t.plan!.citations.map((c) => c.id),
      approvalHash: t.hash,
      actions: store.actions(t.id),
    })),
};
writeFileSync(
  "evidence/live-unverified.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
store.close();
console.log(
  "Wrote sanitized evidence/live-unverified.json. Review before publishing; this does not certify live acceptance.",
);
