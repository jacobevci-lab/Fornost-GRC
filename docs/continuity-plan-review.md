# Periodic continuity plan review

Open an existing plan from **My Work → Continuity** or **Business Continuity & Resilience**, then choose **Plan details and reviews**. The workspace shows the current plan, recovery objectives, dependencies, strategy, communication arrangements, assigned people and retained periodic reviews. Full-access Admin, Editor and Viewer accounts can read it under existing module permissions; scoped accounts cannot read enterprise continuity records.

## Record a review

1. The active plan's assigned independent Admin reviewer opens the plan and inspects its current content. The original creator, owner and crisis lead cannot record the review, even when they are Admins.
2. Choose **Record periodic review**. Enter a rationale of 20–2,000 characters and an explicit next review date strictly after both today (UTC) and the existing review date.
3. Confirm the existing plan's continued suitability, then choose **Record review**.
4. The next date, retained review and continuity event commit together. Return to My Work or refresh it to see the updated date. Active plans appear for the assigned reviewer as well as their owner and crisis lead.

This confirms the existing plan's continued suitability. It does not edit the strategy, objectives or assignments, close improvement gaps, verify exercise outcomes or certify recovery effectiveness. If changes are required, do not attest suitability merely to clear an overdue date. Structural plan editing/reapproval is separate work.

## Conflicts and recovery

The server checks the exact plan revision and full source content together with the acting account's current identity, role, active status and policy at commit. If another action changes the source, the review is rejected without partial changes. **Refresh plan** preserves the rationale and date. Inspect the current details, choose **Use current plan version**, and confirm suitability again before saving.

If the write result cannot be confirmed, retry the same draft. Its stable request identity returns the original recorded decision without duplicating it. A successful refresh may instead offer **Use recorded result**. Changing the same request's recorded content is rejected. Drafts survive failed reads/writes while this workspace remains open; closing it or reloading the page discards an unsaved draft. If that happens after an uncertain write, inspect retained history before starting a new decision.

## Retention and administration

Each record retains the reviewer's identity and time, rationale, previous/next date and an immutable snapshot of the plan they inspected. The screen displays the latest 20 reviews and explicitly indicates additional retained decisions. Expand **Reviewed plan snapshot** to inspect the historical content. A subsequent date change or retirement does not rewrite earlier reviews. Unreadable snapshots are marked unavailable rather than represented as verified history.

Migration `0098_continuity_plan_reviews.sql` adds the review table, index and update/delete protection. Runtime initialization supports existing installations. Include the table in normal database backups. A code rollback can leave this additive table intact and does not revert already accepted review dates. No new service, reminder, email setting, scoped grant or automated recurrence is introduced. The snapshot is a retained business decision, not a digital signature or an evidence-file integrity certificate.
