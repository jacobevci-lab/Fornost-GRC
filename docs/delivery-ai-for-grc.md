# AI for GRC delivery

## Outcome and acceptance

Consolidated, fully authorized GRC users can run a preliminary evidence review, prepare a customer questionnaire and analyze a vendor assurance report. Every result remains a draft until human review. No AI route approves evidence, closes a finding, or activates a control. Existing scoped accounts remain excluded from consolidated analysis.

The administrator selects offline rules, a private Ollama/vLLM endpoint or customer-owned Azure OpenAI/Bedrock. Offline is the default for the new workspace. An explicitly configured privacy route also overrides the legacy provider chain; local mode cannot fail over to cloud. Cloud requires retention attestation for the selected endpoint/model; BYOK is not itself a retention guarantee. Keys are encrypted, secrets are always redacted, PII masking is selectable, and call receipts contain hashes and metadata instead of document bodies.

Evidence review pins the stored file hash, version chain and control context. Four dimensions report observed dates, scope, configuration state and missing information. OCR runs with self-hosted assets in the browser and is identified as an unverified transcription. It never upgrades evidence approval. RFP retrieval admits only published approved policies, active controls and independently approved current evidence; source changes invalidate approval/export. Vendor extraction keeps source quotations and missing fields, and conversions use the native finding/control lifecycle with explicit human assignments.

## Validation

Domain tests cover routing boundaries, redaction, negative configuration evidence, grounded references, stale sources and spreadsheet injection. Integration checks cover persistence, authorization, duplicate conversions, native SoD and no automatic approval. Typecheck, migrations, build and relevant regression tests are required. TR/EN, light/dark, narrow-screen layouts and busy/error/empty states must be reviewed.

## Operational limits

Local mode requires the Fornost deployment and model endpoint to be inside the customer's network, with private endpoint access explicitly enabled. Cloudflare-hosted Fornost is not an on-prem deployment. Image OCR and sparse/scanned PDF results require human verification; no content is fetched from document hyperlinks. Heuristic confidence describes extraction/retrieval coverage, not a statistical guarantee. Provider-specific cloud retention must be configured by the customer (Azure modified abuse monitoring / AWS account or project retention policy).

References: https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html ; https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy ; https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html ; https://learn.microsoft.com/en-us/azure/foundry/openai/latest
