# Post-merge Connected GRC checklist

After this branch reaches main and the production smoke test passes, move the dedicated Full Production QA branch to the new main commit. The run must confirm 7/7 live sources, zero first-party runtime failures, deterministic English switching, and no adapter-backed domain projection failures before the gate is considered clean.
