@AGENTS.md

# Context Management

- `/context` is the source of truth for the **current** max context window. Do NOT hardcode 200k — read it.
- Target a manual `/compact` at roughly **50% of the current max** (not a fixed number):
  - 200k window → ask to `/compact` around 100k used.
  - 1M window (e.g. Opus 4.8) → ask to `/compact` around 500k used.
- Recompute the threshold whenever the model or mode changes (different models expose different max windows).
- Write a compact phase-boundary summary at the **end of every phase** so context survives a compaction.
- Before starting a new phase, check context usage. If it is past ~50% of the current max, ask the user to `/compact` first.
- Do NOT create unknown/unsupported Claude config keys to fake auto-compaction (e.g. there is no `autoCompactWindow` setting). Rely on `/context` + manual `/compact` + phase-boundary summaries.
- Keep `KAYNA_OUTREACH_BUILD_PLAN.md` updated as the durable build source of truth so a fresh context can re-orient.
