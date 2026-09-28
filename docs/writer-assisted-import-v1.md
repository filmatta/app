# Writer assisted import V1

This milestone adds an optional assisted path on top of the existing deterministic TXT, pasted-text, and FDX importer. The canonical Writer document and its seven block kinds are unchanged.

## Runtime configuration

The feature fails closed unless all three server-only variables are present in the Preview environment:

- `WRITER_AI_IMPORT_ENABLED=true`
- `OPENAI_API_KEY`
- `WRITER_AI_IMPORT_QA_USER_IDS`, a comma-separated allowlist of Supabase user UUIDs

The key is read only by the Node.js route. It is never exposed through a `NEXT_PUBLIC_` variable. The initial provider configuration is OpenAI Responses API, model `gpt-5.6-luna`, reasoning effort `none`, strict Structured Outputs, `store: false`, no tools, no Files API, and no provider-side retry.

## Data flow and retention

The browser keeps the selected file or pasted text in memory and sends it only after the user chooses **Importar y organizar**. The server validates limits, extracts with the existing parser, applies deterministic classifications, and sends only the necessary bounded batches to OpenAI. The model returns block references, proposed kinds, evidence ranges, and short observations; it never returns the rewritten script. The final document is rebuilt only from original extracted fragments and passes a separate loss/order/duplication check before creation.

FILMATTA does not persist another copy of the source file or source text. It stores operation hashes and accounting, per-batch structured checkpoints, and the resulting identities, evidence, observations, and explicit user decisions. Canonical Writer content remains in `writer_scripts`. Existing local observations continue to work; imported analysis is loaded separately and deduplicated by evidence fingerprint. Evidence whose block text hash no longer matches is not shown and does not trigger another model call.

## Safety limits

- 1 successfully completed assisted import per account, without automatic renewal.
- 3 new operations per account in 24 hours.
- 1 active operation per account.
- 30,000 words, 80,000 source tokens, and 2 MiB per source.
- 24 provider calls and 2 concurrent calls per operation.
- US$0.20 maximum reserved/actual cost per operation.
- US$2.00 global QA ledger across accounts and deployments sharing Supabase Test.

Reservations, settlement, checkpoints, final document creation, analysis persistence, and Free-right consumption are enforced in PostgreSQL functions available only to `service_role`. Ambiguous provider timeouts remain blocked as `uncertain`; they are not retried blindly. Definite failed batches can be explicitly resumed without paying again for completed checkpoints.

## Added dependencies

- `openai@7.23.0`: official server-side Responses API client.
- `js-tiktoken@1.0.21`: local `o200k_base` source/request token counting before reserving cost.

Both packages are JavaScript-only, locked in `package-lock.json`, and do not alter the PDF worker, CSP, browser bundling contract, or export pipeline.

## Current limitation

DOCX, PDF, and OCR are intentionally outside this milestone. A real assisted-import quality/cost run requires a development OpenAI key and the branch-scoped Preview variables above; mocked and deterministic tests do not count as real model validation.
