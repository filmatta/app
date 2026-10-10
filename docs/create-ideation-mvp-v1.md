# Create Ideation MVP V1

Base: `ed995f5b3f24f99d7dcc88fc558da53c6c2c1806` (`codex/create-onboarding-foundation`). This branch does not include the Creative Sandbox branch.

## Flow and ownership

The existing `create_idea_drafts` row remains the active onboarding draft. Its original idea, answers, current question, AI analysis, synthesis, and stable Project operation ID survive refresh. After a Project has a confirmed guide, starting another idea archives the earlier draft in place and creates a new active row; its original material stays recoverable. AI runs on the server only. Call 1 analyzes the original idea with field status, evidence, and confidence. A deterministic question selector omits fields marked `known`; answering questions does not call AI. Call 2 produces the editable synthesis and brief outline/cues. Both calls use Responses API, strict JSON schema, `gpt-5.6-terra`, `reasoning.effort: none`, and `store: false`. No `prompt_cache_key` is sent. Safe logs record status, model, request ID, latency, and token counts, without creative text.

Project creation begins only after the user confirms a destination and name. The Project operation ID and original name are persisted before the creation RPC. A retry reuses the same operation. The existing Project Writer RPC reuses the first Writer document in that Project. The guide is then upserted by unique Project ID. This limits duplicate artifacts if a later step fails.

The Writer document begins with its canonical empty blocks. Cues are stored in `create_ideation_guides.synthesis` and shown in a hideable Writer guide. “Crear escena vacía” appends empty heading/action blocks. PDF and FDX export read only `writer_scripts.document`, so cues remain outside the screenplay. The user supplies all screenplay prose.

## Sandbox handoff

`create_ideation_guides.context` stores the original idea, answers, and analysis. `buildIdeationSandboxContext` combines that with the synthesis and only current Canon/Maybe possibilities. Discarded items are excluded. `/create/projects/[id]/explore` is the context entry point and a small manual possibility board. The Creative Sandbox chat itself is not included; the page says so. When its branch is selectively integrated, it should load this contract by Project ID and never treat Maybe or discarded possibilities as accepted decisions.

## Data and entitlement seams

Migration `20261010010000_create_ideation_mvp_v1.sql` extends the draft and adds guides and possibilities with owner RLS and cascade cleanup. Apply only to Supabase Test before opening the Preview. The initial guided run, first Prepare Script, and initial exploration are currently open in Test. Future entitlement checks belong before AI analysis/synthesis, before Project/Writer preparation, and before extended Sandbox turns. No Billing change is made here.

## QA

The three synthetic fixtures live in `tests/create/ideation-fixtures.ts` (developed, minimal, and 910-word mixed idea). Run `node --experimental-strip-types --test tests/create/*.test.ts`, `node --test tests/database/create-ideation.test.mjs`, TypeScript, lint, and build. Live Preview QA still needs a Test user and the Test migration. Track each Responses request ID and token counts from safe server logs for the cost report. Remove the temporary Test user and its cascaded data after QA.
