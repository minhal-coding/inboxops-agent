import {
  hash,
  replySubject,
  type Thread,
  type Slot,
  type Plan,
  type Receipt,
  type Action,
} from "./domain.ts";
import type { Store } from "./store.ts";
import type { OAuth } from "./oauth.ts";
export interface Provider {
  mode: "fixture" | "live";
  account: string;
  allowed: string[];
  list(): Promise<Thread[]>;
  thread(id: string): Promise<Thread>;
  freebusy(slot: Slot, ignoreEventId?: string): Promise<Slot[]>;
  write(kind: Action, p: Plan, key: string, draft?: string): Promise<Receipt>;
  reconcile(kind: Action, p: Plan, key: string): Promise<Receipt | undefined>;
}
export function fixtureThread(): Thread {
  const t = {
    id: "fixture-thread-001",
    messageId: "fixture-message-001",
    account: "owner@example.test",
    from: "alex@example.test",
    to: "owner@example.test",
    subject: "A quick planning session?",
    body: "Can we meet Tuesday afternoon for 30 minutes?\n\nAlex\n(Fictional test message)",
    date: new Date().toISOString(),
    rfcMessageId: "<fixture-incoming@example.test>",
    references: "",
  };
  return { ...t, fingerprint: hash([t.id, t.messageId, t.body]) };
}
export class FixtureProvider implements Provider {
  mode = "fixture" as const;
  account = "owner@example.test";
  allowed = ["alex@example.test"];
  failNext?: Action;
  constructor(private store: Store) {}
  async list() {
    return [fixtureThread()];
  }
  async thread(id: string) {
    if (id !== "fixture-thread-001") throw Error("Unknown fixture thread.");
    return fixtureThread();
  }
  async freebusy(slot: Slot, _ignoreEventId?: string) {
    return [slot];
  }
  async write(kind: Action, p: Plan, key: string, draft?: string) {
    if (this.failNext === kind) {
      this.failNext = undefined;
      throw Error("Fixture injected failure. Reconcile before retry.");
    }
    if (kind === "send" && !draft) throw Error("Draft required.");
    const receipt = {
      id: `fixture-${kind}-${key.slice(0, 12)}`,
      verified: true,
      kind,
      mode: this.mode,
    };
    this.store.db
      .prepare("INSERT OR IGNORE INTO external VALUES(?,?,?)")
      .run(key, kind, JSON.stringify({ p, receipt }));
    return receipt;
  }
  async reconcile(kind: Action, p: Plan, key: string) {
    const r = this.store.db
      .prepare("SELECT data FROM external WHERE id=?")
      .get(key) as { data: string } | undefined;
    if (!r) return;
    const d = JSON.parse(r.data);
    if (hash(d.p) !== hash(p) || d.receipt.kind !== kind)
      throw Error("Fixture receipt mismatch.");
    return d.receipt as Receipt;
  }
}
const gmail = "https://gmail.googleapis.com/gmail/v1/users/me";
function header(message: any, name: string) {
  return (
    (message.payload?.headers || []).find(
      (h: any) => h.name.toLowerCase() === name.toLowerCase(),
    )?.value || ""
  );
}
function address(value: string) {
  const found = value.match(/^(?:[^<>]*<)?([^<>\s,]+@[^<>\s,]+)>?$/);
  if (!found) throw Error("Ambiguous email address.");
  return found[1].toLowerCase();
}
function plain(payload: any): string {
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  return (payload.parts || [])
    .filter((p: any) => !p.filename)
    .map(plain)
    .join("\n");
}
export class GoogleProvider implements Provider {
  mode = "live" as const;
  constructor(
    private oauth: OAuth,
    public account: string,
    public allowed: string[],
    private label: string,
    private calendar: string,
  ) {
    if (!label || !calendar || !account || !allowed.length)
      throw Error(
        "Configure test account, recipient allowlist, label ID and owned calendar ID.",
      );
  }
  async list() {
    const data = await this.oauth.request(
      `${gmail}/messages?labelIds=${encodeURIComponent(this.label)}&q=${encodeURIComponent("newer_than:7d -in:sent")}&maxResults=10`,
    );
    const ids = [
      ...new Set<string>((data.messages || []).map((m: any) => m.threadId)),
    ];
    const out = [];
    for (const id of ids) out.push(await this.thread(id));
    return out;
  }
  async thread(id: string): Promise<Thread> {
    const t = await this.oauth.request(
      `${gmail}/threads/${encodeURIComponent(id)}?format=full`,
    );
    const messages = t.messages || [];
    const incoming = messages.filter(
      (m: any) =>
        m.labelIds?.includes(this.label) && !m.labelIds?.includes("SENT"),
    );
    const m = incoming.at(-1);
    if (!m || Number(m.internalDate) < Date.now() - 7 * 86400000)
      throw Error("Thread is outside the recent test label.");
    const from = address(header(m, "From")),
      to = address(header(m, "To"));
    if (
      to !== this.account ||
      !this.allowed.includes(from) ||
      header(m, "Cc") ||
      header(m, "Bcc") ||
      (header(m, "Reply-To") && address(header(m, "Reply-To")) !== from)
    )
      throw Error(
        "Only single-recipient allowlisted test threads are supported.",
      );
    const body = plain(m.payload);
    if (!body.trim())
      throw Error(
        "Plain-text email required; HTML-only content and attachments are not processed.",
      );
    const subject = header(m, "Subject");
    const rfcMessageId = header(m, "Message-ID");
    const references = header(m, "References");
    if (
      [subject, rfcMessageId, references].some((s) => /[\r\n]/.test(s)) ||
      !/^<[^<>\s]+>$/.test(rfcMessageId)
    )
      throw Error("Unsafe thread headers.");
    return {
      id,
      messageId: m.id,
      account: this.account,
      from,
      to,
      subject,
      body: body.slice(0, 10000),
      date: new Date(Number(m.internalDate)).toISOString(),
      rfcMessageId,
      references,
      fingerprint: hash(
        messages
          .filter(
            (x: any) =>
              !x.labelIds?.includes("DRAFT") &&
              !/^<inboxops-[a-f0-9]{64}@local\.invalid>$/.test(
                header(x, "Message-ID"),
              ),
          )
          .map((x: any) => [x.id, x.historyId]),
      ),
    };
  }
  async freebusy(slot: Slot, ignoreEventId?: string) {
    const result = await this.oauth.request(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      "POST",
      {
        timeMin: slot.start,
        timeMax: slot.end,
        timeZone: slot.timeZone,
        items: [{ id: this.calendar }],
      },
    );
    const cal = result.calendars?.[this.calendar];
    if (!cal || cal.errors?.length || !Array.isArray(cal.busy))
      throw Error("Calendar availability could not be verified.");
    if (!cal.busy.length) return [slot];
    if (!ignoreEventId) return [];
    // The already-created hold is busy. Exclude only that exact verified event;
    // never treat an unrelated concurrent booking as available.
    const query = new URLSearchParams({
      timeMin: slot.start,
      timeMax: slot.end,
      singleEvents: "true",
      maxResults: "100",
    });
    const events = await this.oauth.request(this.eventUrl() + "?" + query);
    if (events.nextPageToken || !Array.isArray(events.items))
      throw Error("Cannot safely reconcile overlapping calendar events.");
    return events.items.some(
      (e: any) =>
        e.id !== ignoreEventId &&
        e.status !== "cancelled" &&
        e.transparency !== "transparent",
    )
      ? []
      : [slot];
  }
  private eventUrl(id = "") {
    return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendar)}/events${id ? "/" + encodeURIComponent(id) : ""}`;
  }
  private raw(p: Plan, t: Thread, key: string) {
    const lines = [
      `From: ${p.account}`,
      `To: ${p.recipient}`,
      `Subject: =?UTF-8?B?${Buffer.from(replySubject(t.subject)).toString("base64")}?=`,
      `Message-ID: <inboxops-${key}@local.invalid>`,
      `In-Reply-To: ${t.rfcMessageId}`,
      `References: ${t.references} ${t.rfcMessageId}`.trim(),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(p.body).toString("base64"),
    ];
    return Buffer.from(lines.join("\r\n")).toString("base64url");
  }
  async write(
    kind: Action,
    p: Plan,
    key: string,
    draft?: string,
  ): Promise<Receipt> {
    let id: string;
    if (kind === "event") {
      const event = await this.oauth.request(
        this.eventUrl() + "?sendUpdates=all",
        "POST",
        {
          id: key,
          summary: p.event.summary,
          start: { dateTime: p.event.start, timeZone: p.event.timeZone },
          end: { dateTime: p.event.end, timeZone: p.event.timeZone },
          attendees: p.event.attendees.map((email) => ({ email })),
          guestsCanInviteOthers: false,
          guestsCanModify: false,
          extendedProperties: { private: { inboxops: key } },
        },
      );
      id = event.id;
    } else if (kind === "draft") {
      const t = await this.thread(p.threadId);
      const d = await this.oauth.request(`${gmail}/drafts`, "POST", {
        message: { threadId: p.threadId, raw: this.raw(p, t, key) },
      });
      id = d.id;
    } else {
      if (!draft) throw Error("Create and verify the approved draft first.");
      await this.verifyDraft(draft, p);
      const m = await this.oauth.request(`${gmail}/drafts/send`, "POST", {
        id: draft,
      });
      id = m.id;
    }
    const receipt = await this.verify(kind, p, id);
    return receipt;
  }
  private async verifyDraft(id: string, p: Plan) {
    const d = await this.oauth.request(
      `${gmail}/drafts/${encodeURIComponent(id)}?format=full`,
    );
    this.verifyMessage(d.message, p);
  }
  private verifyMessage(m: any, p: Plan) {
    if (
      m.payload?.mimeType !== "text/plain" ||
      m.payload?.parts?.length ||
      m.payload?.filename ||
      m.threadId !== p.threadId ||
      address(header(m, "To")) !== p.recipient ||
      address(header(m, "From")) !== p.account ||
      header(m, "Cc") ||
      header(m, "Bcc") ||
      header(m, "Subject") !== p.subject ||
      plain(m.payload).replace(/\r\n/g, "\n").trimEnd() !== p.body.trimEnd()
    )
      throw Error("External message differs from exact approved content.");
  }
  private async verify(kind: Action, p: Plan, id: string): Promise<Receipt> {
    if (kind === "draft") await this.verifyDraft(id, p);
    else if (kind === "send") {
      const m = await this.oauth.request(
        `${gmail}/messages/${encodeURIComponent(id)}?format=full`,
      );
      this.verifyMessage(m, p);
      if (!m.labelIds?.includes("SENT"))
        throw Error("Sent status not verified.");
    } else {
      const e = await this.oauth.request(this.eventUrl(id));
      if (
        e.status === "cancelled" ||
        e.summary !== p.event.summary ||
        Date.parse(e.start?.dateTime) !== Date.parse(p.event.start) ||
        Date.parse(e.end?.dateTime) !== Date.parse(p.event.end) ||
        JSON.stringify((e.attendees || []).map((a: any) => a.email).sort()) !==
          JSON.stringify([...p.event.attendees].sort())
      )
        throw Error("Event verification mismatch.");
    }
    return { id, kind, verified: true, mode: "live" };
  }
  async reconcile(
    kind: Action,
    p: Plan,
    key: string,
  ): Promise<Receipt | undefined> {
    if (kind === "event") {
      try {
        return await this.verify(kind, p, key);
      } catch (e: any) {
        if (e.status === 404) return;
        throw e;
      }
    }
    // Gmail has no idempotency token. Ambiguous writes are read/reconciled, NEVER resent.
    const draftKey = hash([p.account, p.threadId, p.messageId, "draft"]);
    const messageId = `<inboxops-${draftKey}@local.invalid>`;
    if (kind === "send") {
      const list = await this.oauth.request(
        `${gmail}/messages?q=${encodeURIComponent(`in:sent rfc822msgid:${messageId}`)}`,
      );
      if (list.messages?.[0])
        return this.verify("send", p, list.messages[0].id);
      return;
    }
    const list = await this.oauth.request(`${gmail}/drafts?maxResults=100`);
    for (const d of list.drafts || []) {
      const value = await this.oauth.request(
        `${gmail}/drafts/${encodeURIComponent(d.id)}?format=full`,
      );
      if (header(value.message, "Message-ID") === messageId)
        return this.verify("draft", p, d.id);
    }
    return;
  }
}
