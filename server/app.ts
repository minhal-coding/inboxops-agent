import express from "express";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { Store } from "./store.ts";
import { FixtureModel, Ollama } from "./model.ts";
import { FixtureProvider, GoogleProvider } from "./provider.ts";
import { OAuth } from "./oauth.ts";
import { Knowledge } from "./knowledge.ts";
import { Approval } from "./approval.ts";
import { Agent } from "./agent.ts";
import { createToolServer, connectTools, callTool } from "./mcp.ts";
import { contextSchema } from "./domain.ts";
export async function makeApp(
  options: { mode?: string; db?: string; port?: number } = {},
) {
  const mode = options.mode || process.env.INBOXOPS_MODE || "live";
  if (!["live", "fixture"].includes(mode)) throw Error("Invalid mode.");
  const port = options.port || Number(process.env.PORT || 4317);
  const origin = `http://127.0.0.1:${port}`;
  const store = new Store(
    options.db || process.env.INBOXOPS_DB || `.data/${mode}.sqlite`,
  );
  const model = mode === "fixture" ? new FixtureModel() : new Ollama();
  const account = process.env.TEST_ACCOUNT?.toLowerCase() || "";
  const oauth = new OAuth(account, origin);
  // Live app can onboard before local configuration exists; adapter constructed only when configured.
  const configured = !!(
    account &&
    process.env.TEST_RECIPIENTS &&
    process.env.TEST_CALENDAR_ID
  );
  const provider =
    mode === "fixture"
      ? new FixtureProvider(store)
      : configured
        ? new GoogleProvider(
            oauth,
            account,
            process.env
              .TEST_RECIPIENTS!.split(",")
              .map((x) => x.trim().toLowerCase()),
            process.env.TEST_LABEL_ID ||
              `name:${process.env.TEST_LABEL_NAME || "InboxOps-Test"}`,
            process.env.TEST_CALENDAR_ID!,
          )
        : undefined;
  const knowledge = new Knowledge(store, model);
  if (mode === "fixture" && !knowledge.list().length)
    await knowledge.import({
      title: "Meeting preferences.md",
      text: "My normal working hours are Monday to Friday, 13:00–17:00 America/New_York. My preferred meeting duration is 30 minutes. Confirm ambiguous dates with me.",
      approved: true,
    });
  const app = express();
  app.disable("x-powered-by");
  const sessions = new Map<string, { csrf: string; expires: number }>();
  let processing = false;
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    if (req.headers.host !== `127.0.0.1:${port}`) {
      res.status(403).json({ error: "Invalid host." });
      return;
    }
    let sid = req.headers.cookie?.match(
      /(?:^|; )inboxops=([a-f0-9]{64})(?:;|$)/,
    )?.[1];
    let session = sid ? sessions.get(sid) : undefined;
    if (!session || session.expires < Date.now()) {
      sid = randomBytes(32).toString("hex");
      session = {
        csrf: randomBytes(32).toString("hex"),
        expires: Date.now() + 8 * 3600000,
      };
      sessions.set(sid, session);
      res.cookie("inboxops", sid, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 3600000,
      });
    }
    res.locals.sid = sid;
    res.locals.csrf = session.csrf;
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (req.headers.origin !== origin ||
        req.headers["x-csrf-token"] !== session.csrf ||
        !req.is("application/json"))
    ) {
      res
        .status(403)
        .json({ error: "Same-origin authenticated JSON request required." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  const need = () => {
    if (!provider)
      throw Error(
        "Complete test-account configuration first. See docs/oauth-setup.md.",
      );
    return provider;
  };
  app.get("/api/state", (_req, res) =>
    res.json({
      csrf: res.locals.csrf,
      mode,
      model: model.name,
      connected: mode === "fixture" || !!oauth.account,
      configured: mode === "fixture" || configured,
      account: mode === "fixture" ? provider!.account : oauth.account,
      oauthConfigured: !!oauth.client,
      tasks: store.tasks().map((t) => ({
        ...t,
        actions: store.actions(t.id),
        timeline: store.timeline(t.id),
      })),
      documents: knowledge.list(),
      processing,
    }),
  );
  app.post("/api/process", async (req, res) => {
    if (processing) {
      res.status(409).json({ error: "Processing already in progress." });
      return;
    }
    const context = req.body.context
      ? contextSchema.parse(req.body.context)
      : undefined;
    const selectedId = req.body.selectedId
      ? z.string().max(30).parse(req.body.selectedId)
      : undefined;
    processing = true;
    try {
      res.json(
        await new Agent(store, need(), model, knowledge).process(
          context,
          selectedId,
        ),
      );
    } finally {
      processing = false;
    }
  });
  app.post("/api/preferences", async (req, res) =>
    res.json({ ids: await knowledge.import(req.body) }),
  );
  app.post("/api/preferences/delete", (req, res) => {
    knowledge.delete(z.string().max(120).parse(req.body.title));
    res.json({ deleted: true });
  });
  app.post("/api/preferences/search", async (req, res) =>
    res.json(
      await knowledge.search(z.string().min(1).max(500).parse(req.body.query)),
    ),
  );
  app.post("/api/actions", async (req, res) => {
    const b = z
      .object({
        id: z.string(),
        kind: z.enum(["draft", "event", "send"]),
        hash: z.string().length(64),
        approved: z.literal(true),
      })
      .strict()
      .parse(req.body);
    const p = need();
    const bundle = createToolServer(p, knowledge, new Approval(store, p));
    const client = await connectTools(bundle.server);
    try {
      const capability = bundle.grant(b.id, b.kind, b.hash);
      const name = {
        draft: "gmail.create_draft",
        event: "calendar.create_event",
        send: "gmail.send_approved_draft",
      }[b.kind];
      const receipt = await callTool(client, name, { capability });
      store.audit(b.id, "tool write", name);
      res.json(receipt);
    } finally {
      await client.close();
      await bundle.server.close();
    }
  });
  app.post("/api/deny", (req, res) => {
    const t = store.get(z.string().parse(req.body.id));
    if (!t) throw Error("Task not found.");
    t.status = "denied";
    store.save(t);
    store.audit(t.id, "plan denied");
    res.json({ denied: true });
  });
  app.post("/api/oauth/start", async (_req, res) => {
    if (mode !== "live") throw Error("Fixture mode never connects to Google.");
    need();
    res.json({ url: await oauth.start(res.locals.sid) });
  });
  app.get("/oauth/callback", async (req, res) => {
    try {
      if (req.query.error) throw Error();
      await oauth.callback(
        z.string().parse(req.query.state),
        z.string().parse(req.query.code),
        res.locals.sid,
      );
      res.redirect("/?connection=success");
    } catch {
      res.redirect("/?connection=error");
    }
  });
  app.post("/api/disconnect", async (_req, res) => {
    const result = await oauth.disconnect();
    store.audit("account", "disconnected");
    res.json(result);
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown API route." }),
  );
  app.use(express.static(resolve("dist"), { index: "index.html" }));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(400).json({
        error:
          err instanceof z.ZodError
            ? "Invalid input. Review the required fields."
            : err instanceof Error
              ? err.message
              : "Request failed.",
      });
    },
  );
  return { app, store, origin, provider, knowledge };
}
