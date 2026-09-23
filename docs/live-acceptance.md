# Live acceptance — UNVERIFIED

Required outcome: one real incoming test email → real local model decision → actual MCP reads and semantic source retrieval → Google free/busy → exact human approval in the running app → real draft, calendar hold, and one sent reply → verified provider IDs → no duplicate on retry.

1. Complete [setup](oauth-setup.md), run `npm run model:check`, record model name, Ollama version and model identity. A failed check blocks acceptance.
2. Start **live** mode and explicitly connect the dedicated test account in the app. Import/approve a small preference `.md` document. Search a relevant query (e.g. meeting duration) and an irrelevant query (e.g. astronomy); record real embedding scores/chunk IDs. If irrelevant retrieval passes the threshold, calibrate retrieval before acceptance; fixture scores are not a substitute.
3. From another address you control, manually send a real scheduling request to the dedicated account. Apply the selected test label. This setup document is not permission for the coding assistant to contact anyone.
4. Click Process new mail. Review the model-selected read tools and classification. If uncertain, confirm the intended timestamp/zone/duration and reprocess the selected task. The plan must include genuine retrieved snippets and a successful Google availability result.
5. Read the exact account, recipient, subject, body, time, and empty attendee list. **The user** checks and approves Create this draft, then Create this calendar hold, then Send this exact reply inside the app. This is the only authorization to send. A hold is a real Calendar event with no invitations.
6. Verify the Gmail draft/message IDs and Calendar event ID shown by readback. Inspect the dedicated account directly. Reload and retry the same action through the UI/API; the existing receipt must be returned, with exactly one matching Sent message. Do not reset the action database.
7. Record sanitized timestamp, model/version, tool names, citation IDs, approval hash, action receipt IDs, retry result and failures. Never publish email bodies, account addresses, OAuth codes or credentials. Use `npm run evidence:export` after inspecting its sanitized output. Verify the exported live status against the model smoke check and actual account; the exporter does not certify acceptance by itself.

If an action outcome is unknown, choose Reconcile. It reads external state and never repeats the write. If still unresolved, inspect the test mailbox/calendar manually and keep the action locked. Preserve the partial outcome; do not claim atomic completion.

## Observed gates (2026-09-23)

| Gate | Status | Sanitized evidence / blocker |
| --- | --- | --- |
| Real local model | PASS | [Actual smoke output](../evidence/model-check-output.txt): Ollama 0.34.3, Qwen3 4B Instruct, JSON and tool selection |
| Real semantic retrieval | PASS | [Eight query scores](../evidence/retrieval-check.json), real EmbeddingGemma and approved fictional Markdown |
| Real-model MCP loop with fictional Google | PASS | [Observed integration](../evidence/model-integration.json): three classifications, actual MCP reads, exact source chunk, zero writes |
| Real OAuth | BLOCKED | Dedicated account not identified/connected; current Cloud browser session requires two-step verification |
| Real Google free/busy | BLOCKED | Requires dedicated account consent and configured owned calendar |
| Approved Gmail draft | BLOCKED | Requires user review and exact draft approval in the app |
| Approved Calendar hold | BLOCKED | Requires user review and exact event approval in the app |
| Approved Gmail send | BLOCKED | Requires user review and exact send approval in the app |
| Provider readback | BLOCKED | No real action IDs exist yet; fixture IDs are not evidence |
| Duplicate retry | BLOCKED | Requires the same actual approved action and provider count/readback; preserve the database |
| Remote CI | PASS | [Actions for ea3ee80](https://github.com/minhal-coding/inboxops-agent/actions/runs/35921222310), offline adapters only |

No real email was sent and no real Calendar event was created. Passing local inference, retrieval, or offline CI does not complete this live acceptance procedure. The browser was opened for automated Google Cloud setup at the user's request; account selection and the Cloud two-step verification prerequisite remain user-dependent. Port 4317 was occupied by the separate RepoMedic preview and was not stopped.
