# Privacy and threat model

## Trust boundaries

The user and local OS account control configuration and approvals. Gmail bodies, subjects, headers, HTML, attachments, quoted text, model output, and preference documents are untrusted data. User approval of a preference means it may be retrieved; it does not turn it into executable instructions. Model output is untrusted even when it looks confident.

| Threat                                       | Enforcement                                                                                                               | Residual risk                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Prompt injection asks to send/exfiltrate     | Model sees read-only schemas; fixed URLs; no shell; write capability never enters context                                 | Model may misclassify or pick irrelevant citations; user reviews exact plan                               |
| New recipient or account                     | Trusted From/To metadata, configured allowlist, Gmail profile check, exact hash                                           | Sender spoofing is possible; dedicated test accounts only, not identity authentication                    |
| Reply routing abuse                          | Single recipient, no CC/BCC, differing Reply-To rejected, RFC threading retained                                          | Live Gmail normalization remains unverified                                                               |
| Draft edited externally                      | Read draft immediately before sending; compare account/recipient/subject/plain body, reject multipart/attachment payloads | A concurrent external edit between read and send remains a provider race; do not edit drafts concurrently |
| Cross-origin drive-by writes / DNS rebinding | Loopback bind, exact Host, exact Origin, session-bound CSRF header, JSON-only mutations, HttpOnly SameSite cookie, CSP    | Malicious local processes and compromised browser/OS are outside this boundary                            |
| Duplicate send after timeout/crash           | Durable claim before write, deterministic Message-ID, read-only reconciliation                                            | May block a legitimate retry indefinitely; cannot guarantee delivery or exactly-once semantics from Gmail |
| Stale time / concurrent calendar changes     | Fresh availability check; verified hold exclusion only; exact zone and offset                                             | Availability may change after the check; no Calendar transaction/lock                                     |
| Credential disclosure                        | External client file, token in memory, no model access, no request/response logs                                          | OS process memory and local filesystem remain sensitive                                                   |
| Misleading demo claims                       | Mode banners, fixture receipt prefixes, verification table, separate databases                                            | Live acceptance requires the user's connected account and approval                                        |

## Storage and deletion

`.data/live.sqlite` holds local task bodies, exact plans, approved preference chunks/vectors, action claims, receipts and audit entries. `.data/fixture.sqlite` is separate. SQLite is **not encrypted by this application**. Protect the OS account and use full-disk encryption if desired; do not use this repository folder in a public/synced location containing live data. `.data/`, `.env`, credentials patterns and local skill files are ignored by Git.

The audit table stores timestamps, task IDs, event names, tool names, approval hashes, and receipt IDs. It excludes email bodies, document snippets, tokens, client secrets and authorization codes. UI task records still contain the needed email/plan content. No analytics or remote fonts are loaded. Data is sent only to Google for the requested API operations; local text goes to the loopback Ollama service. No unrelated files are scanned or indexed.

**Disconnect & erase token** clears process credentials immediately and attempts Google revocation. Stop the server to clear all remaining in-memory sessions. Delete imported source documents through Preferences. For a complete local-data reset, first resolve any uncertain writes by inspecting the test account, disconnect, stop the server, then delete the mode's SQLite file and its WAL/SHM siblings yourself. Deleting action state removes duplicate protection; never reset it to retry a possibly sent message. Delete the external OAuth JSON and `.env` separately when retiring the demo. Remote Gmail drafts/messages/events are not deleted by local cleanup.

## Scope review

`gmail.readonly` and `gmail.compose` are necessary for body reads plus draft/send. Neither is label-limited by Google. The app filters intake and checks identity again before writes. `calendar.freebusy` and `calendar.events.owned` avoid full-calendar administration. No inbox mutation or broad `mail.google.com` scope. V1 personal holds contain no attendees. Public Google onboarding is unapproved; see [OAuth setup](oauth-setup.md).

## Review status

Boundary tests cover malicious tool choices, injected email/document text, identity mutations, invalid citations, stale approval, changed sources, denied approval, repeated delivery, concurrent requests, unknown outcomes, disconnect, OAuth state error, model/network failure, and Host/Origin/CSRF checks. These prove deterministic enforcement against test doubles, not LLM robustness or live Google compatibility. CodeRabbit's official installer failed on Windows with `Unsupported operating system: mingw64_nt-10.0-26200`. No CodeRabbit review result is claimed; run its CLI in a supported environment and authenticate to obtain that independent review.
