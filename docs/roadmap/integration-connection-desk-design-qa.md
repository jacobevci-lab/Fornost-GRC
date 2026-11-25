# Connection desk design QA

Target: the approved Connection Desk image, with guided setup and separate activity view. Existing cream/teal theme tokens, global navigation, and TR/EN typography are retained.

Accepted scope adaptations:
- The current server supports one ticketing profile. Show that real profile rather than the reference image's three illustrative connections.
- Connection history shows the latest 100 recorded events. It is not an inbound synchronization/retry queue.
- SSO, notifications and evidence use their existing specialist modules.
- Setup is an inline four-step workspace with a connection summary. Read-only provider checks never create a test ticket.

Initial validation (2026-11-11): TypeScript, changed-file ESLint, provider contract unit tests and production build pass. The managed browser reached the fresh local application's setup screen. Authenticated interaction/layout verification is pending the isolated CI browser job, which creates a temporary QA administrator through the existing bootstrap flow and retains screenshots.

Release gate: do not merge until the connection lifecycle browser job and repository CI pass. Compare its desktop/mobile screenshots with the approved reference before marking visual QA complete. Real third-party credentials are unavailable; simulated access checks do not certify a live provider connection.
