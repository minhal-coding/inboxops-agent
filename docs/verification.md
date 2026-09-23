# Verification record

Development date: 2026-09-23. Windows, Node 24.18.0, npm 11.16.0. Public source is separate from existing portfolio projects.

| Command / check                                 | Result          | What it proves                                                                                                    |
| ----------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                             | PASS            | Static types                                                                                                      |
| `npm run build`                                 | PASS            | Production React/Vite build                                                                                       |
| `npm test`                                      | PASS (38 tests) | Deterministic policy, adapter contract, MCP, SQLite and HTTP checks                                               |
| `npm run test:e2e`                              | PASS            | Actual Chromium fixture flow, source evidence, three approvals, verified fixture receipts, reload and input error |
| axe WCAG 2 A/AA at 1440×1000, 768×1024, 390×844 | PASS            | No reported violations on the tested plan view; not a full accessibility certification                            |
| Screenshot inspection                           | PASS            | Desktop/tablet/mobile layout and wrapping visually inspected; fixture banner present                              |
| `npm run mcp:inspect`                           | PASS            | Actual stdio MCP client lists six tools and invokes knowledge.search                                              |
| `npm run evidence:fixture`                      | PASS            | Actual linked MCP reads/writes, fixture receipts, same send receipt on retry, one simulated send                  |
| `npm audit`                                     | PASS            | Zero reported dependency vulnerabilities at verification time                                                     |
| `npm run model:check`                           | **PASS**        | Ollama 0.34.3, explicit Qwen3 4B Instruct, JSON/tool selection and 768-dimensional embeddings                                              |
| Live Google OAuth/freebusy/draft/event/send     | **UNVERIFIED**  | Dedicated client and explicit test-account connection missing                                                     |
| Live semantic retrieval                         | **PASS**        | Eight real EmbeddingGemma retrieval seed queries; exact chunk matches and unrelated rejection                                                                                 |
| CodeRabbit                                      | **BLOCKED**     | Official installer rejected Windows/MINGW64; no review score claimed                                              |

Browser plugin's `browser` skill/runtime was not available. Used project Playwright Chromium, with checked-in E2E coverage, screenshot inspection and axe. No framework error overlay, page errors, or horizontal overflow appeared in the passing flow. The first pass caught metadata contrast defects; these were fixed. The HTTP test originally attempted a Host override through fetch (which did not preserve that header); a raw HTTP request verified rejection. No application Host bypass was found.

All images under `evidence/fixture-*.png` show fictional data. `evidence/fixture-run.json` contains scripted-model results, never live inference. Live acceptance cannot be inferred from passing offline CI.

## Evaluation dataset

`fixtures/evaluation.json` separates semantic classification cases (which need a real local model) from deterministic policy cases exercised by `tests/core.test.ts`. This is a seed dataset, not a reported LLM benchmark. It includes positive/negative scheduling, relative dates, injection, invented citations, recipient changes, irrelevant retrieval, lost responses and partial outcomes. GEPA is not run. Expand and label cases after a live baseline; record actual model failures rather than teaching the fixture double to pass semantic cases.

## Remote CI

The workflow template in `docs/ci-workflow.yml` runs dependency installation, typecheck, tests, build, Chromium/axe fixture verification, MCP inspection and dependency audit on Ubuntu with Node 24. It requires no personal OAuth credentials or model. Check the linked GitHub Actions run for the published revision; its result is separate from local verification.

Remote CI status: **PASS** for workflow activation commit `4864ab9`. After the user completed GitHub device authorization, the CLI confirmed `workflow` scope. The reviewed template is active at `.github/workflows/ci.yml`. [Actual Actions run 35916935765](https://github.com/minhal-coding/inboxops-agent/actions/runs/35916935765) passed on Ubuntu / Node 24. This proves the offline pipeline, not local model or Google acceptance. Later changes require their own run.

## Real local model evidence

Ollama was installed with the official Windows installer after compatibility/disk checks. SHA-256 `fe1cce219b07ba13982a9419bfa3697c911bf77667ee636c967baed1b06ee3a0` matched the official package, Authenticode signer was Ollama Inc., and installer exit code was 0. The service binds to loopback; this session sets `OLLAMA_NO_CLOUD=1`. GPU inference was unavailable with the installed AMD driver, so tests used CPU. No graphics driver was changed.

- [Exact smoke output](../evidence/model-check-output.txt) and [model identities](../evidence/model-check.json): real JSON output, selected calendar.freebusy, 768 finite embedding values, norm approximately 1.
- [Retrieval output](../evidence/retrieval-check-output.txt): approved fictional Markdown, four relevant and four unrelated queries. With documented task prefixes, relevant cosine scores were 0.403–0.561 and unrelated scores 0.013–0.083. Threshold 0.35 passes this small calibration set; it is not a general benchmark. Existing bare-text vectors are excluded by the new retrieval-v1 namespace.
- Initial smoke/model integration failures are preserved in `evidence/*attempt-*.json`. The generic qwen3:4b tag resolved to the Thinking model (digest 359d7dd4…), emitted reasoning outside expected JSON, and timed out. A local template experiment also failed and was not adopted. The final configuration uses the official explicit Instruct tag (digest 0edcdef34593…) and unchanged embedding weights (digest 85462619ee72…).

Primary references: [Qwen Instruct model](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M), [Qwen modes](https://github.com/QwenLM/Qwen3), [EmbeddingGemma task prefixes](https://ai.google.dev/gemma/docs/embeddinggemma/model_card).

Observed integration defects were fixed without relaxing action policy: missing availability now triggers bounded read-tool feedback, rather than a misleading busy-time message; final real-model responses use a JSON schema restricted to actual retrieved citation IDs. The model still selects read tools and classification. Trusted application validation and all three separate write approvals remain required. When time is unconfirmed, clarification text comes from the application rather than accepting a model claim that a meeting is scheduled. [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) documents the local schema mechanism.

Final `npm run model:integration`: **PASS** for schedule, other, and uncertain classifications, with actual MCP reads and real embeddings against fictional Google adapters. The schedule reached awaiting approval with chunk `e9b1c48d45022c54`; all three cases recorded zero writes. [Complete decisions and timings](../evidence/model-integration.json), [exact command output](../evidence/model-integration-output.txt). Model decision time was approximately 104 seconds for scheduling and 51 seconds for each other case on this CPU session. This is three seed cases, not a reliability claim for arbitrary mail.

The per-gate real-world acceptance table is maintained in [live acceptance](live-acceptance.md). Google gates remain BLOCKED; local inference and offline tests do not satisfy them.
