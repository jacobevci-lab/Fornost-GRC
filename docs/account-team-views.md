# Account and team views

**Account and team views / Hesap ve ortak görünümler** is below the existing saved-view panel in Risk, BIA, Assets, Compliance, Controls, Evidence, an audit's Requirements and tests tab, and My Work. The current theme and register controls are retained.

## Using a view

Set the current search, filters and columns, open the panel and choose **My account** or **Team views**. Enter a name, choose **Preview new account view**, inspect its exact criteria and destination, then **Save account view**. Editing the name, source criteria or selection invalidates the preview. Loading the list or previewing does not save or apply anything.

**My account** is private to the signed-in account and available in other browsers/devices using the same installation. Admin, Editor and Viewer can manage their own preferences, including when their module grant is read-only. An administrator cannot read another account's personal views through this API. Existing **Saved views** remain browser-local. To copy one, apply it first, then explicitly save the resulting criteria in the account panel; there is no automatic migration or publication.

**Team views** are installation-wide preferences maintained by Admin and visible only with current access to the corresponding module. They are not a new team-membership or record-sharing mechanism. Names, search text and filter values are shared content: review them in the preview before publishing. Record rows, evidence, audit IDs, exact-record focus, identities, pagination, ordering, approval state and authorization grants are not stored.

Select a view to inspect its saved criteria; **Apply account view** re-reads it and checks that its revision has not changed. Applying uses current authorized records. Audit requirement views retain the currently open audit. My Work stores search, selected module and status, and preserves the current Mine/Organization scope. A My Work view targeting a module the recipient cannot access is omitted from their list and cannot be fetched by ID. A view for all modules uses that recipient's current authorized work sources.

**Preview account view update** captures the current filters, search and columns. **Preview account view rename** changes only the name. **Preview account view removal** requires confirmation and deletes only the preference. A canceled preview changes nothing. Missing filter values remain explicit and do not broaden the result; unsupported definitions fail instead of partially applying.

## Concurrency, limits and recovery

- Names: 1–60 characters; NFKC/case-normalized uniqueness within the module, scope and owner.
- Active capacity: 20 personal views per account/module; 50 team views per module.
- Reads are bounded and explicitly mark incomplete lists. The UI disables actions on an incomplete or failed list.
- UI reads/writes have a 15-second response deadline and no automatic write retry. Navigation invalidates late responses. The library loads on opening its panel.
- Writes use a server revision and a single guarded SQL statement. Current active identity, role and the exact module policy are checked again inside the write, together with capacity, ID ownership and revision. Concurrent names are protected by a unique index.
- A failed or uncertain write preserves the name and register criteria, disables further changes and asks for refresh. Inspect the server list before retrying. Stable create IDs and retained deletion tombstones prevent duplicate retries and late resurrection. Deletion clears stored name/criteria; the minimal tombstone retains ID, module, scope, owner, revision and time.
- Applying revalidates access and revision. Subsequent team edits do not force-update an already applied register; explicitly select and apply again. This is not a subscription or a historical evidence snapshot.

## Administration and API

The `account_views` table is initialized idempotently and included in normal application database backups/restores. Personal is an application access boundary, not encryption from database administrators or backup operators. These operational preferences retain the latest revision, not an immutable version history. There are no notification or delivery-log additions.

`GET /api/views?module=…&scope=personal|team[&id=…]` returns `views`, `complete`, `canManage`, and `limit`; responses are private/no-store. Each view includes its ID, name, scope, module, criteria, revision and update time.

`POST /api/views` accepts `id`, `module`, `scope`, `action` (`save`, `rename`, `delete`), `expectedRevision`, and the applicable `name`/`state`. A create uses a new `SV-<UUID>` ID and empty expected revision. JSON is limited to 32 KiB; state is strictly checked against the shared UI/server schema. Unknown fields and saved authorization/focus data are rejected. Scoped users may call the endpoint but the handler enforces live per-module access, account ownership and Admin-only team mutations; a Viewer can never use this endpoint to mutate business records.

Vendor workspace views, group-specific publication, default/automatic application, saved sort order, scheduled exports and governed historical view approvals remain separate scope.

## Validation

SQLite regression tests exercise account isolation, all supported schemas, team/module enforcement, My Work visibility, immutable ownership boundaries, normalized names, tombstones, capacity and concurrent role/status/identity/grant/revision/name changes. Browser QA uses separate browser contexts, a scoped Viewer, every entry point, preview invalidation, duplicate click suppression, conflict recovery, current revision checks on apply, confirmed removal, failure recovery and TR/EN light/dark desktop/mobile accessibility. Synthetic preferences, audit and account are cleaned up.
