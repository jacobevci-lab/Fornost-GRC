# Connected CAPA decisions — 28 October 2026

## Product decision

An action owner completing corrective work and the independent reviewer closing it should reuse existing accounts and evidence files. On main `f5c59cd0e6f16138ec8765223d9ec4704f69815c`, `findings-center.tsx` still requires email strings for ownership and manual evidence reference/SHA-256 values for submission, verification and risk acceptance. This is a source-confirmed gap in the research's control/finding lifecycle package after connected policy decisions. Reuse the existing directory, versioned library and retained decision infrastructure. Completion time and adoption are unmeasured. External portals, annual capacity planning and automatic reassessment have broader dependencies and are deferred.

## Journey and scope

Existing CAPA Center → create with eligible owner and independent Admin reviewer → start corrective action → inspect the full current finding/plan and choose an actual file version → submit → assigned independent verification or reasoned risk acceptance → inspect distinct retained decision evidence and navigate from Evidence Usage to the exact finding. Reopening retains previous decisions. Existing audit/workpaper/continuous-assurance origins remain separate from remediation evidence.

Preserve the current palette, menus, email settings, legacy API callers, governance gates, exact navigation and independent-review rules. No new business schema, automatic decisions, certified signatures, external access or retroactive canonicalization of legacy references. Bind reviewed source, live actor, selected accounts and file to the transaction; lifecycle, event and pin must commit or roll back together. Object-store reads and SQL do not share a distributed transaction.

## Acceptance and validation

- Actual UI creation uses eligible directory accounts; the server rejects ineligible, self-reviewing or concurrently revoked assignments without partial records.
- Submission, verification and risk acceptance retain separate canonical file-version pins. New uploads and reopening cannot rewrite historical decisions. Existing text/hash clients remain compatible and do not receive canonical pins.
- Complete source changes, stale identity/access, changed files and event/pin failures reject the whole write. Existing owner/independent-review/acceptance-expiry requirements stay authoritative through direct API calls.
- Notes and evidence selections survive errors and conflicts. Source refresh is read-only; adopting changed context resets confirmation. Lost-response recovery reads current state before retry, blocks completed operations and refreshes the parent register on close.
- Authorized Viewers can inspect retained usage and exact sources. Scoped enterprise access remains restricted. Missing/bounded sources are explicit; pinned evidence cannot be deleted.
- Meaningful SQLite route/store regressions and actual Chromium journeys cover lifecycle, older selected versions, failed reads/writes, lost responses, role boundaries, TR/EN, both themes, desktop/tablet/mobile, keyboard and accessibility. Run required CI and the existing product browser workflow on the release revision.

## Delivery

Update README and user/admin/module/usage guidance. Retain immutable events/pins when rolling application code back. Create only owned synthetic QA records. Record exact tested and merged revisions and artifacts in the delivery PR. Production rollout and customer UAT remain separate. Stage: implemented; focused SQLite route/store tests, full local test/build/install suite, typecheck, lint and migration validation passed. Actual-browser acceptance and provider CI are pending; final results and exact revisions belong in the delivery PR.
