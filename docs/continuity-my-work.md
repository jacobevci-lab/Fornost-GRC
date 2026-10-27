# Continuity responsibilities in My Work

Use **My Work → Work queue module → Continuity** to see continuity responsibilities in the existing work queue. **Mine** matches your exact assigned identity. Admins can choose **Organization**. Search, due/status filters, saved views, sorting, pagination and CSV use the selected scope and module. Work status and its explanation remain visible on desktop, tablet and phone, including cancelled and retired work.

| Record and state | Assigned responsibility | Date / completion |
| --- | --- | --- |
| Draft plan | Owner and crisis lead; independent reviewer receives approval work. Owners see it under Waiting for others. | No approval deadline is inferred from the future review date. |
| Approved plan | Owner/crisis lead still need to activate it; source permissions also allow Admin. | Still open, with no invented activation deadline. |
| Active plan | Owner and crisis lead retain the review responsibility. | Saved plan review date. |
| Planned exercise | Assigned facilitator. | Scheduled exercise date. |
| Open improvement gap | Owner and independent reviewer. | Saved gap due date. No submission/verification stage is inferred. |
| Retired plan, completed/cancelled exercise, closed gap | Removed from active work. | Recent-completion view uses the actual retirement, completion, cancellation event or closure time. Legacy missing timestamps are not replaced with creation dates. |

Choose a row to open the exact plan, exercise or gap in **Business Continuity & Resilience**. Existing source permissions and independent approval/retest rules still govern every action. My Work does not grant mutation rights. After an action, return to My Work or choose **Refresh**. Active plans remain review responsibilities; a scheduled review date is not proof that a review occurred.

## Read scope and recovery

The continuity queue reads metadata through the existing authenticated `/api/continuity?view=work` route. It excludes plan narratives, exercise observations, evidence files/pins and decision-event details. It returns up to 2,000 plans, 2,000 exercises and 2,000 gaps, with active work prioritized. An additional lookahead row distinguishes an exact-size list from overflow. A source-parent relationship outside those bounds makes the combined queue incomplete; records are not silently asserted to be a full organization inventory.

Full-access Admin, Editor and Viewer accounts retain their existing read access. Scoped accounts cannot read enterprise continuity datasets; this delivery does not add scoped continuity grants. A denied, failed or malformed enterprise source is removed from the loaded queue until a successful refresh. The existing incomplete-source warning disables CSV. A bounded response may still show verified loaded rows, with export disabled. Empty verified results remain distinct from source failures.

No business data migration or new configuration is required. Cancellation time is read from the existing immutable cancellation event. Missing or invalid terminal times never count as recent completion; future times are excluded. There is no new reminder, email log, approval stage, external-auditor access or automatic recurrence in this delivery.
