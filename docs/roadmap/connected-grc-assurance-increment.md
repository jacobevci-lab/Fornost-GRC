# Connected GRC assurance increment

Next implementation after the production QA gate is clean:

- Add Evidence Automation as an eighth Connected GRC live source.
- Project automation rules, runs/findings where traceable, and stable evidence references.
- Resolve automation rule → control, automation finding → rule, and automation finding/run → evidence relationships.
- Extend coverage scoring without introducing a second source of truth or mutation path.
- Keep remediation actions routed to the authoritative Evidence Automation, Evidence Library, Control Library, or Findings/CAPA modules.
