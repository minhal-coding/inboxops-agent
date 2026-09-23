import type { Task, Receipt } from "../server/domain";
export type TaskView = Task & {
  actions: { kind: string; status: string; hash: string; receipt?: Receipt }[];
  timeline: { at: string; event: string; detail: string }[];
};
export interface State {
  csrf: string;
  mode: "live" | "fixture";
  model: string;
  connected: boolean;
  configured: boolean;
  oauthConfigured: boolean;
  account?: string;
  tasks: TaskView[];
  documents: { id: string; title: string; text: string; model: string }[];
  processing: boolean;
}
