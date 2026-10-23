# Account and team views

**Account and team views / Hesap ve ortak görünümler** is below the existing saved-view panel in Risk, BIA, Assets, Compliance, Controls, Evidence, an audit's Requirements and tests tab, and My Work. The current theme and register controls are retained.

## Using a view

Set the current search, filters and columns, open the panel and choose **My account** or **Team views**. Enter a name, choose **Preview new account view**, inspect its exact criteria and destination, then **Save account view**. Editing the name, source criteria or selection invalidates the preview. Loading the list or previewing does not save or apply anything.

**My account** is private to the signed-in account and available in other browsers/devices using the same installation. Admin, Editor and Viewer can manage their own preferences, including when their module grant is read-only. An administrator cannot read another account's personal views through this API. Existing **Saved views** remain browser-local. To copy one, apply it first, then explicitly save the resulting criteria in the account panel; there is no automatic migration or publication.

**Team views** are installation-wide preferences maintained by Admin and visible only with current access to the corresponding module. They are not a new team-membership or record-sharing mechanism. Names, search text and filter values are shared content: review them in the preview before publishing. Record rows, evidence, audit IDs, exact-record focus, pagination, ordering, approval state and authorization grants are not stored as view criteria. Team history separately records the changing administrator’s email.

Select a view to inspect its saved criteria; **Apply account view** re-reads it and checks that its revision has not changed. Applying uses current authorized records. Audit requirement views retain the currently open audit. My Work stores search, selected module and status, and preserves the current Mine/Organization scope. A My Work view targeting a module the recipient cannot access is omitted from their list and cannot be fetched by ID. A view for all modules uses that recipient's current authorized work sources.

**Preview account view update** captures the current filters, search and columns. **Preview account view rename** changes only the name. **Preview account view removal** requires confirmation and deletes only the preference. A canceled preview changes nothing. Missing filter values remain explicit and do not broaden the result; unsupported definitions fail instead of partially applying.

## Concurrency, limits and recovery

- Names: 1–60 characters; NFKC/case-normalized uniqueness within the module, scope and owner.
- Active capacity: 20 personal views per account/module; 50 team views per module.
- Reads are bounded and explicitly mark incomplete lists. The UI disables actions on an incomplete or failed list.
- UI reads/writes have a 15-second response deadline and no automatic write retry. Navigation invalidates late responses. The library loads on opening its panel.
- Writes use a server revision and a guarded SQL statement; team changes and their immutable history are committed in one transaction. Current active identity, role and the exact module policy are checked again inside the write, together with capacity, ID ownership and revision. Concurrent names are protected by a unique index.
- A failed or uncertain write preserves the name and register criteria, disables further changes and asks for refresh. Inspect the server list before retrying. Stable create IDs and retained deletion tombstones prevent duplicate retries and late resurrection. Deletion clears the active definition’s name/criteria; the minimal tombstone retains ID, module, scope, owner, revision and time. Team version history remains retained, including the removed definition, and is no longer available through this API after removal. Personal preferences have no version history.
- Applying revalidates access and revision. Subsequent team edits do not force-update an already applied register; explicitly select and apply again. This is not a subscription or a historical evidence snapshot.

## Administration and API

The `account_views` and `team_view_versions` tables are initialized idempotently and included in normal application database backups/restores. Personal is an application access boundary, not encryption from database administrators or backup operators. Personal preferences retain only the latest revision. Team definitions have the immutable version history described below; this is a configuration trail, not independent approval or a historical snapshot of business records. There are no notification or delivery-log additions.

`GET /api/views?module=…&scope=personal|team[&id=…]` returns `views`, `complete`, `canManage`, and `limit`; responses are private/no-store. Each view includes its ID, name, scope, module, criteria, revision and update time.

`POST /api/views` accepts `id`, `module`, `scope`, `action` (`save`, `rename`, `delete`, or team-only `restore`), `expectedRevision`, and the applicable `name`/`state`. Team changes may include a `note` of up to 500 characters. Restore requires a retained `sourceRevision` from that exact view and a 3–500-character reason; it rejects client-supplied name/state and reads the original snapshot on the server. A create uses a new `SV-<UUID>` ID and empty expected revision. JSON is limited to 32 KiB; state is strictly checked against the shared UI/server schema. Unknown fields and saved authorization/focus data are rejected. Scoped users may call the endpoint but the handler enforces live per-module access, account ownership and Admin-only team mutations; a Viewer can never use this endpoint to mutate business records.

Vendor workspace views, group-specific publication, default/automatic application, saved sort order, scheduled exports, personal history and independent approval of shared definitions remain separate scope.

## Team version history and restore

In **Team views**, select an existing definition and choose **Load version history / Sürüm geçmişini yükle**. Inspect the version, action, timestamp, administrator email, optional change reason and exact saved name/criteria. Viewing history never changes current register filters. Current module access applies to both the active definition and the historical snapshot; My Work versions targeting inaccessible modules are omitted and exact revision reads are denied.

An Admin can select an earlier version, enter **Change reason / Değişiklik gerekçesi**, choose **Preview version restore / Geri yüklemeyi önizle**, compare it with the current saved criteria, and **Confirm version restore / Sürümü geri yüklemeyi onayla**. Restoring copies the original name, search, filters and columns into a new current revision. It records the source revision and never overwrites an older event. It does not apply filters to the open register or change any business records; explicitly use **Apply account view** afterward if desired. Changing the reason or selection invalidates the preview. Cancel writes nothing. A name now used by another view must be resolved before restoring that old name.

Save, rename, removal and restore append immutable snapshots in the same database transaction as the current definition. A history failure rolls back the whole operation. Current identity, role, policy, name uniqueness and expected revision remain guarded. A concurrent update keeps the local reason and draft, disables writes and requires refresh, reselection and a fresh preview. There is no automatic retry. A failed history read removes the old preview and requires refresh.

Existing installations need no manual conversion. An untouched legacy definition has no claimed historical author or version trail. Its first successful team change captures the preceding definition as a **baseline**, with its existing timestamp and an explicitly unknown author, then appends the new event. Personal views remain private preferences with no history.

The UI lists accessible records among the latest 50 versions; an explicit notice indicates when older versions exist. All versions remain in the database, and authorized exact-revision reads may retrieve an older one. No retention purge is introduced. A removed view cannot be restored or inspected through the view API; the tombstone prevents resurrection. Historical team names, criteria, reasons and actor email remain in database backups, so treat publication text as shared retained content.

`GET /api/views?module=…&scope=team&id=…&history=1[&revision=…]` returns `current`, `selected`, `history` and `historyComplete`. History for personal scope is rejected. The current definition, exact snapshot, identity and module-policy check are read in one database transaction. Responses are private/no-store. History loads only on explicit request, with the existing 15-second deadline and navigation cancellation.

## Validation

SQLite regression tests exercise account isolation, all supported schemas, team/module enforcement, My Work visibility, immutable ownership boundaries, normalized names, tombstones, capacity and concurrent role/status/identity/grant/revision/name changes. Browser QA uses separate browser contexts, a scoped Viewer, every entry point, preview invalidation, duplicate click suppression, conflict recovery, current revision checks on apply, confirmed removal, failure recovery and TR/EN light/dark desktop/mobile accessibility. Team history tests additionally cover immutable snapshots, legacy baseline capture, exact-version restoration, transaction rollback, role/policy/revision races, historical My Work access and bounded history. Browser QA exercises history and restore through all eight entry points, reason/preview invalidation, concurrent administrator changes, duplicate submission suppression, read failure recovery and history/restore accessibility in both languages/themes/sizes. Synthetic active preferences, audit and account are cleaned up; the isolated test database retains the expected immutable team events.
