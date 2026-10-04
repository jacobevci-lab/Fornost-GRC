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
