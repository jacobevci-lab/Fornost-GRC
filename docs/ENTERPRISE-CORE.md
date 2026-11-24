# Enterprise Core

The group security team manages a company hierarchy inside one installation. Entity managers and contributors work on explicitly granted organizations subject to their existing platform role and module permissions. The consolidated register belongs to group users. The scope workspace must authorize reads and changes on the server, including requests submitted directly by record ID. Existing record identities, evidence versions and workflow decisions remain authoritative.

Acceptance covers two subsidiaries, a multi-entity grant, direct access outside a grant, an unassigned account, concurrent scope changes and an unchanged legacy installation. Directory configuration and provisioning previews must distinguish metadata validation from a completed sign-in. Cross-framework credit requires an implemented control and current evidence independently approved for the exact version. Risk owners may omit financial estimates; executives see measured exposure and estimate counts separately for each currency.

## Operating the hierarchy

Use Identity & Access → Entity scopes to create the company structure, assign users and move existing records. A group administrator must already be a platform administrator. A Group CISO receives a read-only consolidated view. Entity grants include descendants and intersect with module permissions. A user without an entity grant loses access to the nine registers once the first child entity is added. Assign grants before broad rollout. Legacy records retain their existing keys, codes and evidence history and default to the holding.

The header scope selector reloads the workspace on a change. A selected entity opens a register that supports scoped working notes and editable native business fields according to record state, ownership and platform permission. It also supports financial estimates on risks. Group administrators can reassign records from the consolidated register. Scoped sessions deny unrelated aggregate, export, workflow and search endpoints. Workflow decisions continue to use the original independent review and evidence gates.

## Directory preflight

Configure OIDC discovery or SAML IdP metadata in Identity & Access → Enterprise SSO and SCIM. Supply SAML metadata as XML or an HTTPS URL. Department and group rules map to entity roles. The token is returned once. Rotation immediately replaces the stored SHA-256 digest. The authenticated POST endpoint /api/scim/v2/preview accepts a SCIM User resource and returns a simulation with the proposed role and entities. Conflicting roles return a conflict in the preview. This flow never creates an account or establishes an IdP login.

## Evidence and financial coverage

Framework posture is calculated from the implemented control and the independently approved, current evidence version, including its anchored hash chain. A new unreviewed version, expiry, withdrawal or a partial mapping cannot silently sustain full credit. Open posture views refresh on window focus.

FAIR-Lite uses an annual probability of one loss event from 0 to 100 percent. Severity uses the beta-PERT mean (minimum + 4 × most likely + maximum) / 6. The product is rounded once per risk to the nearest minor unit. Reports show measured risk counts and a separate total for each currency. Missing estimates do not count as zero exposure.
