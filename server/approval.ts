import { hash, type Action, type Plan, type Task } from "./domain.ts";
import type { Store } from "./store.ts";
import type { Provider } from "./provider.ts";
export class Approval {
  constructor(
    private store: Store,
    private provider: Provider,
  ) {}
  async execute(id: string, kind: Action, digest: string, approved: boolean) {
    const t = this.store.get(id);
    if (!approved) throw Error("Approval denied.");
    if (!t?.plan || t.hash !== digest || hash(t.plan) !== digest)
      throw Error("Approval is stale. Review the current plan.");
    const p = t.plan;
    if (
      p.account !== this.provider.account ||
      p.mode !== this.provider.mode ||
      !this.provider.allowed.includes(p.recipient)
    )
      throw Error("Account or recipient changed.");
    for (const c of p.citations) {
      const row = this.store.db
        .prepare("SELECT title,text FROM documents WHERE id=?")
        .get(c.id);
      if (!row || row.title !== c.title || row.text !== c.snippet)
        throw Error(
          "Preferences changed. Process again and review a fresh plan.",
        );
    }
    const existing = this.store.action(id, kind);
    if (existing) {
      if (existing.hash !== digest)
        throw Error("An action already exists for a different plan.");
      if (existing.status === "verified") return JSON.parse(existing.receipt!);
      return this.reconcile(t, kind, p, existing.key);
    }
    if (t.status === "denied") throw Error("Plan was denied.");
    if (Date.now() - Date.parse(p.createdAt) > 15 * 60000)
      throw Error("Plan expired; process again before approving.");
    const current = await this.provider.thread(p.threadId);
    // Fingerprint excludes drafts and InboxOps replies, but includes other thread changes.
    if (
      current.messageId !== p.messageId ||
      current.from !== p.recipient ||
      current.subject !== t.thread.subject ||
      current.body !== t.thread.body ||
      current.fingerprint !== p.fingerprint
    )
      throw Error("Thread changed. Process again and review.");
    if (kind === "event" || kind === "send") {
      const event = this.store.action(id, "event");
      let ignoredEvent: string | undefined;
      if (event?.status === "verified") {
        const verified = await this.provider.reconcile("event", p, event.key);
        if (!verified)
          throw Error("Previously created calendar hold cannot be verified.");
        ignoredEvent = verified.id;
      }
      const available = await this.provider.freebusy(p.event, ignoredEvent);
      if (!available.length) throw Error("Time is no longer available.");
    }
    const draft = this.store.action(id, "draft");
    if (
      kind === "send" &&
      (!draft || draft.status !== "verified" || draft.hash !== digest)
    )
      throw Error("Create the exact approved draft before sending.");
    const key = hash([p.account, p.threadId, p.messageId, kind]);
    // Claim synchronously before awaiting any write. Primary key is the concurrency boundary.
    this.store.claim(key, id, kind, digest);
    try {
      const receipt = await this.provider.write(
        kind,
        p,
        key,
        draft?.receipt ? JSON.parse(draft.receipt).id : undefined,
      );
      if (!receipt.verified) throw Error("Write not verified.");
      this.store.complete(key, receipt);
      this.store.audit(id, `${kind}: verified`, receipt.id);
      this.updateStatus(t);
      return receipt;
    } catch {
      this.store.unknown(key);
      this.store.audit(id, `${kind}: outcome unknown`);
      this.updateStatus(t);
      throw Error(
        `${kind} outcome is uncertain. Use Reconcile; it only reads and never repeats the write.`,
      );
    }
  }
  private async reconcile(t: Task, kind: Action, p: Plan, key: string) {
    const receipt = await this.provider.reconcile(kind, p, key);
    if (!receipt)
      throw Error(
        "No matching external receipt found. Write remains locked to prevent duplicates; inspect the test account manually.",
      );
    this.store.complete(key, receipt);
    this.store.audit(t.id, `${kind}: reconciled`, receipt.id);
    this.updateStatus(t);
    return receipt;
  }
  private updateStatus(t: Task) {
    const actions = this.store.actions(t.id);
    t.status = actions.some((a) => a.status === "unknown")
      ? "partial / needs reconciliation"
      : actions.length === 3 && actions.every((a) => a.status === "verified")
        ? "verified"
        : "partially completed";
    this.store.save(t);
  }
}
