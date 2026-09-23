# Dedicated test-account setup

Status: implementation available; live OAuth and inference have not been verified. Use only a dedicated Google account and recipient addresses you own. No password, token, or client secret should be sent in chat.

## 1. Local runtime and model

Install Node.js 24+ if needed. Install Ollama for Windows from the [official download](https://ollama.com/download/windows), then in PowerShell:

```powershell
ollama pull qwen3:4b
ollama pull embeddinggemma
ollama list
npm ci
npm run model:check
```

These are free local models, but downloads require disk space and memory. The defaults are candidates for the observed 23.1 GiB RAM machine; hardware performance is unverified. Ollama must listen on `127.0.0.1:11434`. The smoke check must return PASS for structured JSON, tool selection, and embedding output. Never call fixture results live inference. To choose another installed tool-capable model, set `OLLAMA_MODEL`; set `OLLAMA_EMBED_MODEL` for embeddings and reimport preferences when changing it.

## 2. Create a test OAuth client (the user performs this)

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create/select a project dedicated to this demo. Enable **Gmail API** and **Google Calendar API**. Do not enable a paid service or attach billing for this project.
2. In **Google Auth Platform → Branding / Audience**, configure an External app in **Testing**, then add the dedicated test Gmail account as a test user. This is not production publishing or verification.
3. Configure the four scopes below in **Data Access**. Do not request `mail.google.com`, `gmail.modify`, or full `calendar` access.
4. In **Clients**, create a **Web application** OAuth client. Set its exact authorized redirect URI to **`http://127.0.0.1:4317/oauth/callback`**. No browser JavaScript client secret is used. If changing the port, change the redirect URI too.
5. Download the client JSON into an external local directory, e.g. **`C:/Users/YOUR_NAME/.inboxops/google-client.json`**. Restrict that file to your Windows account using the file's Security settings. Do not put it in the repository. InboxOps reads the `web.client_id` and `web.client_secret` fields at startup; they never reach the browser or logs.

## 3. Prepare the test boundaries

- In the dedicated Gmail account, create an **InboxOps-Test** label and apply it only to test emails. Use one sender address you also own. Keep the mailbox small.
- The app resolves the exact user label **InboxOps-Test** through a read-only label lookup. Missing or ambiguous labels stop processing; there is no mailbox-wide fallback.
- Create a dedicated secondary calendar owned by the test account in Google Calendar. In its **Settings → Integrate calendar**, copy **Calendar ID**. Shared calendars you do not own are outside V1 scope.
- Run `npm run setup:google` in your local terminal and enter the external client-file path, dedicated account, test sender addresses, and calendar ID. The helper validates the client type and callback, then creates ignored `.env` without copying the client secret. It refuses to overwrite an existing `.env`. Alternatively, copy `.env.example` and configure these values locally. `TEST_LABEL_ID` remains an optional override for an explicit label ID.

## 4. Connect in the running app

```powershell
# Clear an earlier fixture-mode override in this shell, if set.
Remove-Item Env:INBOXOPS_MODE -ErrorAction SilentlyContinue
npm run build
npm start
```

Open `http://127.0.0.1:4317`, choose **Connections → Connect / reconnect Google**, and explicitly select the configured dedicated test account. The app verifies the account against Gmail profile after consent and rejects another account or missing scopes. OAuth state is single-use, expires after five minutes, and is bound to the initiating browser session; PKCE binds the code exchange.

On denial or callback error, return to Connections, correct the test-user/client/scope configuration, and reconnect. Do not loosen the test-account check. Access tokens stay only in process memory. `access_type=online` is requested; refresh tokens are not persisted. Tokens expire (normally around one hour), and restarting requires reconnecting. Disconnect erases the local token immediately and attempts remote revocation; if revocation fails, the app says to remove access manually in Google Account permissions. Disconnect does not delete task records; see privacy cleanup.

## Scopes and limitations

| Scope suffix            | Why needed                                                      | Boundary                                                           |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `gmail.readonly`        | Read labeled messages/threads and verify sent receipts          | Restricted; Google provides no label-limited standalone read scope |
| `gmail.compose`         | Create/read drafts and send the exact approved draft            | Restricted; already includes sending, so no redundant `gmail.send` |
| `calendar.freebusy`     | Availability check                                              | No full calendar scope                                             |
| `calendar.events.owned` | Create/read holds and check overlaps on the owned test calendar | Restricted by ownership and app-configured calendar ID             |

Gmail add-on current-message scopes do not fit a standalone local dashboard. `gmail.metadata` cannot read the email body. We do not need label mutation, deletion, inbox modification, attachment downloads, or general calendar administration. Read access technically covers more than the chosen label; the application enforces recent labeled threads and exact allowlisted recipients. Gmail receipt reconciliation uses a deterministic RFC Message-ID query or bounded draft inspection outside the incoming-label filter.

Public multi-user onboarding would require Google OAuth verification for the requested sensitive/restricted data and applicable privacy disclosures. Google's restricted-scope rules can require an independent security assessment when restricted data is stored or transmitted through servers. This local test build has **not** completed verification, assessment, or production onboarding. Do not publish its consent screen as a verified public service. Testing/user-cap limitations and Google account policies still apply.

Official references reviewed on 2026-09-23: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [Gmail threading](https://developers.google.com/workspace/gmail/api/guides/threads), [Calendar event insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [Ollama tools](https://docs.ollama.com/capabilities/tool-calling), [Ollama embeddings](https://docs.ollama.com/capabilities/embeddings).
