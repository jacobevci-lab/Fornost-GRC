# Exact CAPA contextual navigation

Connected GRC, My Work and other contextual links now resolve the exact canonical finding ID or code through the authorized register API. The native Findings component owns focus; the legacy DOM bridge does not select table text in this workspace.

The component resets stale filters, cancels old reads, opens the unique record and displays a selected-record banner. Missing or ambiguous references do not open another finding. A single action restores the full register. Repeated navigation to the same record reloads it. Workflow mutations and existing roles remain unchanged.

Validation adds real SQLite ID/code/prefix/collision cases and browser contextual navigation plus missing-reference recovery. This does not remove bounded legacy graph/inbox source loading; it ensures that a supplied canonical reference is resolved without relying on the first page or text matching.

UI transition requests now include the displayed updatedAt version. A stale or malformed explicit version returns 409 before state or audit changes; existing transactional optimistic guards still handle a later race. Legacy integrations that omit the field remain compatible and retain their previous server-read guard. A contextual record auto-opens only for a navigation request, so post-decision refresh does not reopen a dismissed dialog.
