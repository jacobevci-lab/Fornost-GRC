# Audit engagement planning

Each portfolio audit now has an expandable Audit plan & scope workspace above its readiness gate and requirement register. It captures objective, in-scope processes/assets/units, exclusions, lead, team, methodology/sampling, deliverables, milestones, review period and fieldwork dates. These are engagement-level fields, not copies written to every requirement.

Plans are persisted under the audit ID in existing simple_grc_metadata. No schema migration is required. Dates must be real calendar dates; each range must have both ends and be ordered. Text fields are bounded to 4,000 characters. A single SQL statement verifies the live parent and expected revision before insertion/update. Stale or deleted-parent writes return 409; failed writes retain the local draft. Collapsing the panel retains the draft; reloading a dirty draft requires explicit discard confirmation. Navigating away from the audit does not persist unsaved edits.

GET /api/audits/plan?id=ID: Admin/Editor/Viewer; PUT: Admin/Editor. Installation-local scoped audit read/write grants are enforced. Each saved snapshot records revision, last actor and timestamp. This is not an approval workflow or immutable change history. Deleting an audit makes its plan inaccessible; metadata is retained under its old ID, never reused by a new audit.

Milestones and scope references are text in this release, not a linked task scheduler. Existing requirement-level controls, evidence, readiness checks and findings remain unchanged. Unit tests cover date validation, concurrent initial creation, stale writes, parent isolation/deletion and scoped permissions. Dedicated real-API browser QA verifies save/reload, conflict recovery, draft retention and dark/light desktop/mobile layout.
