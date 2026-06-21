# Soupdog — Honest Vessel Edges & Reading Order (Decomposition Layer 1)
**Design v0.1 · 2026-06-21**

> Companion to the Atomic Recipe Decomposition design (v0.3) and the
> Decomposition Guide Layer / Culinary Knowledge Layer (v0.5). This doc covers a
> single, focused decomposition fix: emitting *honest* dependency edges so a
> recipe reads in cook-along order instead of "prep-everything-then-assemble".

---

## 1. The problem

A decomposed recipe currently reads in two blocks: all the prep, then all the
assembly. Greek salad:

```
1 Slice tomato      5 Add olives
2 Slice cucumber    6 Add tomato
3 Slice pepper      7 Add cucumber
4 Slice onion       8 Add pepper
                    9 Add onion …
```

A cook would rather read "slice tomato → add tomato → slice cucumber → add
cucumber". The grouped form isn't wrong, but it's not how you'd cook along.

### 1.1 Why it happens — false dependency edges
The decomposition processes the source top-to-bottom and **chains every step to
the previous one**, emitting a *total order* (a straight line) when the true
structure is a *partial order* (a DAG with parallel branches). Inspection of
`version_step_dependencies` for greek-salad-mqnfd723 shows it exactly:

```
6 Add tomato      depends_on: 1            ← real: needs its slice
7 Add cucumber    depends_on: 2,6          ← 2 real, 6 FALSE
8 Add pepper      depends_on: 3,7          ← 3 real, 7 FALSE
9 Add onion       depends_on: 4,8          ← 4 real, 8 FALSE
```

The edges to the *previous add* (6→7→8→9) are fictional. Adding cucumber does not
truly depend on tomato already being in the bowl. These false edges are what
**block** any cook-along ordering: you can't place "add tomato" next to "slice
tomato" because the add is chained behind every other add.

### 1.2 Prior dead-end (recorded so we don't repeat it)
An earlier session prototyped a **display-only re-sort** of the existing graph
(Layer 2 — reorder among legal topological sorts). It couldn't produce clean
cut-one-add-one pairing **because the false chain forbade it** — the re-sort was
fighting fictional constraints. The lesson: fix the edges first; ordering is
downstream of honesty.

---

## 2. The fix — one sentence

> Emit a dependency edge only when one genuinely exists, and emit steps in
> consumer-follows-producer order.

Two halves, both in the decomposition prompt + edge-construction, **no schema
change**:

1. **Honest edges (§3).** An "add to vessel" step depends on its own ingredient's
   prep (and the vessel-producing step, if any) — *not* on the previous add.
2. **Reading order (§4).** Emit steps so a consumer immediately follows its
   producer, making the stored `order_index` the good cook-along order.

---

## 3. Honest edges (representation = edge-level)

**Decision (locked): edge-level, no schema change.** Concurrency is represented
by the *absence* of a chain edge, not a new column. The existing
`version_step_dependencies` table already expresses everything needed.

### 3.1 What an "add to vessel" step truly depends on
- **(a) its own ingredient's prep** — "add sliced cucumber" needs "slice
  cucumber". Always real.
- **(b) the vessel-producing step, if one exists** — the first add into a heated
  pan depends on "heat the pan"; the first add into a lined tin depends on "line
  the tin". Most passive containers (a bowl, a plate) have *no* producing step,
  so (b) is usually empty.
- **NOT the previous add** — unless the accumulation is order-dependent (§3.2).

### 3.2 The core distinction — order-independent vs order-dependent
For each accumulation into a vessel, classify:

- **Order-independent (siblings, NO edges between them):** a passive container
  receiving ingredients that could go in any order. Salad into a bowl, vegetables
  onto a roasting tray, toppings onto a pizza base, items onto a platter. Each add
  depends only on its own prep (3.1a) + vessel (3.1b). **This is the default for a
  passive container.**
- **Order-dependent (KEEP the chain edge to the previous step):** the sequence is
  culinarily real. Building an emulsion / roux / batter / dough, layering
  (lasagne, trifle), deglazing then adding stock, tempering. Cue phrases in the
  source: *"gradually add", "a little at a time", "slowly", "in batches", "until
  combined/emulsified/smooth", "then add", "once X is …, add Y"*.
- **When unsure → order-dependent (sequential).** Safe default: never claim a
  freedom the recipe didn't grant. A wrongly-sequential salad just reads slightly
  less nicely; a wrongly-concurrent roux is *wrong*.

### 3.3 Worked example — greek salad, corrected
```
Slice tomato ─┐
              ├─ Add tomato    (dep: slice tomato)            ┐
Slice cucumber┤  Add cucumber  (dep: slice cucumber)          │ siblings,
Slice pepper  ┤  Add pepper    (dep: slice pepper)            │ no edges
Slice onion  ─┘  Add onion     (dep: slice onion)             ┘ between them
                 Add olives    (dep: — , olives need no prep)
                 Toss          (dep: ALL adds — the convergence)
```
The adds are now a concurrent set. The **Toss** step is the natural convergence:
it depends on every add (you can't toss until everything's in). Convergence
points like Toss / Whisk / Plate are where the parallel branches rejoin — they
legitimately depend on all their inputs.

### 3.4 Order-dependent example — béchamel (kept sequential, correctly)
```
Melt butter → Add flour (dep: melt butter) → Add milk (dep: add flour) → Whisk …
```
Here every edge is real: you cannot add flour before the butter melts, nor milk
before the roux forms. The chain stays. The classifier must NOT strip these.

---

## 4. Reading order (emission = consumer-follows-producer)

**Decision (locked): fix the displayed order, not just the edges.** Honest edges
alone don't change what the cook sees — the steps still have an `order_index`. So
the decomposition also emits steps in **consumer-follows-producer** order: right
after producing an intermediate, emit the step that consumes it.

Result for greek salad: `slice tomato, add tomato, slice cucumber, add cucumber,
…` — the stored `order_index` *is* the cook-along order. No separate display pass.

### 4.1 Guard rail — order_index is authoritative; absence of edges ≠ "reorder me"
This is the subtle failure mode of edge-level + emission-order, and the spec must
state it explicitly:

> For an order-independent sibling set, `order_index` is the **only** thing
> carrying their sequence (there are no edges between them). `order_index` is the
> **authoritative reading order**. The absence of edges means the set is
> **parallelisable** (a scheduler *could* run them at once) — it is **NOT an
> instruction to re-sequence the display.**

Concurrency is a *capability the graph exposes*, not a *command to reorder*. A
future parallelism / "two cooks" / drag-reorder feature may consume the
"these are siblings" fact — but the **canonical reading stays the stored emission
order**. Without this guard, a future "optimisation" could shuffle the salad
siblings (e.g. alphabetically) and *regress* the reading. Write it down.

### 4.2 Display layer is unchanged
RecipeDisplay / RecipePrintLayout already render `version_steps` by `order_index`.
Because emission order is now the good order, **no renderer change is needed**.
(The existing group-collapse + intermediate-materialisation logic continues to
work; it operates on the same ordered steps.)

---

## 5. Where this lives in the pipeline

All in **decomposition** (`/api/recipes/decompose` prompt + the DAG→rows mapping
in `/api/recipes/decompose-save`). Specifically:

1. **Prompt rule — emission order:** instruct the model to emit a consumer
   immediately after its producer (depth-first along the consume chain), not all
   prep then all assembly.
2. **Prompt rule — honest edges:** an "add to vessel" depends on its ingredient's
   prep + the vessel's producing step; siblings into a passive container get no
   inter-sibling edge.
3. **Prompt rule — accumulation classification:** the order-independent vs
   order-dependent test (§3.2), defaulting to sequential when unsure.
4. **Mapping:** `decompose-save` already writes `version_step_dependencies` from
   the emitted edges; no change beyond receiving the (now honest) edge set.

No new table, no new column, no migration. This is a **prompt + edge-emission**
change that populates the *existing* structure more truthfully.

---

## 6. Build sequence

- **Phase A — prompt changes.** Add the three rules (§5.1–5.3) to the decompose
  system prompt. Tighten with 1–2 in-prompt examples: a salad (concurrent) and a
  roux/béchamel (sequential), each showing the correct edge set + emission order.
- **Phase B — eval.** Add greek salad + an order-dependent case (béchamel or a
  custard) to the decomposition eval set. Assert: (i) salad adds have no
  inter-sibling edges, (ii) salad reads cut-one-add-one, (iii) béchamel keeps its
  chain. The eval is the real safety net — classification quality is the whole
  risk.
- **Phase C — re-decompose existing recipes.** Rides on the already-planned
  "re-import the ~34 recipes through decompose" backlog item. Until then, existing
  recipes keep their false chains (harmless — they just read grouped). New recipes
  get honest edges immediately.

---

## 7. [OPEN] decisions

- **[OPEN] Classification confidence / signalling.** Should the model emit an
  explicit `accumulation: ordered|unordered` per vessel in its JSON (even though
  we store it as edge presence/absence), so the eval can check the *decision*
  separately from the *edges*? Leaning yes for eval observability, discard after
  mapping. (This is a transient prompt-output field, not the stored model — still
  edge-level per Decision A.)
- **[OPEN] Vessel-ready detection.** How reliably can the model identify the
  "vessel-producing step" (heat pan, line tin) to attach edge 3.1b? For passive
  containers there's none; for active vessels it matters. May need a small
  in-prompt list of "active vessel" cues.
- **[OPEN] Partial order within an order-dependent set.** Some sequences are
  *partially* ordered (add A and B in any order, but both before C). v0.1 treats
  accumulation as binary (fully concurrent OR fully chained). Real partial orders
  are rare in home recipes; defer until a case demands it.
- **[OPEN] Convergence detection.** §3.3's "Toss depends on all adds" — is the
  model reliably emitting the convergence edge to *every* sibling, or just the
  last? If it chains the convergence to only the last add, the parallelism is lost
  on paper. Eval should check the convergence fans in from all siblings.
- **[OPEN] Interaction with group/sub-recipe boundaries.** Concurrent sibling sets
  and the bottom-up group derivation (Atomic Decomposition v0.3 §4) must not
  fight. A sibling set is usually *within* one group; confirm the group-derivation
  still finds clean boundaries when prep and assembly interleave in emission order.

---

## 8. Non-goals (explicitly out of scope for Layer 1)

- **Layer 2 display re-sort** — choosing a reading order *among legal topological
  sorts* of an already-stored graph. With emission order correct, this is
  unnecessary for now. If ever needed (e.g. re-sorting legacy recipes without
  re-decomposing), it's a separate display-only pass that MUST honour §4.1.
- **Parallelism / "two cooks" / division-of-labour UI** — Layer 1 makes the graph
  *able* to express concurrency; surfacing it is a downstream feature.
- **Drag-to-reorder** — already in backlog; consumes the same honest graph.

---

## 9. Risk summary

The single risk is **classification quality**: the model mislabels an
order-dependent accumulation as concurrent and strips a real edge, producing a
recipe that's *wrong* (e.g. a sauce that reads as if ingredients can go in any
order). Mitigations, in order of strength:
1. **Default-to-sequential when unsure** (§3.2) — structurally biases toward
   safety.
2. **Eval set with an order-dependent case** (§6 Phase B) — catches regressions.
3. **Cue-phrase list** in the prompt — gives the model concrete signals.

A wrongly-*sequential* result is merely a slightly-less-nice read (the current
behaviour). A wrongly-*concurrent* result is a correctness bug. The whole design
leans the failure toward the harmless side.
```
