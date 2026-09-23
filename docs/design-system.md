# InboxOps design system

## Intent

A calm review desk for consequential actions. The primary object is an email task, followed by its supporting sources, proposed time, exact reply, independent approvals, and receipts. No marketing metrics or fabricated live status.

## Research and decisions

Installed the official project-local Codex skill with `npx --yes ui-ux-pro-max-cli@2.15.0 init --ai codex` (CLI 2.15.0). Verified `.agents/skills/ui-ux-pro-max/data` and `scripts`, then ran Python on Windows:

```powershell
python .agents/skills/ui-ux-pro-max/scripts/search.py "email operations inbox approval dashboard calm accessible" --design-system -p "InboxOps Agent" -f markdown
python .agents/skills/ui-ux-pro-max/scripts/search.py "approval confirmation destructive action" --domain ux
python .agents/skills/ui-ux-pro-max/scripts/search.py "inbox triage" --domain ux
python .agents/skills/ui-ux-pro-max/scripts/search.py "source citations trust" --domain ux
python .agents/skills/ui-ux-pro-max/scripts/search.py "error failure recovery retry" --domain ux
python .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus accessible forms" --domain web
```

The initial stale CLI suggested an irrelevant waitlist layout. After checking the current official README, we installed the renamed current CLI, read its skill, and reran all searches. The current search suggests Flat Design and inbox-focused colors, but its marketing/demo page structure does not fit this review desk. We retained the flat, accessible interface and product-specific layout. Approval search recommended explicit confirmation and visible success. Recovery search recommended next steps and announced errors. Inbox triage and citation searches returned zero results; the design for those surfaces follows the product requirements, not invented search findings. Third-party skill database and scripts are gitignored, not app dependencies.

No image-generation model used: the brief disallows paid models. The concept and implementation are code-native. Installed frontend, frontend-testing, React, and UI UX Pro Max accessibility guidance informed the implementation. CodeRabbit installation failed on Windows; see verification.

## Tokens

| Role                      | Value                                                  |
| ------------------------- | ------------------------------------------------------ |
| Background                | `#f6f8f7`                                              |
| Surface                   | `#ffffff`                                              |
| Text                      | `#233a36`                                              |
| Secondary text            | `#596d66`                                              |
| Primary action            | `#194d42` with white text                              |
| Selected row              | `#eaf2ed`                                              |
| Border                    | `#dde6e1`                                              |
| Focus                     | 3px `#a06a12`, 4px offset                              |
| Typography                | Local Segoe UI/Arial fallback; no remote font requests |
| Heading / body / metadata | 34 / 13 / 11–12px; 28px heading on mobile              |
| Radius                    | 6px controls, 9px surfaces                             |

## Layout and states

Desktop: 228px navigation, 270px queue, remaining width for the review document. Tablet: icon navigation and queue above detail. Mobile: compact top navigation, stacked queue and review, independent action rows with large buttons. Evidence and exact reply remain visible before approval. Long identifiers wrap.

Loading, empty queue, disconnected Google, clarification, processing error, awaiting approval, denied, partially completed, uncertain write, and verified receipts are represented. A checkbox plus a specific action button is required for each new write; sending is disabled until the exact draft has been verified. Unknown outcomes show Reconcile, which performs reads only.

Native controls, labels, skip link, visible focus, non-color status text, `role=alert`, processing `role=status`, reduced motion, and no horizontal overflow. Automated axe checks run at 1440, 768, and 390px; screenshots are fixture-only. Low-contrast metadata found in the first pass was darkened and checked again.
