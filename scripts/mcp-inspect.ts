import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const client = new Client({ name: "inboxops-inspector", version: "0.1.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "server/stdio.ts"],
  }),
);
console.log(
  JSON.stringify(
    {
      mode: "fixture",
      tools: (await client.listTools()).tools.map((t) => t.name),
      retrieval: await client.callTool({
        name: "knowledge.search",
        arguments: { query: "meeting duration" },
      }),
    },
    null,
    2,
  ),
);
await client.close();
