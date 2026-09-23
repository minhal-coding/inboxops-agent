import { makeApp } from "./app.ts";
const { app, origin } = await makeApp();
app.listen(Number(new URL(origin).port), "127.0.0.1", () =>
  console.log(
    `InboxOps: ${origin} — ${process.env.INBOXOPS_MODE || "live"} mode`,
  ),
);
