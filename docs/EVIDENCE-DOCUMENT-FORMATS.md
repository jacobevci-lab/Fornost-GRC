# Evidence documents and versions

Evidence Library and Evidence History accept the same file policy. Each file must be between 1 byte and 10 MiB. The original bytes are stored and hashed; exports, formulas and document contents are not rewritten.

| Extension | Stored MIME | Admission check | Browser behavior |
| --- | --- | --- | --- |
| PDF | application/pdf | Existing PDF signature check | Inline preview or download |
| PNG, JPG/JPEG, WebP | Corresponding image MIME | Existing image signature checks | Inline preview or download |
| CSV, TSV | text/csv, text/tab-separated-values | Strict UTF-8; no binary control characters | Safe text preview (first 120,000 characters) or download |
| TXT, LOG | text/plain | Strict UTF-8; no binary control characters | Safe text preview (first 120,000 characters) or download |
| JSON | application/json | Strict UTF-8 and valid JSON | Safe text preview (first 120,000 characters) or download |
| DOCX, XLSX | Corresponding Open XML document MIME | Bounded ZIP/OPC package verification | Download |

File extension, declared MIME and content must agree. Empty or generic binary MIME is accepted when the content passes validation, and common browser MIME aliases are normalized. HTML, SVG, executables, legacy DOC/XLS, macro-enabled Office extensions and generic ZIP uploads are not supported.

Office admission checks the central directory, local entries, CRCs, main part, content-type declaration and package relationship. It rejects encryption, ZIP64, macros/ActiveX, embedded binary objects, duplicate or traversing paths, inconsistent headers, unindexed local data and excessive expansion. Limits: 1,024 entries, 12 MiB per expanded entry, 32 MiB expanded total, 256 KiB per XML metadata part and an expansion ratio of 200 above a 1 MiB allowance. Some otherwise valid Office documents (including files with printer or embedded binary data) will be rejected; export those to PDF or remove the unsupported objects.

This is structural admission, not a complete Office schema check or malware scan. Files are not rendered or executed on the server, relationships are not fetched, and files are not extracted to the filesystem. CSV formulas remain intact. Customers needing malware scanning should apply their document scanning policy before opening downloaded evidence.

All downloads require existing evidence access and retain `nosniff`, private/no-store and attachment headers. Only PDF and supported raster images can opt into inline delivery. The evidence workspace separately reads authenticated UTF-8 text/CSV/TSV/JSON bytes and displays them as escaped text, limited to the first 120,000 characters; this does not execute HTML, formulas or scripts. DOCX/XLSX still require download, with no full Office visual preview. The upload route derives file key, MIME, byte count and content hash itself; submitted metadata cannot replace those values or inject a demo preview URL.

A new version atomically updates the library anchor and hash chain, sets the evidence to `İncelemede` / `pending-review`, and does not inherit approval of the previous file. Accepted audit requests retain the exact version and hash reviewed by their independent reviewer. The version form prevents duplicate submissions and record changes while saving.

Validation is covered by `tests/evidence-formats.test.ts`, authenticated real-upload/download cases in `scripts/evidence-document-formats-qa.mjs`, and the pinned-version audit lifecycle in `scripts/audit-request-workflow-qa.mjs`. The browser workflow exercises both themes, Turkish/English, desktop/mobile, and rejection without a new record or version.
