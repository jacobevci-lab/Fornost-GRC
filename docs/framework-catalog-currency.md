# Framework catalog revision 2026-10-05

This revision distinguishes verified publication editions from complete content coverage. It is not a claim that every advertised regulation is fully implemented or current.

- NIST CSF 2.0: all 106 Core subcategory IDs, across 22 categories and six functions, with original Turkish summaries. Source: https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf (Appendix A).
- PCI DSS 4.0.1: 12 principal requirement summaries. Removed generated subrequirement references that could incorrectly attribute topics to official clauses. No full testing procedures or subrequirements. Source: https://www.pcisecuritystandards.org/document_library/.
- ISO/IEC 27701:2025, 27018:2025 and 27017:2026: official edition metadata verified via ISO publication pages. New selections use clearly labelled LOCAL preparation topics, not migrated legacy clause numbers. Licensed full-text mapping remains incomplete.
- CIS v8.1: 18 principal control summaries, not the full 153 safeguards.
- KVKK: selected obligations updated for cross-border transfer mechanisms and Article 9(5)'s five-business-day standard-contract notification. Local operational topics no longer masquerade as numbered legal instruments. Source: https://www.kvkk.gov.tr/Icerik/8170/Yurt-Disina-Kisisel-Veri-Aktariminda-Kullanilacak-Standart-Sozlesmelerde-Dikkat-Edilmesi-Gereken-Hususlara-Iliskin-Kamuoyu-Duyurusu.
- ISO 27001: existing Annex A headings only; management-system clauses and the 2024 amendment remain incomplete. SOC2: generic Security/Availability/Confidentiality content only. Other frameworks display unverified/partial coverage rather than a blanket current/complete claim.

Audit GET no longer synchronizes templates into historical audits. Existing records, evidence, references and statuses remain unchanged. New rows carry catalogRevision=2026-10-05. Create a separate audit to assess the new catalog; no silent cross-version evidence migration is attempted. The catalog notice describes the currently available template, not the historical audit's item count.

Legacy ISO keys are retained for compatibility, but new audit choices use current editions. Compliance retains unknown saved single-framework values so opening an existing form does not silently choose a different edition.

Source links and coverage notices appear in new audit selection, selected audit detail, and compliance framework fields. Source review dates are manual verification dates, not automatic update guarantees.

## Full open-content packs and import — 2026-10-05 follow-up

Shipped full active OSCAL entries from the pinned NIST repository commit recorded in `app/nist-catalog-manifest.json`:

| Pack | Active entries | Withdrawn entries excluded |
| --- | ---: | ---: |
| SP 800-53 Rev. 5, release 5.2.0 | 1014 | 182 |
| SP 800-171 Rev. 3 | 97 | 33 |
| SP 800-172 Rev. 3 | 103 | 12 |
| SSDF 1.1 / SP 800-218 | 61 (practices and tasks) | 0 |

Requirements retain official English statements, available guidance and assessment procedures. Organization-defined parameters are explicitly labelled, including nested selections; they are not assigned arbitrary values. NIST's source-content release version is separate from the publication revision. These catalogs are CC0; attribution and license are included. No government endorsement is implied. Generator scripts and source checksums support reproduction.

OWASP ASVS 5.0.0 includes all 345 requirements from release commit `5cf9b032440be53ce345ab3c130fda46ba1ce7a2`, with versioned reference IDs and level metadata. The converted content remains CC BY-SA 4.0; descriptions are unchanged. Attribution, license URL, source and transformation notice are included both in the repository and displayed guidance.

SOC 2 now includes 61 reference/topic entries across all five categories (33 common criteria, 3 availability, 2 confidentiality, 5 processing integrity, 18 privacy). Type I uses point-in-time design/implementation wording; Type II uses period-based operating-effectiveness wording. These short topics are not the full licensed criteria or 2022 points of focus. SOC 1 requires organization-specific financial-reporting control objectives; it must not be populated with SOC 2 criteria.

ISO 27001 includes 30 management-system subclause topic summaries plus 93 Annex A controls (123 entries). Climate considerations from Amd 1:2024 are represented in 4.1/4.2. This expands reference coverage, not licensed normative-text coverage. Source: ANAB's 2022 comparison and the ISO/IAF 2024-02-22 communiqué.

### Authorized customer catalogs

Audit creation accepts a JSON file up to 2 MB / 2,000 unique requirements. Required fields are name, version, HTTPS source and requirements (ref, title, category, statement); guidance/assessment are optional. The operator confirms usage rights in the UI. A client-supplied rights flag is not treated as independent license verification. Content is stored only in the installation's audit snapshot, not added to the product's distributed catalog. Upload replaces, rather than merges with, the selected built-in template. The UI shows imported provenance and does not label customer content vendor-verified or complete.

Creation of the audit, provenance and every requirement is one D1 batch transaction with at most 75 bound parameters per requirement insert statement. This avoids partial audits and per-request query limits for large packs. Read-time record-code allocation uses multi-row statements. Large deletion archives are chunked to stay below D1's string limit and remain transactional; record-code rows are also removed. Archive manifests now hold `requirementsChunkCount` and `requirementCount`, with chunks under `audit_archive_<id>_requirements_<index>`; original records are retained in those chunks.

Long authoritative statements survive record edits. Requirements are collapsed by default with an explicit details disclosure. GRC record reads expose a keyset `nextCursor`; the main workspace follows every page instead of silently hiding records after 5,000. Third-party API consumers must follow `nextCursor` as well.

### Outstanding content, not represented as complete

Full licensed ISO catalogs (including 27701:2025, 27017:2026, 27018:2025, 22301 and 42001), CIS safeguard text, SOC criteria/points of focus, PCI subrequirements, COBIT and CSA full texts are not bundled. CIS explicitly requires appropriate commercial usage rights for product distribution: https://www.cisecurity.org/cis-controls-supporters . Authorized content can now be imported without further software development. Legal applicability and secondary regulations for DORA/NIS2/GDPR/KVKK and sector-specific BDDK/TCMB obligations still require separate content verification. No fabricated clause numbers or completeness claims have been added to fill those gaps.
