# Personal saved register views

Use **Saved views** below the register toolbar in Risk Assessment, BIA, Asset Inventory, Compliance Management, Control Library, Evidence Library and an audit's **Requirements and tests** tab. Choose search text, exact-value filters and visible columns, enter a name, then select **Save new view**. Up to 10 views are retained per user and module in this browser.

Select a view and choose **Apply view** to apply its search, filters and visible columns to current accessible records. Loading the page does not automatically apply a named view. The existing per-tab search/filter context continues independently. Audit requirement views are reusable across audits; applying one keeps the current audit and resets pagination through the existing filter-change behavior. An exact-record focus cannot be saved; applying a saved view exits that temporary focus. The view does not save a record ID, audit ID, page number, sort order, approval state or a snapshot of record rows.

**Replace selected view** captures current search, filters, columns and the entered name. **Rename view** changes only the name. **Delete view** requires confirmation and removes only the saved preference, never business records. Names must be 1–60 characters and unique after normalization within the user's module. Filters whose values are no longer in the current list remain visible as “Not in current list”; they do not silently broaden the result set. Unsupported filter/column definitions cause an explicit error rather than partial application.

## Storage and access boundaries

Views use browser local storage keyed by user ID and module. They survive refresh and browser restart while that browser profile's site data remains. They are not server-backed, shared with colleagues, exported, synchronized between devices or included in application database backups. Clearing site data removes them. Search text, filter values and view names can contain business terms; shared browser profiles and administrators with local browser access can inspect local storage. This is a user-experience separation, not encryption or a security boundary against local access.

View operations do not call business-record mutation APIs. Viewers may save their own preferences; this grants no write or additional read permission. Applying a view uses the current module's existing access-controlled source. Saving or applying a view does not alter record status, ownership, evidence approval or closure.

Storage/quota errors are shown explicitly and do not report a successful save. Malformed stored data is not silently overwritten. Cross-tab storage events refresh the list; if a selected view changes, applying/replacing/renaming/deleting is blocked until it is reselected. An unsaved name draft remains visible. Writes compare the observed storage value before writing. Browser local storage has no transactional compare-and-swap: this is best-effort stale-write detection, not a server-grade concurrency guarantee for simultaneous writes.

## Validation

Domain tests cover criteria and column ordering, lifecycle operations, per-user/module keys, stale writes, normalized names, bounds, invalid data, unsupported fields and storage failures. The isolated browser suite exercises actual register filtering, reload persistence, rename/replace/delete, cross-tab changes, temporary record focus, missing filter values, quota recovery, account switching, Viewer usage, all seven register entry points, accessibility and TR/EN desktop/mobile layouts. Synthetic business records and the QA account are cleaned up afterward.

Vendor Management uses its own workspace filters and is not included in this increment. Saved team views, server synchronization, default views, sort persistence and scheduled exports remain separate work.
