# Continuous Assurance next increment

After the Connected GRC production validation gate is clean, the next implementation increment is Evidence Automation integration into the Connected GRC graph.

Planned read-only relationships:

- Evidence Automation rule → Control (`automation-control`)
- Automation finding → Rule (`automation-rule`)
- Automation finding/run → Evidence where a stable evidence reference exists (`automation-evidence`)

This keeps the product direction on one connected GRC data model instead of adding a standalone module. The first implementation should remain read-only in Connected GRC; workflow mutations stay in the authoritative Evidence Automation and Findings/CAPA modules.
