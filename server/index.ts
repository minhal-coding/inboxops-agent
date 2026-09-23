import { makeApp } from "./app.ts";
const { app, origin, store } = await makeApp();
const server = app.listen(Number(new URL(origin).port), "127.0.0.1");
server.once("listening", () =>
  console.log(
    `InboxOps: ${origin} — ${process.env.INBOXOPS_MODE || "live"} mode`,
  ),
);
server.once("error", () => {
  console.error(
    `InboxOps could not bind ${origin}. Choose an unused PORT; do not stop another project's service.`,
  );
  store.close();
  process.exitCode = 1;
});
