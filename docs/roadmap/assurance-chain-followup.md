# Connected assurance chain follow-up

The Connected GRC Assurance view now distinguishes the latest control result from outstanding lifecycle work. A healthy result does not close an open finding or remediation. A missing control-library edge marks the chain broken even when the last test was healthy.

Every open finding is checked for its own remediation edge, and every open remediation for its own risk edge. An unrelated valid branch no longer masks missing links. Closed historical work is retained in the graph without demanding new remediation or risk links. Date-only deadlines use the shared whole-UTC-day convention and reject impossible calendar dates.

A collapsed follow-up list shows affected rules, translated reasons and contextual rule navigation. Broken chains appear first, then overdue work; rendering starts with 12 items and supports continuation. The list is withheld when source coverage is incomplete, using the existing retry state. No record status, risk score or approval is changed by this read-only assessment.

Validation: regression tests cover healthy-but-open work, orphaned rules, multiple branches, closed history and end-of-day boundaries. Isolated browser QA exercises the list in TR/EN, dark/light and desktop/mobile, and verifies unavailable-source recovery. Existing graph navigation and full CI checks remain required.

Boundary: this is an assessment of the loaded graph. It does not certify every declared reference, freeze concurrent edits or validate evidence bytes. Source completeness and the dedicated unresolved-reference view remain authoritative for those separate dimensions.
