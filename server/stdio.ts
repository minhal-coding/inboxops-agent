import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Store } from "./store.ts";
import { FixtureProvider } from "./provider.ts";
import { FixtureModel } from "./model.ts";
import { Knowledge } from "./knowledge.ts";
import { Approval } from "./approval.ts";
import { createToolServer } from "./mcp.ts";
const store = new Store(":memory:");
const provider = new FixtureProvider(store);
const knowledge = new Knowledge(store, new FixtureModel());
await knowledge.import({
  title: "Preferences.md",
  text: "Preferred meeting duration is 30 minutes during working hours.",
  approved: true,
});
const { server } = createToolServer(
  provider,
  knowledge,
  new Approval(store, provider),
  { threadId: "fixture-thread-001" },
);
await server.connect(new StdioServerTransport());
