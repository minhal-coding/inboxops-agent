import { z } from "zod";
import { hash, type Citation } from "./domain.ts";
import type { Store } from "./store.ts";
import type { Model } from "./model.ts";
// Seed calibration: relevant 0.40–0.56, unrelated 0.01–0.09 with EmbeddingGemma prefixes.
// This is a small local acceptance set, not a general retrieval benchmark.
export const RETRIEVAL_MIN_SCORE = 0.35;
export const documentSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .max(120)
      .regex(/\.(txt|md)$/i),
    text: z.string().min(1).max(12000),
    approved: z.literal(true),
  })
  .strict();
export class Knowledge {
  constructor(
    private store: Store,
    private model: Model,
  ) {}
  list() {
    return this.store.db
      .prepare("SELECT id,title,text,model FROM documents")
      .all();
  }
  async import(input: unknown) {
    const d = documentSchema.parse(input);
    if (
      this.list().length >= 40 &&
      !this.list().some((r) => r.title === d.title)
    )
      throw Error("Preference limit reached.");
    const chunks = d.text.match(/[\s\S]{1,700}/g) || [];
    const rows = [];
    for (let i = 0; i < chunks.length; i++)
      rows.push({
        id: hash([d.title, i, chunks[i]]).slice(0, 16),
        text: chunks[i],
        vector: await this.model.embed(chunks[i], "document", d.title),
      });
    this.store.db.exec("BEGIN");
    try {
      this.store.db.prepare("DELETE FROM documents WHERE title=?").run(d.title);
      for (const r of rows)
        this.store.db
          .prepare("INSERT INTO documents VALUES(?,?,?,?,?)")
          .run(
            r.id,
            d.title,
            r.text,
            JSON.stringify(r.vector),
            this.model.fixture
              ? this.model.name
              : this.model.embeddingSpace ||
                  this.model.embedding ||
                  this.model.name,
          );
      this.store.db.exec("COMMIT");
    } catch (e) {
      this.store.db.exec("ROLLBACK");
      throw e;
    }
    return rows.map((r) => r.id);
  }
  delete(title: string) {
    this.store.db.prepare("DELETE FROM documents WHERE title=?").run(title);
  }
  async search(query: string): Promise<Citation[]> {
    const q = await this.model.embed(z.string().min(1).max(500).parse(query));
    const model = this.model.fixture
      ? this.model.name
      : this.model.embeddingSpace || this.model.embedding || this.model.name;
    return (
      this.store.db
        .prepare("SELECT * FROM documents WHERE model=?")
        .all(model) as unknown as {
        id: string;
        title: string;
        text: string;
        vector: string;
      }[]
    )
      .map((r) => {
        const v = JSON.parse(r.vector) as number[];
        const dot = v.reduce((a, x, i) => a + x * (q[i] || 0), 0);
        const denominator = Math.hypot(...q) * Math.hypot(...v);
        return {
          id: r.id,
          title: r.title,
          snippet: r.text,
          score: v.length === q.length && denominator ? dot / denominator : 0,
        };
      })
      .filter((r) => r.score >= RETRIEVAL_MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }
}
