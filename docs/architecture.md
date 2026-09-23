# Architecture and recovery

## Modules

| File                  | Responsibility                                                                  |
| --------------------- | ------------------------------------------------------------------------------- |
| `server/oauth.ts`     | Google client, state/PKCE, account check, memory-only tokens, revoke            |
| `server/provider.ts`  | Fixture and Google Gmail/Calendar adapters; fixed API URLs                      |
| `server/model.ts`     | Ollama tool selection/embeddings; explicit scripted CI double                   |
| `server/knowledge.ts` | User-approved import/update/delete, chunk IDs, SQLite vectors, cosine retrieval |
| `server/mcp.ts`       | Six SDK tools, linked protocol client, single-use write grants                  |
| `server/agent.ts`     | Bounded observe/tool/classify/propose loop                                      |
| `server/domain.ts`    | Strict plan/identity/time/citation/claim validation                             |
| `server/approval.ts`  | Server-enforced human approval, freshness, claims, reconciliation               |
| `server/store.ts`     | SQLite tasks, audit, actions, approved chunks                                   |
| `server/app.ts`       | Loopback API, Host/Origin/session/CSRF boundary                                 |
| `src/`                | Inbox, task review, preference management, connection UX                        |

## Protocol and model boundary

`Client.callTool` and `McpServer.registerTool` communicate over the SDK's `InMemoryTransport.createLinkedPair`. These are actual MCP requests/responses, not a function renamed MCP. The stdio entry point exposes the same six tools against fictional adapters for inspection. Its writes are denied because no browser-issued capability exists. Live tool servers run in the authenticated local app process so OAuth tokens never cross into the model or an unauthenticated network MCP endpoint.

The LLM receives only the three read tool schemas. Tool arguments cannot override the selected thread, account, calendar, or user-confirmed slot. Retrieval accepts only a bounded text query. Writes require a random capability held outside the model. A grant binds task, action, full plan hash, and a 30-second expiry, and is consumed once. The application checks the plan again before acting.

The plan contains a fixed, validated proposal template. V1 sacrifices free-form prose to eliminate unsupported claims and recipient changes. A relative date is not resolved from machine locale; the user must confirm an explicit timestamp, IANA time zone, and duration. The timestamp offset is checked against the named zone. Imported preferences provide cited context, not executable rules or authorization. An absent relevant citation is shown as absent.

## Durable state

Tasks deduplicate by account + Gmail thread ID + incoming message ID. Action keys hash the same identity plus action kind, deliberately excluding plan revision: an edit cannot mint a new send key. Every write has a unique SQLite claim committed before dispatch. Pending claims survive process termination. The actions table is the source of truth; timeline status is a presentation aid.

| State              | Retry behavior                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| No claim           | Requires exact human approval; rechecks thread, preferences, expiry, availability              |
| Pending / unknown  | Read-only reconciliation; never repeats the mutation                                           |
| Verified           | Returns stored receipt; no provider mutation                                                   |
| Partial completion | Each successful action remains verified; other unclaimed actions can be approved independently |
| Denied             | New actions rejected; reconciliation of prior attempts remains read-only                       |

Calendar event IDs are deterministic hashes accepted by Calendar's ID alphabet. Gmail uses a deterministic RFC Message-ID, retains threadId/In-Reply-To/References and matching subject, and verifies the saved draft immediately before sending. Gmail does not offer a transactional idempotency key. An ambiguous send is searched by RFC Message-ID in Sent; absence is **not proof it did not send**, so no automatic resend occurs. Draft reconciliation inspects at most 100 drafts. A missing receipt can stay locked and require manual inspection. Do not delete the database to retry a live action.

There is no cross-provider transaction. A calendar hold can succeed while send fails. No automatic rollback deletes events or messages. The UI reports the separate outcomes. Creating the hold first can make the free/busy interval busy; the send recheck verifies that hold and excludes only its event ID from a bounded overlap query.

## Bounds

- Incoming intake: at most 10 messages within seven days, selected test label, one allowlisted sender per thread.
- Email text: at most 10,000 characters; plain text only; no attachment fetching/rendering.
- Agent: six iterations, six read calls, three tool calls per model response; time checked between iterations at 180 seconds. A current 90-second model call may finish beyond that check boundary.
- Model: loopback-only fixed Ollama endpoint, 90-second request timeout, 8,192 context tokens requested, 1,000 output tokens, 40,000 input-character guard; no automatic paid fallback.
- Preferences: 12,000 characters per import, 700-character chunks, small bounded store, top three cosine matches at threshold 0.35 (calibrated on eight fictional seed queries); embedding model and retrieval-prefix version separate indexes. Fixture embeddings are deterministic categories, not semantic inference.
- Google: 15-second request timeout; automatic mutation retries disabled; one user-initiated attempt per action key.
- New approvals: 15-minute plan lifetime; no new mutation after stale source/thread/account checks fail.

These bounds are suitable for a small local portfolio demo, not a throughput service. Google/Ollama runtime behavior remains live-unverified.
