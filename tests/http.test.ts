import http from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeApp } from "../server/app.ts";
test("loopback host, CSRF, Origin and JSON enforcement; offline fixture endpoint flow", async () => {
  const { app, store } = await makeApp({
    mode: "fixture",
    db: ":memory:",
    port: 4398,
  });
  const server = app.listen(4398, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const origin = "http://127.0.0.1:4398";
    const initial = await fetch(origin + "/api/state");
    const cookie = initial.headers.get("set-cookie")!.split(";")[0];
    const state = await initial.json();
    const post = (headers: Record<string, string>) =>
      fetch(origin + "/api/process", { method: "POST", headers, body: "{}" });
    assert.equal(
      (await post({ "content-type": "application/json" })).status,
      403,
    );
    assert.equal(
      (
        await post({
          "content-type": "application/json",
          cookie,
          origin: "https://evil.example",
          "x-csrf-token": state.csrf,
        })
      ).status,
      403,
    );
    assert.equal(
      await new Promise<number | undefined>((resolve) => {
        http.get(
          origin + "/api/state",
          { headers: { host: "evil.example" } },
          (r) => {
            r.resume();
            resolve(r.statusCode);
          },
        );
      }),
      403,
    );
    const r = await post({
      "content-type": "application/json",
      cookie,
      origin,
      "x-csrf-token": state.csrf,
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json())[0].status, "needs clarification");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
