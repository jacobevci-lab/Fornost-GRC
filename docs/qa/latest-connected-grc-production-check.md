# Latest Connected GRC production check

Source run: Full Production QA `35580512125` against main commit `9214103e597cfc7d82ec4b1ca0695842bcc121b2`.

Confirmed production state before this QA semantic correction:

- 7/7 Connected GRC source endpoints returned HTTP 200.
- UI reached `7/7 CANLI KAYNAK`.
- Relationship register rendered 49 relationships.
- First-party console errors: 0.
- Page errors: 0.
- First-party failed requests: 0.
- The remaining domain-projection failures were caused by counting auxiliary API arrays as graph-projectable records.
- The language check used a broad selector and failed to target the actual language switch deterministically.

This branch corrects those validation semantics; post-deployment Full Production QA remains the authoritative acceptance gate.
