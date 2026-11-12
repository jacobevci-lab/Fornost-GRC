# Live end-to-end QA — 2026-11-12

Requested by the product owner after the identity/access release. Target deployed application revision: 12546543a45cc9f3c8b7bcca3b6351595de3e16b.

Goal: verify real navigation, forms, persistence, relationships, deletion, permissions, languages and responsive layouts. Use the existing production QA principal only through Actions secrets. Use unique synthetic records; no edit, deletion or approval of business records. Record per-scenario results and preserve failures while continuing unrelated checks. Do not call provider integrations or send notifications.

Production coverage: 27 navigation destinations, desktop Turkish/light and mobile English/dark, recognized subviews, all 34 AI workspaces; browser CRUD on core registers and evidence, relationship guard, stale write/delete prevention, audit creation, AI draft API CRUD with browser inventory, account lifecycle (existing live run). Each synthetic identifier is tracked and cleanup verified. Audit/history entries are intentionally retained. Features without a reversible production fixture use the isolated application's real backend and browser, explicitly marked as isolated. External SSO/ticket/email/AI-provider operations remain blocked without dedicated provider test configuration.

QA artifacts distinguish passed/failed/blocked/not exercised; a successful page visit does not prove every action. No application deployment is part of this test branch.
