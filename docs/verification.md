# Verification record

Development date: 2026-09-23. Windows, Node 24.18.0, npm 11.16.0. Public source is separate from existing portfolio projects.

| Command / check                                 | Result          | What it proves                                                                                                    |
| ----------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                             | PASS            | Static types                                                                                                      |
| `npm run build`                                 | PASS            | Production React/Vite build                                                                                       |
| `npm test`                                      | PASS (31 tests) | Deterministic policy, adapter contract, MCP, SQLite and HTTP checks                                               |
| `npm run test:e2e`                              | PASS            | Actual Chromium fixture flow, source evidence, three approvals, verified fixture receipts, reload and input error |
| axe WCAG 2 A/AA at 1440×1000, 768×1024, 390×844 | PASS            | No reported violations on the tested plan view; not a full accessibility certification                            |
| Screenshot inspection                           | PASS            | Desktop/tablet/mobile layout and wrapping visually inspected; fixture banner present                              |
| `npm run mcp:inspect`                           | PASS            | Actual stdio MCP client lists six tools and invokes knowledge.search                                              |
| `npm run evidence:fixture`                      | PASS            | Actual linked MCP reads/writes, fixture receipts, same send receipt on retry, one simulated send                  |
| `npm audit`                                     | PASS            | Zero reported dependency vulnerabilities at verification time                                                     |
| `npm run model:check`                           | **BLOCKED**     | `fetch failed` at Ollama loopback endpoint; no actual model response                                              |
| Live Google OAuth/freebusy/draft/event/send     | **UNVERIFIED**  | Dedicated client and explicit test-account connection missing                                                     |
| Live semantic retrieval                         | **UNVERIFIED**  | Local embedding model unavailable                                                                                 |
| CodeRabbit                                      | **BLOCKED**     | Official installer rejected Windows/MINGW64; no review score claimed                                              |

Browser plugin's `browser` skill/runtime was not available. Used project Playwright Chromium, with checked-in E2E coverage, screenshot inspection and axe. No framework error overlay, page errors, or horizontal overflow appeared in the passing flow. The first pass caught metadata contrast defects; these were fixed. The HTTP test originally attempted a Host override through fetch (which did not preserve that header); a raw HTTP request verified rejection. No application Host bypass was found.

All images under `evidence/fixture-*.png` show fictional data. `evidence/fixture-run.json` contains scripted-model results, never live inference. Live acceptance cannot be inferred from passing offline CI.

## Evaluation dataset

`fixtures/evaluation.json` separates semantic classification cases (which need a real local model) from deterministic policy cases exercised by `tests/core.test.ts`. This is a seed dataset, not a reported LLM benchmark. It includes positive/negative scheduling, relative dates, injection, invented citations, recipient changes, irrelevant retrieval, lost responses and partial outcomes. GEPA is not run. Expand and label cases after a live baseline; record actual model failures rather than teaching the fixture double to pass semantic cases.

## Remote CI

The workflow template in `docs/ci-workflow.yml` runs dependency installation, typecheck, tests, build, Chromium/axe fixture verification, MCP inspection and dependency audit on Ubuntu with Node 24. It requires no personal OAuth credentials or model. Check the linked GitHub Actions run for the published revision; its result is separate from local verification.

Remote CI status: **BLOCKED**. GitHub rejected the initial push of .github/workflows/ci.yml because the authenticated CLI token lacks the workflow scope. Source and sanitized evidence are published with the workflow held as a template. To enable it, the user must run gh auth refresh -h github.com -s workflow; then move the template to .github/workflows/ci.yml, commit, push, and inspect the actual run. No remote CI pass is claimed.
