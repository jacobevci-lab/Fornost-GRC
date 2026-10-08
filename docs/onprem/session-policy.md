# Application session lifetime

System Settings → General Settings → Maximum Local Session Duration controls the
absolute lifetime of application-issued sessions. Default: 30 minutes; allowed:
5–720 minutes. This is not an idle timer: background polling and normal activity
do not renew the deadline.

The server checks both the saved issuance expiry and the current policy, measured
from the original sign-in time. Reducing the setting therefore applies to existing
sessions on their next request. Saving settings also caps their persisted expiry
atomically, so a subsequent increase cannot revive a shortened session. Increasing it only grants longer lifetimes to new
sign-ins; existing issuance deadlines remain intact. Authentication cookies carry
the same lifetime as newly issued server sessions. Expired sessions are rejected
and removed server-side, even when a client retains the cookie.

Existing installations previously issued eight-hour sessions. After this update,
those sessions also obey the saved duration, or the 30-minute default if no policy
has been saved. Users whose sessions already exceed the limit must sign in again.
The browser checks authentication every minute and on window focus, returning to
the sign-in screen when the server no longer accepts its session.

The policy covers local login, bootstrap-created and demo sessions. Trusted upstream
identity has its own identity-provider lifetime and is not represented by these
session records. Configure SSO sign-in frequency at the provider.

A missing configuration row or a legacy row without this field uses the 30-minute
default. Corrupt JSON, invalid values or invalid timestamp data fail conservatively:
invalid policy uses the five-minute minimum, while invalid session timestamps deny
access. Database errors do not fall back to a longer lifetime. Session-policy changes
continue to use the administrator-only settings endpoint and settings audit trail.

Isolated runtime QA exercises policy reduction, non-extension, cookie deadlines,
malformed state and browser return to sign-in. No production sessions are altered
by these tests.

## Bounded session maintenance

Each new local session removes at most 100 expired records, oldest expiry first.
Expiry and user indexes support cleanup and administrator session revocation.
Migration `0083_session_lookup_indexes.sql` adds these indexes to existing data;
the runtime compatibility path also creates them for older installations.
Large expired backlogs drain across subsequent sign-ins. Remaining expired rows
cannot authenticate: every request still checks the session deadline and policy,
and a presented expired session is deleted individually. Cleanup failures still
fail session creation; they are not silently reported as a successful sign-in.

This limits cleanup work, but does not establish the root cause of the intermittent
production login timeouts observed during QA. Index creation on a large existing
table is a one-time deployment cost.

## Administrator session termination

Identity & Access → Local User Accounts → Session security provides **End All Local
Sessions** for an individual account. The operation deletes all of that user's
local session records and records the administrator's action in access history in
one transaction. Account status, role, password and module grants remain unchanged;
the user may sign in again. Use account disablement when further sign-in must be
blocked. External identity-provider sessions are outside this action's scope.

Only administrators may call `DELETE /api/users/sessions` with a single `userId`.
The endpoint applies the usual same-origin and authentication checks, a bounded
4 KiB JSON body, and target existence validation. It does not return session tokens
or hashes. Requests with no matching sessions still record the administrator's
explicit action. A failed or timed-out request must not be presented as success:
check access history or retry. Revoking one's own local sessions returns that
browser to sign-in; other browsers detect revocation on their next authenticated
request or regular authentication check.
