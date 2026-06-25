# Soupdog — Time Model: derived from the task graph (v0.1)

**Status:** design note, not built. Captures the decision that recipe time must
be *derived from the task graph*, not estimated per-recipe by AI.

**Why now:** a live recipe (Beef Tacos) showed **Total 17 min < Active 25 min**,
which is impossible (active is a subset of total). Root cause: `recipe_versions.
total_time_seconds` / `active_time_seconds` are **AI-estimated recipe-level
fields** set at import. AI guessing one number per recipe is the wrong model —
inconsistent, and empty on most recipes.

---

## 1. Core principle — time lives with the tasks

Same as everything else in Soupdog: the **atomic task is the unit of truth**, the
recipe is a graph over tasks. Time should fall out of the graph, not be guessed.

The data already largely exists. Verified core tasks carry:
- `min_duration_seconds` / `max_duration_seconds`
- `is_passive` (simmer / rest / marinate / chill — waiting, not hands-on)
- `completion_type = 'time'` (+ `completion_target`) where time-bounded

So this is a **derivation**, not a new schema. The work is computing recipe time
from task durations instead of storing an AI guess.

---

## 2. Two derived quantities (correct by construction)

- **Active time = Σ durations of the hands-on (non-passive) tasks.**
  Sum only `is_passive = false` task durations. This is the cook's attention.
- **Total time = the critical path through the DAG** (longest dependency chain,
  including passive waits) — NOT the naive sum. Parallel tasks overlap: while the
  beef browns (8 min, passive-ish/attended), you chop coriander. Total counts the
  longest chain of dependencies, not every task added up.

**This makes `active ≤ total` structurally guaranteed** — the bug that prompted
this note becomes impossible. Active is a sum of a subset; total is the critical
path that contains those tasks plus waits.

> Note: "passive" vs "active" is per task. Some tasks are attended-but-waiting
> (stirring occasionally) — a later refinement may add an attention fraction
> (0–1) per task rather than a binary. v0.1: binary `is_passive` is enough.

---

## 3. Transition buffer (switching cost)

Pure task-sum misses real time: moving between tasks, fetching tools, reading the
next step, changing station. Rasmus's framing: **more distinct tasks → more buffer.**

Model (v0.1): a per-transition overhead added along the critical path —
- a small fixed cost per task boundary (e.g. ~10–20 s), and
- a larger cost when the **tool or station changes** between consecutive tasks
  (knife → pan → oven each cost more than two knife tasks in a row).

It's a coefficient over the graph edges; trivial to add once time is graph-derived.
[OPEN] exact constants — set from observation, not guessed precisely up front.

---

## 4. Skill scaling — time is per-cook

Already in the backlog as **"skill-aware cooking together"** (`cooking_competency`
exists, per-person, per-area, level 0–3). A skilled chopper dices the onion faster;
a novice slower.

Model: each task's base duration assumes a **reference skill level**. A cook's
`cooking_competency` in the relevant area scales it (faster above reference, slower
below). So **time becomes per-person**, exactly as portions are per-person.

### The symmetry (the elegant part)
- **Who's EATING → drives portions / nutrition.** (built — demand model)
- **Who's COOKING → drives time** (skill-scaled task durations + parallelism +
  transition buffer).

Both read off the same task graph; both are "the person model applied to the
recipe." **Time is the cooking-side twin of the nutrition work.** This ties
directly into the deferred "cooks join a meal" feature: who cooks determines the
time the way who eats determines the plate.

---

## 5. Multi-cook parallelism (later)

With ≥2 cooks, independent branches of the DAG run in parallel across people →
total time drops. This is the `is_parallelisable` / `parallel_group_id` work
already scaffolded on tasks/steps, now with a time payoff. Downstream of single-cook
graph-time; needs the "who's cooking" assignment UI first.

---

## 6. Build sequence (when picked up)

1. **Derive single-cook time from the graph:** active = Σ hands-on task durations;
   total = critical path (incl. passive). Replace the AI recipe-level fields as the
   display source. (Tasks without durations fall back gracefully — show what's known.)
2. **Transition buffer** along the critical path (fixed per-boundary + tool/station-
   change surcharge).
3. **Skill scaling** via `cooking_competency` — time per cook.
4. **Multi-cook parallelism** — branches across assigned cooks.

Steps 3–4 are the "who's cooking" feature; 1–2 stand alone and already fix the bug.

---

## 7. Interim (pre-build) display

Until the graph-derived model lands, the stored AI fields are unreliable (active >
total, mostly empty). Interim honest display: **[OPEN — pending Rasmus] either show
only Total (hide the unreliable Active), or hide both until derived.** Do not show
active > total. Leaning: show Total, hide Active.

---

## 8. [OPEN] decisions

- Interim display (§7): hide Active vs hide both.
- Attention fraction per task vs binary `is_passive` (§2 note).
- Transition buffer constants (§3).
- Reference skill level for base durations; scaling curve (§4).
- Whether derived times are cached on the version (perf) or computed at read.
