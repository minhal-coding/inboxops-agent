import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleProvider, fixtureThread } from "../server/provider.ts";
import { OAuth, scopes } from "../server/oauth.ts";
import { hash, replyBody, replySubject, type Plan } from "../server/domain.ts";
const thread = fixtureThread();
const p: Plan = {
  account: thread.account,
  threadId: thread.id,
  messageId: thread.messageId,
  fingerprint: thread.fingerprint,
  recipient: thread.from,
  subject: replySubject(thread.subject),
  body: "",
  event: {
    summary: "Proposed planning session",
    start: new Date(Date.now() + 7 * 86400000).toISOString(),
    end: new Date(Date.now() + 7 * 86400000 + 1800000).toISOString(),
    timeZone: "UTC",
    attendees: [],
  },
  citations: [],
  model: "contract fixture",
  mode: "live",
  createdAt: new Date().toISOString(),
};
p.body = replyBody(p.event);
function incoming() {
  return {
    id: thread.messageId,
    threadId: thread.id,
    historyId: "1",
    internalDate: String(Date.now()),
    labelIds: ["Label_test"],
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: thread.from },
        { name: "To", value: thread.account },
        { name: "Subject", value: thread.subject },
        { name: "Message-ID", value: thread.rfcMessageId },
      ],
      body: { data: Buffer.from(thread.body).toString("base64url") },
    },
  };
}
function outgoing() {
  return {
    id: "sent-1",
    threadId: p.threadId,
    labelIds: ["SENT"],
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: p.account },
        { name: "To", value: p.recipient },
        { name: "Subject", value: p.subject },
      ],
      body: { data: Buffer.from(p.body).toString("base64url") },
    },
  };
}
function provider(
  request: (url: string, method?: string, data?: any) => Promise<any>,
) {
  return new GoogleProvider(
    { request } as unknown as OAuth,
    p.account,
    [p.recipient],
    "Label_test",
    "test-calendar",
  );
}

test("Google resolves only the exact dedicated user label and caches its ID", async () => {
  const calls: string[] = [];
  const pr = new GoogleProvider(
    {
      request: async (url: string) => {
        calls.push(url);
        if (url.endsWith("/labels"))
          return {
            labels: [{ id: "Label_test", name: "InboxOps-Test", type: "user" }],
          };
        assert.ok(url.includes("labelIds=Label_test"));
        return { messages: [] };
      },
    } as unknown as OAuth,
    p.account,
    [p.recipient],
    "name:InboxOps-Test",
    "test-calendar",
  );
  await pr.list();
  await pr.list();
  assert.equal(calls.filter((url) => url.endsWith("/labels")).length, 1);
});

test("Google missing, system, and ambiguous labels never trigger mailbox reads", async () => {
  for (const labels of [
    [],
    [{ id: "INBOX", name: "InboxOps-Test", type: "system" }],
    [
      { id: "a", name: "InboxOps-Test", type: "user" },
      { id: "b", name: "InboxOps-Test", type: "user" },
    ],
  ]) {
    let calls = 0;
    const pr = new GoogleProvider(
      {
        request: async (url: string) => {
          calls++;
          assert.ok(url.endsWith("/labels"));
          return { labels };
        },
      } as unknown as OAuth,
      p.account,
      [p.recipient],
      "name:InboxOps-Test",
      "test-calendar",
    );
    await assert.rejects(pr.list(), /No mailbox-wide fallback/);
    assert.equal(calls, 1);
  }
});
test("Google draft uses exact RFC reply headers and verifies readback", async () => {
  let raw = "";
  const pr = provider(async (url, method, data) => {
    if (url.includes("/threads/")) return { messages: [incoming()] };
    if (url.endsWith("/drafts") && method === "POST") {
      raw = Buffer.from(data.message.raw, "base64url").toString();
      assert.equal(data.message.threadId, p.threadId);
      return { id: "draft-1" };
    }
    if (url.includes("/drafts/draft-1")) return { message: outgoing() };
    throw Error("Unexpected request");
  });
  const key = hash([p.account, p.threadId, p.messageId, "draft"]);
  const r = await pr.write("draft", p, key);
  assert.equal(r.id, "draft-1");
  assert.match(raw, /In-Reply-To: <fixture-incoming@example.test>/);
  assert.ok(raw.includes(`Message-ID: <inboxops-${key}@local.invalid>`));
  assert.ok(raw.includes(`To: ${p.recipient}`));
});
test("Google changed draft and added attachment block send before POST", async () => {
  for (const mutate of [
    (m: any) =>
      m.payload.headers.push({ name: "Bcc", value: "evil@example.test" }),
    (m: any) => (m.payload.mimeType = "multipart/mixed"),
    (m: any) =>
      (m.payload.body.data = Buffer.from("Changed body").toString("base64url")),
  ]) {
    let writes = 0;
    const m = outgoing();
    mutate(m);
    const pr = provider(async (_url, method) => {
      if (method === "POST") writes++;
      return { message: m };
    });
    await assert.rejects(
      pr.write("send", p, "key", "draft-1"),
      /approved content/,
    );
    assert.equal(writes, 0);
  }
});
test("Google event uses deterministic ID, no guests, and follow-up GET", async () => {
  let event: any;
  const pr = provider(async (url, method, data) => {
    assert.ok(url.includes("test-calendar"));
    if (method === "POST") {
      event = data;
      return { id: data.id };
    }
    return event;
  });
  const key = hash("event");
  const r = await pr.write("event", p, key);
  assert.equal(r.id, key);
  assert.deepEqual(event.attendees, []);
  assert.equal(event.guestsCanInviteOthers, false);
});
test("Google freebusy fails closed and excludes only the verified local hold", async () => {
  let other = true;
  const pr = provider(async (url) =>
    url.endsWith("/freeBusy")
      ? {
          calendars: {
            "test-calendar": {
              busy: [{ start: p.event.start, end: p.event.end }],
            },
          },
        }
      : { items: [{ id: "ours" }, ...(other ? [{ id: "other" }] : [])] },
  );
  assert.deepEqual(await pr.freebusy(p.event), []);
  assert.deepEqual(await pr.freebusy(p.event, "ours"), []);
  other = false;
  assert.deepEqual(await pr.freebusy(p.event, "ours"), [p.event]);
});
test("Google sender, CC, Reply-To, and age boundaries", async () => {
  for (const mutate of [
    (m: any) =>
      m.payload.headers.push({ name: "Cc", value: "evil@example.test" }),
    (m: any) =>
      m.payload.headers.push({ name: "Reply-To", value: "evil@example.test" }),
    (m: any) => (m.internalDate = "0"),
  ]) {
    const m = incoming();
    mutate(m);
    await assert.rejects(
      provider(async () => ({ messages: [m] })).thread(thread.id),
    );
  }
});
test("OAuth wrong account, missing scopes and replay clear credentials", async () => {
  for (const missing of [true, false]) {
    const oauth = new OAuth(p.account, "http://127.0.0.1:4317", "");
    let credentials: any = {};
    oauth.client = {
      generateCodeVerifierAsync: async () => ({
        codeVerifier: "verifier",
        codeChallenge: "challenge",
      }),
      generateAuthUrl: ({ state }: any) => state,
      getToken: async () => ({
        tokens: {
          access_token: "fictional-test-token",
          scope: missing ? "" : scopes.join(" "),
          expiry_date: Date.now() + 60000,
        },
      }),
      setCredentials: (value: any) => (credentials = value),
      request: async () => ({ data: { emailAddress: "wrong@example.test" } }),
    } as any;
    const state = await oauth.start("session");
    await assert.rejects(oauth.callback(state, "code", "session"), /failed/);
    assert.deepEqual(credentials, {});
    assert.equal(oauth.account, undefined);
    await assert.rejects(oauth.callback(state, "code", "session"), /state/);
  }
});
test("OAuth successful test account connection keeps token in memory and disconnect erases it", async () => {
  const oauth = new OAuth(p.account, "http://127.0.0.1:4317", "");
  const client: any = {
    credentials: {},
    generateCodeVerifierAsync: async () => ({
      codeVerifier: "v",
      codeChallenge: "c",
    }),
    generateAuthUrl: ({ state }: any) => state,
    getToken: async () => ({
      tokens: {
        access_token: "fictional-test-token",
        refresh_token: "must-not-persist",
        scope: scopes.join(" "),
        expiry_date: Date.now() + 60000,
      },
    }),
    setCredentials: (value: any) => (client.credentials = value),
    request: async () => ({ data: { emailAddress: p.account } }),
    revokeToken: async () => {},
  };
  oauth.client = client;
  const state = await oauth.start("s");
  await oauth.callback(state, "c", "s");
  assert.equal(oauth.account, p.account);
  assert.equal(client.credentials.refresh_token, undefined);
  await oauth.disconnect();
  assert.deepEqual(client.credentials, {});
  assert.equal(oauth.account, undefined);
});
