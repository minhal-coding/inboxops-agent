import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Task, Action, Receipt } from "./domain.ts";
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS actions(key TEXT PRIMARY KEY,task TEXT,kind TEXT,hash TEXT,status TEXT,receipt TEXT); CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY,at TEXT,task TEXT,event TEXT,detail TEXT); CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,title TEXT,text TEXT,vector TEXT,model TEXT); CREATE TABLE IF NOT EXISTS external(id TEXT PRIMARY KEY,kind TEXT,data TEXT);`,
    );
  }
  save(task: Task) {
    this.db
      .prepare("INSERT OR REPLACE INTO tasks VALUES(?,?)")
      .run(task.id, JSON.stringify(task));
  }
  get(id: string): Task | undefined {
    const row = this.db.prepare("SELECT data FROM tasks WHERE id=?").get(id) as
      { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  tasks(): Task[] {
    return (
      this.db.prepare("SELECT data FROM tasks").all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  audit(task: string, event: string, detail = "") {
    this.db
      .prepare("INSERT INTO audit(at,task,event,detail) VALUES(?,?,?,?)")
      .run(new Date().toISOString(), task, event, detail);
  }
  timeline(task: string) {
    return this.db
      .prepare("SELECT at,event,detail FROM audit WHERE task=? ORDER BY seq")
      .all(task);
  }
  action(task: string, kind: Action) {
    return this.db
      .prepare("SELECT * FROM actions WHERE task=? AND kind=?")
      .get(task, kind) as
      | { key: string; hash: string; status: string; receipt: string | null }
      | undefined;
  }
  claim(key: string, task: string, kind: Action, digest: string) {
    this.db
      .prepare("INSERT INTO actions VALUES(?,?,?,?,?,NULL)")
      .run(key, task, kind, digest, "pending");
    this.audit(task, `${kind}: approved`, digest);
  }
  complete(key: string, receipt: Receipt) {
    this.db
      .prepare("UPDATE actions SET status=?,receipt=? WHERE key=?")
      .run("verified", JSON.stringify(receipt), key);
  }
  unknown(key: string) {
    this.db
      .prepare("UPDATE actions SET status=? WHERE key=?")
      .run("unknown", key);
  }
  actions(task: string) {
    return this.db
      .prepare("SELECT kind,status,hash,receipt FROM actions WHERE task=?")
      .all(task)
      .map((r) => ({
        kind: String(r.kind),
        status: String(r.status),
        hash: String(r.hash),
        receipt: r.receipt ? JSON.parse(String(r.receipt)) : null,
      }));
  }
  close() {
    this.db.close();
  }
}
