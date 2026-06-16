# Soupdog — Labour-Division Scheduler for Cooking Sessions (v0.1)

**Status:** design note. Captures the algorithm and phased plan for dividing a meal's
tasks among multiple cooks as efficiently as possible. Nothing here is built yet; this
is the spec to settle before writing the scheduler. It is the concrete form of the
"skill-aware cooking together" idea long held in the design notes, now grounded in the
cooking-session work (setup mode, the DAG, the merge).

---

## 1. What this is (and an honest expectation)

Dividing a meal's tasks across cooks — respecting dependencies, balancing time,
matching skills, and sharing limited tools — is a **resource-constrained scheduling
problem** (in OR terms, close to job-shop / RCPSP). Optimal solutions are NP-hard.
So the goal is **not** a provably optimal schedule; it is a **good, legible heuristic**
that respects the hard constraints and clearly beats naïve splitting. The system
**suggests** a division; the organiser **corrects** it (never "the user checks every
task by hand"). Legibility and override matter as much as quality.

The key modelling insight (from Rasmus): **divide by TASK, not by dish.** Because the
recipe DAG already merges identical transformations (all red-onion chopping is one
task, across dishes), task-level division is what lets the system hand all the chopping
to one cook and avoid stranding another with a single plating step. Dividing by dish
cannot do this; dividing by task can.

---

## 2. The four constraints, and the data each needs

| Constraint | Why | Data today | Gap |
|---|---|---|---|
| **Time per task** | balance load | ✅ `durationSeconds` in the merge/DAG | none — backbone of Tier 1 |
| **Dependencies** | don't make a cook wait; keep chains sane | ✅ `version_step_dependencies` (edges); `parallel_group_id`/`is_parallelisable` | edges are **consumed by the merge, not exposed** — must be surfaced (see §5 fork) |
| **Skills** | hard tasks → skilled cooks; never beyond competence | ⚠️ `cooking_competency` (person × area × level 0–3) | (a) sparse — only if user filled it; (b) need a **task-difficulty** value AND a **task → competency-area** mapping; (c) fallback when unknown |
| **Tools** | tasks contend for the one oven / a knife | ⚠️ tasks carry tools (`appliance_settings.stepTools`) | no **per-person tool inventory**; no contention model; need **sensible defaults** (assume 1 oven, 2 knives, 2 boards; not 10 knives / 2 ovens) + "share more data for better division" prompt |

**Time + dependencies are fully actionable now. Skills + tools are designable but need
data scaffolding and fallbacks.**

---

## 3. The algorithm (list-scheduling skeleton, enriched in tiers)

The spine is a **list scheduler** over the dependency DAG. Each tier adds a scoring or
constraint layer on the *same* skeleton — so Tier 1's structure is never thrown away.

```
INPUT:  tasks (id, durationSeconds, dependencies, [difficulty], [tools]),
        cooks (id, [competency map], [tool inventory])
STATE:  each cook has a "free-at" clock (starts 0); each task a status (blocked/ready/assigned)
LOOP until all tasks assigned:
  ready = tasks whose dependencies are all assigned/scheduled
  for each ready task (priority order — see below):
     pick the cook that lets it start earliest AND is allowed/able (constraints)
     assign; advance that cook's free-at clock by the task duration
     (respect dependency finish-times: a task can't start before its inputs finish)
OUTPUT: per-task cook assignment + a projected timeline (and projected ready-time)
```

**Priority order for ready tasks** (which to place first): longest-duration-first, or
critical-path-first (tasks on the longest dependency chain), to avoid leaving big/late
work unplaceable. (Heuristic; tune.)

**Tiering — each is a layer on the pick step:**

- **Tier 1 — time + dependencies (AI-free, buildable now).** "Pick the cook free
  earliest." Keep a dependent chain with the same cook when it doesn't hurt balance
  (reduces handoffs). This alone fixes the salad-and-snacks failure: chopping tasks
  spread across cooks by time; nobody stranded with one plating step.
- **Tier 2 — skills.** Bias hard tasks to high-competency cooks; **hard floor**: never
  assign a task above a cook's competence (the "child shouldn't fry a steak" guard).
  Needs task-difficulty + task→area mapping; unknown skill = neutral prior.
- **Tier 3 — tools.** Treat scarce tools as resources tasks contend for (the one oven
  serialises oven tasks). Use the per-person inventory if known; else sensible defaults.
  Surface "you'd cook faster with a second board — add your tools" prompts.
- **Tier 4 — warnings + AI refinement.** "One cook is overloaded"; "no one here can do
  X"; optional AI pass to refine ordering/handoffs. (AI-gated.)

**Re-estimation:** once skills are in, a task's effective duration depends on *who*
does it (a novice chops slower) — so the projected ready-time updates as assignments
change. Tier 1 uses base durations; Tier 2+ scales by competence.

---

## 4. Suggest-and-correct (the interaction model)

- The scheduler produces a **suggested** assignment for every task on entering setup
  (not blank, not user-checked-one-by-one).
- The organiser **overrides** per task (reassign to another cook); the projected
  timeline (and later, warnings) updates live.
- Unassigned/shared tasks are allowed (a task with no clear owner stays shared).
- A meal may have **zero eaters** (restaurant) and the division still works on cooks.

---

## 5. [OPEN] The dependency fork — settle before building Tier 1

The merge (`lib/meal-merge.ts`) already **consumed** the dependency edges to produce a
**single-cook** timeline (it models one "hands clock"). Two ways to build the scheduler:

- **(5a) Schedule downstream of the merge** — assign the merge's existing timeline
  steps to cooks by time-window. Simpler; reuses `startOffsetSeconds`/blocking. But it
  inherits a *one-cook* critical path — wrong for multi-cook, where two pairs of hands
  genuinely change what's on the critical path.
- **(5b) Re-derive from the raw DAG edges** — surface `version_step_dependencies` into
  the setup data and run the list-scheduler on the real graph, computing a genuine
  *multi-cook* schedule. More correct; needs the edges exposed (a new read path, since
  the merge doesn't pass them through).

**Recommendation: 5b.** Multi-cook division is the whole point, and the merge's timeline
is explicitly single-hands. Surfacing the edges is modest work and unlocks correctness.
Settle this first.

Other opens:
- Task-difficulty source + task→competency-area mapping (Tier 2).
- Tool-inventory model + default-kit assumptions + the data-sharing prompt (Tier 3).
- Priority heuristic (longest-first vs critical-path-first) — measure on real meals.
- Where the scheduler runs: at setup (suggest), persisted as `assigned_to`; re-run on
  cook-set change. (Setup mode + `assigned_to` already exist.)

---

## 6. Build sequence

0. **Settle §5 (5a vs 5b) + surface dependency edges if 5b.**
1. **Tier 1** — list scheduler on time + dependencies; suggest at setup, override per
   task; show projected ready-time. AI-free, uses data that exists today.
2. **Tier 2** — skills (difficulty + mapping + competence floor + duration re-estimation).
3. **Tier 3** — tools (inventory model, defaults, contention, data-sharing prompt).
4. **Tier 4** — warnings + optional AI refinement.

Each tier is a scoring/constraint layer on the Tier-1 skeleton. Build, measure on real
meals, then enrich. Do not jump to Tier 2+ before Tier 1 is solid and the data
scaffolding for the next tier exists.

---

## 7. Seams kept open (don't preclude)

- The scheduler is **per-session** and writes `assigned_to` on `session_step_state` —
  already built. Multi-*device* execution (each cook sees their slice) and the per-cook
  filter view are separate (gated on Sharing & Delegation + RecipeDisplay filtering).
- Tool contention generalises to **appliance scheduling** (a commercial kitchen with
  two ovens) — the same resource model, more resources. Don't hard-code "one oven".
- Skill data feeds, and is fed by, the broader competency model — keep the
  task→area mapping in one place so it serves both.
