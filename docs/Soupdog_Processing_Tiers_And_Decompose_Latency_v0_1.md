# Soupdog — Processing Tiers & Decompose Latency Strategy v0.1

**Status:** design, pre-build (except the maxDuration bump + this note). Captures
Rasmus's three-tier model for handling slow/bulk AI work, and the latency strategy
for the decompose call (the heaviest AI step). Spine-touching where noted — design
before build.

## 0. The problem that prompted this
Decompose (`/api/recipes/decompose`, Sonnet 4.6, max_tokens 8000, full verified-task
guide + identity blocks in the prompt) is SLOW for substantial recipes. Measured live
(China user, but the call is server-side Vercel syd1 → Anthropic, so NOT a VPN issue):
one dish's decompose finished at 49.6s; a heavier one hit the 120s `maxDuration` and
**504'd**. The 504 is the Vercel function timeout killing an in-flight Sonnet call, not
an Anthropic error. Siloing per-dish (the §13 size-ceiling fix) does NOT solve this:
a SINGLE rich dish alone can exceed the timeout.

Immediate mitigation shipped: `maxDuration` 120 → 240 (stops the failure). The rest of
this note is the durable strategy.

## 1. THREE PROCESSING TIERS (Rasmus's model)
The key realisation: interactive and bulk want DIFFERENT architectures. Don't force
one model on both.

### Tier 1 — Fast interactive (show right away)
Small recipe, user is waiting, returns in seconds. Behaves as today. The job is to make
it FAST (see §2 latency strategy), and to make tier-1 cover MORE cases (faster decompose
= fewer that spill into tier 2).

### Tier 2 — Slow interactive (background job + persistent indicator)
SAME user intent (they asked, they were waiting), but it's taking too long to block on.
Instead of a dead spinner: flip to a BACKGROUND JOB with a persistent status indicator
visible on EVERY screen, surviving browser close/return, signalling when ready. User can
navigate away and keep using the app; the recipe appears in their list when done.

**KEY INSIGHT: tier 2 = the Active Cooking Session pattern, generalised.** A cooking
session is already "a long-running stateful thing, persisted server-side, survives
browser close, shows a persistent indicator, resumable on return." A background decompose
job is the same shape. Build tier 2 as a generalisation of that pattern, not new
architecture — keeps it consistent and much smaller.

[OPEN] decisions for tier 2 (settle before building):
- **(a) Trigger: predict vs race-and-promote.** A Vercel serverless fn already running a
  decompose can't hand off mid-call (one synchronous unit). So tier 2 is realistically
  either: (i) PREDICT up front (step/dish count over a threshold → go straight to
  background — we ALREADY have this signal from the §13 size check), or (ii) RACE: short
  inline wait + client timeout at X s; if not back, client switches to "running in
  background" while the server job continues and writes its result to a jobs table. (ii)
  matches "after X seconds" intuition but REQUIRES the server work to be a real durable
  job, not an HTTP call that dies when the client gives up. Likely answer: a blend —
  predict obvious-big up front (cheap, reliable), race for the ambiguous middle.
- **(b) Where the job runs.** A 90s+ decompose needs to run off the user's request.
  Vercel: a CRON worker polling a jobs table, or a background function. This is the real
  new infrastructure tier 2 needs.
- **(c) "Signal when ready."** Polling (indicator checks the jobs table every N s, like a
  cooking session would refresh) — simple + robust. NOT websockets (overkill).
- **(d) Jobs table + global indicator.** New `decompose_job` table (status
  queued/processing/done/failed, payload, result, account_id, timestamps) with the usual
  RLS + grants checklist. Global UI element (like the cooking-session indicator) reading
  "any running jobs for me?" on every screen.

### Tier 3 — Bulk / batch (operator + later commercial)
Staff (and later commercial customers) generating catalog content at scale. Nobody's
waiting on a spinner. DIFFERENT interface: schedule jobs, results returned later (email /
job-complete view). This is the **Anthropic Batch API** path: async, results within 24h,
**exactly 50% off** standard token prices, no quality difference. Perfect for "generate
thousands overnight." Ties into the content-pipeline / demand-front-door track in the
main handover. Its own interface, NOT the consumer add-recipe flow.

INTERACTIVE-vs-BATCH BOUNDARY (the crux): a user typing "make me a bolognese" is in an
expectant state — "we'll email you in a few hours" is a jarring downgrade. Batch is RIGHT
for bulk catalog generation (operator), WRONG for the live add-recipe path. Tier 1/2 keep
the interactive path responsive; tier 3 optimises bulk for cost+throughput.

## 2. DECOMPOSE LATENCY STRATEGY (makes tier 1 fast, tier 2 rarer)
Verified against current Anthropic docs (June 2026). Ordered by leverage:

1. **Prompt caching on the decompose call — HIGHEST LEVERAGE, do first (own session).**
   The decompose prompt is the textbook ideal: a huge STABLE prefix (SYSTEM + guideBlock
   = the verified-task library + rules + worked examples, identical every call) + a tiny
   VARIABLE suffix (the recipe). Caching gives up to ~90% cost and up to ~85% latency
   reduction on long prompts; cache hits cost 0.1× input; write costs 1.25× (5-min TTL),
   pays for itself after one hit. NO quality impact (same model, same prompt).
   - **BUILD NOTE / why not done yet:** caching needs `system` sent as an ARRAY of content
     blocks with `cache_control` on the stable block, NOT a plain string. The shared
     `aiMessage` wrapper (`src/lib/ai/anthropic.ts`) currently takes `system` as a string
     and is the SINGLE GATE every AI call routes through. So enabling caching = modifying
     that shared wrapper (add structured-system / cache-flag support) WITHOUT breaking the
     other callers — a careful change deserving its own session, with verification that the
     cache actually HITS (check `cache_read_input_tokens` in the usage response).
   - guideBlock is deterministically ordered (`order('category')`) so it's cache-stable;
     it only re-writes the cache the first call after a task is blessed/edited. Fine.
   - TTL caveat: 5-min default TTL means the latency win is biggest when calls are
     CLUSTERED (an editing session, or a bulk run) — sparse one-off calls mostly pay
     writes. Clustered usage is exactly the bulk/content-pipeline case.

2. **Raise `maxDuration` 120 → 240 — DONE.** Stops the measured 504. Floor, not a speed-up.
   Reinforced by caching (faster prefill finishes sooner, so the timeout is hit less).

3. **Batch API for tier 3 bulk.** 50% off, async, no quality penalty. The mass-production
   architecture. Separate build.

4. **Test Haiku-for-decompose against the EVALS — potential big speed+cost win, gated.**
   Decompose is somewhat mechanical (map steps→tasks, emit nodes+edges). Haiku 4.5 ($1/$5
   vs Sonnet $3/$15) is faster+cheaper. RISK: quality drop on the honest-edges/task-match
   reasoning. But we now have the vessel-edges eval + multi-dish eval + harness — run a
   Haiku decompose through them; if O/E/C + multi-dish assertions still pass, switch (or
   use Haiku for tier-3 bulk, Sonnet for tier-1 interactive). The eval is what makes this
   safe to try. THIS IS WHY THE EVAL WAS WORTH BUILDING.

## 3. Sequencing
- DONE: maxDuration 240; this note.
- NEXT (own session): prompt caching via the `aiMessage` gate (careful shared-wrapper
  change + verify cache hits). The general speed-up.
- THEN: Haiku-vs-eval experiment (cheap to try, eval-guarded).
- LATER (own track): tier-2 background jobs (generalise the cooking-session pattern;
  settle §1 (a)-(d)); tier-3 batch interface (content-pipeline track).
