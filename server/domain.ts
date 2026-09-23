import { z } from "zod";
import { createHash } from "node:crypto";
export const email = z
  .string()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const instant = z.string().datetime({ offset: true });
export const contextSchema = z
  .object({
    start: instant,
    timeZone: z.string().min(1).max(80),
    duration: z.number().int().min(15).max(120),
  })
  .strict();
export type Context = z.infer<typeof contextSchema>;
export interface Thread {
  id: string;
  messageId: string;
  account: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  rfcMessageId: string;
  references: string;
  fingerprint: string;
}
export interface Citation {
  id: string;
  title: string;
  snippet: string;
  score: number;
}
export interface Slot {
  start: string;
  end: string;
  timeZone: string;
}
export const planSchema = z
  .object({
    account: email,
    threadId: z.string(),
    messageId: z.string(),
    fingerprint: z.string(),
    recipient: email,
    subject: z.string().max(300),
    body: z.string().min(1).max(5000),
    event: z
      .object({
        summary: z.string().max(100),
        start: instant,
        end: instant,
        timeZone: z.string(),
        attendees: z.array(email).max(1),
      })
      .strict(),
    citations: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        snippet: z.string(),
        score: z.number(),
      }),
    ),
    model: z.string(),
    mode: z.enum(["fixture", "live"]),
    createdAt: instant,
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export type Action = "draft" | "event" | "send";
export interface Receipt {
  id: string;
  verified: boolean;
  kind: Action;
  mode: "fixture" | "live";
}
export interface Task {
  id: string;
  thread: Thread;
  status: string;
  question?: string;
  plan?: Plan;
  hash?: string;
  trace: { tool: string; at: string }[];
  error?: string;
}
export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function slotFromContext(input: unknown): Slot {
  const c = contextSchema.parse(input);
  new Intl.DateTimeFormat("en", { timeZone: c.timeZone }).format();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: c.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(c.start));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  const wall = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  if (c.start.slice(0, 16) !== wall)
    throw Error("UTC offset does not match the selected IANA time zone.");
  const time = Date.parse(c.start);
  if (time < Date.now() + 60000 || time > Date.now() + 90 * 86400000)
    throw Error("Choose a future time within 90 days.");
  return {
    start: new Date(time).toISOString(),
    end: new Date(time + c.duration * 60000).toISOString(),
    timeZone: c.timeZone,
  };
}
export function validatePlan(
  input: unknown,
  thread: Thread,
  slots: Slot[],
  sources: Citation[],
  allowed: string[],
): Plan {
  const p = planSchema.parse(input);
  if (
    p.account !== thread.account ||
    p.threadId !== thread.id ||
    p.messageId !== thread.messageId ||
    p.fingerprint !== thread.fingerprint ||
    p.recipient !== thread.from ||
    !allowed.includes(p.recipient)
  )
    throw Error("Thread identity or recipient mismatch.");
  if (p.subject !== replySubject(thread.subject) || /[\r\n]/.test(p.subject))
    throw Error("Invalid reply subject.");
  if (
    !slots.some(
      (s) =>
        s.start === p.event.start &&
        s.end === p.event.end &&
        s.timeZone === p.event.timeZone,
    )
  )
    throw Error("Time was not verified available.");
  if (
    p.event.attendees.length !== 0 &&
    (p.event.attendees.length !== 1 || p.event.attendees[0] !== thread.from)
  )
    throw Error("New attendee rejected.");
  if (
    p.citations.some(
      (c) =>
        !sources.some(
          (s) =>
            s.id === c.id && s.title === c.title && s.snippet === c.snippet,
        ),
    )
  )
    throw Error("Unsupported citation.");
  if (p.body !== replyBody(p.event)) throw Error("Unsupported reply claim.");
  return p;
}
export const replySubject = (subject: string) =>
  /^re:/i.test(subject) ? subject : `Re: ${subject}`;
export function replyBody(slot: Slot) {
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(slot.start));
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: slot.timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `Hello,\n\nWould ${date}, from ${time.format(new Date(slot.start))} to ${time.format(new Date(slot.end))} (${slot.timeZone}), work for our meeting?\n\nThis time is proposed, not yet confirmed by you.\n\nThank you.`;
}
