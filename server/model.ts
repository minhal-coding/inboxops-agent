export interface ToolSpec {
  name: string;
  description?: string;
  inputSchema: unknown;
}
export interface Model {
  name: string;
  fixture: boolean;
  decide(
    messages: unknown[],
    tools: ToolSpec[],
  ): Promise<{
    content?: string;
    tool_calls?: {
      function: { name: string; arguments: Record<string, unknown> };
    }[];
  }>;
  embed(text: string): Promise<number[]>;
}
export class Ollama implements Model {
  fixture = false;
  constructor(
    public name = process.env.OLLAMA_MODEL || "qwen3:4b",
    public embedding = process.env.OLLAMA_EMBED_MODEL || "embeddinggemma",
  ) {}
  async request(path: string, body: unknown) {
    try {
      const r = await fetch(`http://127.0.0.1:11434/api/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      });
      if (!r.ok) throw Error();
      return await r.json();
    } catch {
      throw Error(
        "Local model unavailable or timed out. Start Ollama and install the configured models; no paid fallback is used.",
      );
    }
  }
  async decide(messages: unknown[], tools: ToolSpec[]) {
    if (JSON.stringify(messages).length > 40000)
      throw Error("Model context budget exceeded.");
    const r = await this.request("chat", {
      model: this.name,
      messages,
      tools: tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 1000, num_ctx: 8192 },
    });
    return r.message;
  }
  async embed(text: string) {
    const r = await this.request("embed", {
      model: this.embedding,
      input: text,
      truncate: false,
    });
    const v = r.embeddings?.[0];
    if (
      !Array.isArray(v) ||
      !v.length ||
      v.some((x: unknown) => typeof x !== "number" || !Number.isFinite(x))
    )
      throw Error("Invalid local embedding.");
    return v as number[];
  }
}
// Explicit deterministic CI doubles: these are never reported as model inference.
export class FixtureModel implements Model {
  name = "fixture-script (NOT an LLM)";
  fixture = true;
  async decide(messages: any[], tools: ToolSpec[]) {
    const results = messages.filter((m) => m.role === "tool");
    const names = results.map((m) => m.tool_name || m.name);
    for (const name of [
      "gmail.get_thread",
      "knowledge.search",
      "calendar.freebusy",
    ])
      if (tools.some((t) => t.name === name) && !names.includes(name))
        return {
          tool_calls: [
            {
              function: {
                name,
                arguments:
                  name === "knowledge.search"
                    ? { query: "meeting working hours duration" }
                    : {},
              },
            },
          ],
        };
    return {
      content: JSON.stringify({
        classification: tools.some((t) => t.name === "calendar.freebusy")
          ? "schedule"
          : "uncertain",
        citationIds: JSON.parse(
          results.find((m) => (m.tool_name || m.name) === "knowledge.search")
            .content,
        ).map((c: any) => c.id),
      }),
    };
  }
  async embed(text: string) {
    const groups = [
      /meeting|schedule|working|hours|duration|afternoon/i,
      /recipe|cooking|pasta/i,
      /travel|flight|hotel/i,
      /astronomy|galaxy|star/i,
    ];
    return [...groups.map((r) => (r.test(text) ? 1 : 0)), 0.05];
  }
}
