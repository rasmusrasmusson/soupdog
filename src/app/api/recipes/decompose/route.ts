// src/app/api/recipes/decompose/route.ts
// POST — step 2 of import: convert a step-1 parse into the atomic executable DAG.
//
// Input:  { extraction }  — the import route's output (the `groups[].steps[]` parse),
//                           OR any prior extraction (e.g. a stored source_extraction
//                           for cheap RE-decompose without re-reading the file).
// Output: { dag }         — { title, servings, nodes:[...] } per the validated step-2
//                           contract (see prompts/decomposition_step2_prompt.md;
//                           proven 6/6 in the eval harness).
//
// This is a SEPARATE route from /api/recipes/import on purpose: the parse stays
// independently reusable, so a "completely wrong, redo it" chat instruction can
// re-decompose from the SAVED extraction without paying for another parse.
//
// Find-or-create is NOT done here — the prompt emits canonically-named tasks;
// /api/recipes/decompose-save does the code-side task matching at insert time.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aiMessage } from '@/lib/ai/anthropic';
import { resolveIngredientIds, normalizeIngredientName } from '@/lib/ingredients/resolve';

// Allow time for the (possibly slow) Anthropic call — without this the
// serverless function can be killed mid-request and return a 502 intermittently.
// Vercel function timeout. Sonnet structuring of a substantial recipe (40+ nodes)
// measured at 50s and, for the heaviest, >120s — which 504'd at the old ceiling.
// Raised to 240s (Vercel Pro allows up to 300) to give real headroom. NOTE: this
// stops the FAILURE; the durable LATENCY fix is prompt caching on the stable guide
// prefix + (for bulk) the Batch API — see the async/latency design note.
export const maxDuration = 240;

// Hardened step-2 system prompt — kept in sync with...
// Allow time for the (possibly slow) Anthropic call — without this the
// serverless function can be killed mid-request and return a 502 intermittently.

// Hardened step-2 system prompt — kept in sync with
// prompts/decomposition_step2_prompt.md and eval/run-case.mjs. Strict atomicity
// (one ingredient per node, incl. cooking liquids + finishing squeezes; introduce
// each ingredient once) + dependency edges + named groups.
const SYSTEM = `You convert a bundled recipe into an atomic executable dependency graph. The graph is for machines (Cook Mode, connected appliances, parallel scheduling, division of labour) and is re-bundled into readable prose for humans by a separate display layer — so optimise for correctness and atomicity, not readability. The input may be a SINGLE dish or a MEAL of several dishes/drinks (multiple groups with outputNames) — for a meal you produce ONE graph with one named terminal per dish and shared prep merged across dishes (see rule 6b).

Return ONLY a single JSON object, no preamble, no markdown fences.

Core rules:
1. One transformation per node. A node is one culinary action on its inputs. Stop at the culinary verb. Do NOT model micro-motions (pick up, pour, set down), retrieval, or opening packages. Assume continuity — a bowl/pan persists across the nodes that use it.
2. One ingredient per node, always — NO bundling, ever. Each ingredient enters the graph at its OWN node. A node's "ingredients" array holds AT MOST ONE ingredient. "add the flour, sugar and salt" → THREE separate add nodes. Cooking liquids/media count as ingredients: "boil the pasta in water" → a node for water AND a separate node for pasta, never boil [pasta, water] in one node (same for stock, oil, brine). Finishing/seasoning liquids count too: "finish with a squeeze of lime" → a separate add node for lime, THEN the mix node that consumes it. A transformation node (mix, simmer, whisk, combine, bake) acting on already-introduced inputs has an EMPTY ingredients array; it only consumes prior nodes. Introduce each ingredient EXACTLY ONCE — after it appears on its introduction node, NEVER list it again on a later node; refer to it only via consumes. "Chop the onion, then add the chopped onion to the pan" → ONE chop node introducing onion, and the pan node simply consumes the chop node (empty ingredients). Do NOT re-list "onion (chopped)" on the pan node. The display layer re-bundles them; you must not. STRUCTURED QUANTITY IS MANDATORY: whenever a node introduces an ingredient, that ingredient's name, qty (number), and unit MUST be in the node's "ingredients" array — NEVER convey the quantity only in prose. The structured fields are the single source of truth; the human-readable instruction is generated downstream FROM them. "add 3 l water" → ingredients:[{name:"water",qty:3,unit:"l"}], not an empty array. If a quantity is genuinely unspecified in the source, include the ingredient with qty:null — but still include it in the array.
3. Match on the transformation, parameters absorb the variant. "sauté" / "fry gently" / "cook in a little oil" are the SAME task ("sauté") with different params. "stir" / "stir gently" / "stir vigorously" = ONE task ("stir") + a vigour param. But genuinely different transformations stay different tasks: sauté ≠ sear ≠ boil ≠ braise ≠ fold ≠ whisk. When unsure, prefer the more general existing-sounding verb over inventing a new one — but NEVER merge two distinct transformations. Use lowercase canonical verb names.
2b. Prep that is a TRANSFORMATION becomes its OWN task — never a prep-note. If an ingredient is listed with a transformation done to it ("100g pecorino, finely grated"; "1 onion, diced"; "2 cloves garlic, minced"; "carrots, peeled and sliced"), the transformation is a TASK, not text on the ingredient. Introduce the RAW ingredient ("pecorino"), then emit the transformation task ("grate" → grated pecorino; "dice" → diced onion), with the qualifier as a PARAMETER (finely → params {fineness:"fine"}). The ingredient's "prep" field is ONLY for non-transformation qualifiers that are NOT actions ("at room temperature", "best quality", "ripe", "skin-on"). NEVER put "grated"/"diced"/"chopped"/"minced"/"sliced"/"peeled" etc. in "prep" — those are tasks. So "pecorino, finely grated" → an add/introduce node for pecorino (prep: null) + a grate node (params {fineness:"fine"}, produces "grated pecorino"). Do not also write "finely grated" on the ingredient.
2c. DISTINGUISH consecutive same-verb cooks — never emit two identical bare transformation nodes back to back. The atomic split of "add X and cook until soft; add Y and cook until fragrant" is: introduce-X → cook[X] → introduce-Y → cook[Y]. The TWO cook nodes must NOT both be a bare "sauté" with empty completion — that is the single most common duplicate-looking defect. Each cook node MUST carry the completion/end-condition the source gave it ("until soft" vs "until fragrant" — these differ and must both be captured per rule 7), so the two nodes are genuinely distinct. If the source gives a cook step its OWN end-condition or duration, that step is its OWN node WITH that completion; do not collapse it into, or duplicate it from, the neighbouring cook. Conversely, if two adjacent source phrases describe ONE continuous action with no new ingredient and no new end-condition between them, emit ONE node, not two — never duplicate a node to pad the graph. Rule: distinct cooks are distinguished by their completion (rule 7); identical-and-adjacent bare cooks are a bug.
2d. SEASONING IS AN ADD, NEVER A BARE "season" NODE. "Season with salt and pepper", "season to taste", "season generously", "salt and pepper to taste" → model each seasoning ingredient as its OWN add node that INTRODUCES that ingredient (salt, pepper) into the dish, exactly like any other ingredient under rule 2. "season with salt and pepper" → an add node for salt (ingredients:[{name:"salt",...}]) AND a separate add node for pepper (ingredients:[{name:"black pepper",...}]) — two add nodes, each carrying its own ingredient, each consuming the dish-in-progress (the node holding the thing being seasoned). NEVER emit a transformation node whose task is "season" with an EMPTY ingredients array — a bare "season" node that introduces nothing is the defect; there is no such action, the action IS adding the salt/pepper. NEVER emit the same seasoning twice (one salt add, one pepper add — not a generic "season" plus a salt add). NEVER chain seasonings to each other (salt does not depend on pepper); each seasoning add depends ONLY on the dish-in-progress it goes into (the most recent node holding that vessel's contents), per rule 4b. The qualifier ("to taste", "generously") is the ingredient's qty/unit, not a separate node: "salt to taste" → ingredients:[{name:"salt",qty:null,unit:"to taste"}]. So a salad finished "season generously, drizzle with oil and vinegar" yields add-oil, add-vinegar, add-salt, add-pepper nodes — all consuming the plated salad — with NO bare "season" node anywhere.

4. Edges = real dependencies, NOT sequence. "consumes" lists the node ids whose OUTPUT this node needs before it can start. A node depends on another ONLY if it uses that node's product or the same vessel's accumulated contents. Two prep chains that never meet until a later combine MUST NOT depend on each other — that independence is the parallelism the graph exists to capture. Do not chain every node to the previous one. The first node(s) touching only raw ingredients have empty consumes.
4b. HONEST VESSEL EDGES — an "add to vessel" step does NOT depend on the PREVIOUS add. This is the most common false-edge mistake: do not chain add→add→add. An "add X to the bowl/tray/pan" step depends ONLY on (a) its OWN ingredient's prep ("add sliced cucumber" depends on "slice cucumber" — always real), and (b) the vessel-PRODUCING step IF one exists (first add into a heated pan depends on "heat the pan"; first add into a lined tin depends on "line the tin"). Passive containers (a bowl, a plate, a tray) have NO producing step, so (b) is usually empty. It does NOT depend on the previous ingredient already being in the vessel — UNLESS the accumulation is order-dependent (next paragraph). Classify each accumulation into a vessel:
   - ORDER-INDEPENDENT (default for a PASSIVE container): ingredients that could go in in any order — salad into a bowl, vegetables onto a tray, toppings onto a pizza base, items onto a platter. Each add depends ONLY on its own prep (+ vessel if active). The adds are SIBLINGS with NO edges between them. This is what enables "slice tomato → add tomato → slice cucumber → add cucumber" and parallel division of labour.
   - ORDER-DEPENDENT (KEEP the chain edge to the previous step): the sequence is culinarily real — building an emulsion / roux / batter / dough, layering (lasagne, trifle), deglazing then adding stock, tempering. Cue phrases in the source: "gradually add", "a little at a time", "slowly", "in batches", "until combined/emulsified/smooth", "then add", "once X is …, add Y". Here each add genuinely depends on the previous — keep the chain (e.g. béchamel: melt butter → add flour [dep: melt butter] → add milk [dep: add flour] → whisk).
   - WHEN UNSURE → treat as ORDER-DEPENDENT (sequential). A wrongly-sequential salad just reads slightly less nicely; a wrongly-concurrent roux is WRONG. Lean to the safe side.
   CONVERGENCE: the step that finally combines an order-independent sibling set (Toss, Mix, Plate, Bake) depends on ALL of the siblings (you can't toss until everything is in) — fan the convergence edge in from EVERY sibling, not just the last one.
4c. EMISSION ORDER — emit a consumer IMMEDIATELY AFTER its producer, not all prep then all assembly. Walk the consume chains depth-first: right after the node that produces an intermediate, emit the node that consumes it. For a salad this yields "slice tomato, add tomato, slice cucumber, add cucumber, …" rather than "slice tomato, slice cucumber, …, add tomato, add cucumber, …". The order you emit nodes in IS the cook-along reading order (it becomes order_index downstream), so make it read the way a cook would actually work: produce a thing, use it, move to the next. For an order-independent sibling set, the emission order is the ONLY thing carrying their sequence (there are no edges between them) — so emit them in a sensible cook-along order and do NOT scramble them; the absence of inter-sibling edges means they are PARALLELISABLE (a scheduler could run them at once), it is NOT a license to reorder the reading. Order-dependent chains emit in their real sequence as always.
5. Intermediates & convergence. A node that consumes TWO OR MORE prior outputs is a convergence point (a combine, a plating). The chain of nodes feeding one input of a convergence is a sub-graph that produces an intermediate — give it a short "produces" name on the LAST node of that chain. If the source explicitly names a section ("For the marinade:", "Masala sauce:"), use that exact name and set "group" on those nodes. Explicit names always win over your own derivation.
6. Fan-out. One prep can feed several consumers. Emit ONE node; multiple later nodes list it in consumes. Put per-consumer quantities on the consuming node's notes if the source specifies a split.
6b. MULTI-DISH MEALS — MERGE SHARED PREP ACROSS DISHES. When the input contains MULTIPLE dishes (more than one group with a non-empty outputName, i.e. a meal of several dishes/drinks), you are decomposing them into ONE unified graph, NOT one silo per dish. If two or more dishes need the SAME raw ingredient given the SAME transformation with the SAME parameters (e.g. both need "finely chopped red onion"), emit that prep ONCE as a single node and FAN IT OUT — every consuming step across every dish lists that one node in its consumes. Do NOT chop the onion twice because two dishes use it. This shared-prep merging is the whole point of treating a meal as one graph (it enables "chop once, use in three dishes" and division of labour). SAFETY — only merge when ingredient AND transformation AND parameters all match: "diced onion" for dish A and "sliced onion" for dish B are DIFFERENT prep → two nodes. Generic cooking media (water, oil, salt) are NOT shared intermediates — introduce them separately where each dish uses them (do NOT merge the pasta's boiling water with the tea's water). When a merged prep node feeds multiple dishes and the source gives per-dish amounts, put the split in the consuming nodes' notes. Each dish still gets its OWN named terminal (its outputName) — merging shared PREP does not merge the dishes' end-products. IDENTITY SIGNAL: if an INGREDIENT IDENTITY block is provided below the extraction, two ingredients listed with the SAME id are DEFINITIVELY the same catalog ingredient — use id equality (not name-string similarity) as the "same ingredient" half of the merge test (transformation AND parameters must still match to merge). An ingredient absent from that block is new/uncataloged — judge it by name + meaning as usual. The identity signal NEVER overrides this rule's SAFETY clause: generic media (water, oil, salt) are not merged as shared prep even when they share an id.
6c. PRE-RESOLVED DISHES — LINK, DO NOT DECOMPOSE. The user message may include a RESOLVED DISHES list: dishes already matched to existing recipes by an upstream search the user confirmed. For each dish in that list, you MUST NOT decompose it into nodes — do NOT introduce its ingredients or emit any steps for it. Instead, record it in the output "linkedDishes" array as { "dishName": "<name>", "canonicalSlug": "<slug>" } exactly as given. Only dishes NOT in the resolved list are decomposed into nodes as normal. A resolved dish contributes NO nodes and NO terminal node of its own — its presence in linkedDishes IS the dish. (You never decide reuse yourself; you only honour the resolved list you are given.)
7. Tools & timing. Suggest a "tool" per node. CAPTURE COMPLETION CRITERIA: if the source gives ANY duration or end-condition for a step — "about 8-10 minutes", "until crispy", "until al dente", "until golden", "until combined", "until thickened", "until the sauce coats the back of a spoon" — you MUST put it in that node's "completion". This applies to ACTIVE steps (fry, boil, whisk, simmer, saute, reduce), not only passive waits. Do NOT drop it. Rules for the value:
   - A clear fixed time -> ISO-8601 duration: "10 minutes" -> "PT10M", "1.5 hours" -> "PT1H30M".
   - A RANGE ("8-10 minutes") -> take the midpoint as the duration AND keep the human phrasing in "notes": completion "PT9M", notes "about 8-10 minutes".
   - An observable end-state with no time ("until crispy", "until al dente") -> put the phrase verbatim in "completion": "until crispy".
   - Both a time and a state ("fry 8 min until crispy") -> completion "PT8M", notes "until crispy".
   - Set "passive": true ONLY for unattended waits (rest, prove, chill, marinate, simmer-unattended). Attended active cooking is passive:false but STILL gets a completion if the source states one.
   If the source genuinely gives no time or condition for a step, completion is null — never invent a number.
8. FAITHFULNESS — do not invent steps. Every node must correspond to an action that is actually in the source recipe. Do NOT add steps the source doesn't describe (no invented "ladle", "rest", "garnish", "serve" unless the source says so). Decomposing one source action into its atomic introduce-then-transform nodes is REQUIRED and expected (that is not invention); fabricating a NEW culinary action that the source never mentions is FORBIDDEN. When the source says "reserve 200ml pasta water before draining", model exactly that — a reserve action and a drain action — not an unrelated "ladle" step.
9. The "task" is the TRANSFORMATION VERB, never a tool. Never use a tool/vessel name (ladle, colander, pan, pot, whisk, spoon, bowl) as the value of "task". The tool goes in the "tool" field; the verb describes what is DONE. "drain into a colander" -> task "drain", tool "colander" (NOT task "colander"). "transfer with tongs" -> task "transfer", tool "tongs". "whisk" is a verb AND a tool name — when whisking, task "whisk" is correct, but the implement is still the tool. If you cannot name a transformation verb for a step, the step probably should not exist (see rule 8).

Output JSON contract:
{
  "title": "string",
  "servings": 4,
  "nodes": [
    {
      "id": "n1",
      "task": "chop",
      "ingredients": [{ "name": "red onion", "qty": 200, "unit": "g", "prep": null }],
      "consumes": [],
      "produces": null,
      "group": null,
      "tool": "chefs-knife",
      "params": { "cut": "fine" },
      "passive": false,
      "completion": null,
      "notes": null
    },
    {
      "id": "n2",
      "task": "saute",
      "ingredients": [],
      "consumes": ["n1"],
      "produces": "softened onion",
      "group": null,
      "tool": "frying-pan",
      "params": { "heat": "medium" },
      "passive": false,
      "completion": "PT7M",
      "notes": "about 6-8 minutes, until soft and translucent"
    }
  ],
  "linkedDishes": []
}

Hard constraints:
- Every consumes id must reference an EARLIER node's id. No cycles. No self-edges.
- Every ingredient from the extraction appears in exactly one node's ingredients (introduced once, then referenced via consumes, never re-listed).
- At least one terminal node (nothing consumes it) — the finished dish / plating.
- Independent prep chains share NO edges until they converge.
- "add" is a valid task for introducing an ingredient into an existing vessel.
- Never use a tool name as a "task" value (rule 9). Never invent a step absent from the source (rule 8).
- If the source states a time or end-condition for a step, that step's "completion" MUST be populated (rule 7).
- EVERY ingredient that appears in any instruction text MUST also be present in some node's structured "ingredients" array with its qty and unit. Before returning, verify: the count of distinct ingredients you introduced in the structured arrays equals the count of distinct ingredients the recipe actually uses. If any ingredient is mentioned but not in a structured array, FIX it before returning. A graph with cooking steps but zero structured ingredients is INVALID.

WORKED EXAMPLE A — order-INDEPENDENT vessel (salad). Source: "Slice the tomato and cucumber. Add to a bowl with the olives. Toss." Correct emission (consumer follows producer) + honest edges (adds are SIBLINGS, no add→add edges; Toss converges from all):
  n1 slice tomato      (consumes [])            produces "sliced tomato"
  n2 add tomato        (consumes [n1])          ← own prep only, NOT a previous add
  n3 slice cucumber    (consumes [])            produces "sliced cucumber"
  n4 add cucumber      (consumes [n3])          ← own prep only; NO edge to n2
  n5 add olives        (consumes [])            ← no prep needed; NO edge to n4
  n6 toss              (consumes [n2,n4,n5])    ← convergence: ALL adds, not just the last
WRONG would be: n4 add cucumber consumes [n3,n2] (the n2 edge is FALSE), or emitting n1,n3 then n2,n4 (prep-then-assembly instead of cut-one-add-one).

WORKED EXAMPLE B — order-DEPENDENT chain (béchamel). Source: "Melt butter, stir in flour, gradually add milk, whisk until smooth." Correct: the chain is REAL, keep every edge:
  n1 melt butter   (consumes [])
  n2 add flour     (consumes [n1])   ← cannot add flour before butter melts
  n3 add milk      (consumes [n2])   ← "gradually add" cue → ordered; depends on the roux
  n4 whisk         (consumes [n3])   completion "until smooth"
Here add→add edges are CORRECT because the accumulation is order-dependent. Do not strip them.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const extraction = body?.extraction;
  if (!extraction || typeof extraction !== 'object') {
    return NextResponse.json({ error: 'extraction required' }, { status: 400 });
  }

  // Dishes already resolved to existing recipes by an UPSTREAM search + user
  // disambiguation step (the AI does NOT decide reuse). Shape:
  // [{ dishName: string, canonicalSlug: string }]. decompose must LINK these
  // (emit them in linkedDishes) and NOT decompose them inline.
  const resolvedDishes: { dishName: string; canonicalSlug: string }[] =
    Array.isArray(body?.resolvedDishes)
      ? body.resolvedDishes.filter((d: any) => d && typeof d.dishName === 'string' && typeof d.canonicalSlug === 'string')
      : [];

  // ── INGREDIENT IDENTITY RESOLUTION (4A — identity-based shared-prep merge) ──
  // Resolve each extraction ingredient NAME to its catalog id (read-only; see
  // docs/Soupdog_Ingredient_Resolution_Upstream_And_Identity_Merge_v0_1.md §10).
  // This lets rule 6b merge shared prep across dishes on IDENTITY rather than on
  // name-string fuzziness. Two names that resolve to the SAME id are definitively
  // the same catalog ingredient. A null id (new ingredient, not in catalog yet)
  // falls back to the existing name+meaning merge test. is_product=false is
  // mirrored from findOrCreateIngredient so resolve-time and save-time see the
  // same catalog. DB-only, no AI cost. Failures degrade to "all null" (name-based
  // merge as before) — resolution must never break decomposition.
  let identityBlock = '';
  try {
    const extractionIngredients: any[] = Array.isArray(extraction?.ingredients) ? extraction.ingredients : [];
    const names = extractionIngredients
      .map((i: any) => (typeof i?.name === 'string' ? i.name : ''))
      .filter(Boolean);
    if (names.length) {
      const idMap = await resolveIngredientIds(supabase, names);
      // Annotate the extraction (carried for downstream/debug; harmless if unused).
      for (const ing of extractionIngredients) {
        if (typeof ing?.name === 'string') {
          ing.ingredientId = idMap.get(normalizeIngredientName(ing.name)) ?? null;
        }
      }
      // Build the identity block: ONLY names that resolved to a REAL id (a null
      // carries no identity info — the model treats it by name as today). State
      // the conclusion ("these names are the same catalog ingredient") rather
      // than making the model infer sameness from ids buried in the JSON.
      const resolved = extractionIngredients
        .filter((i: any) => typeof i?.name === 'string' && i.ingredientId)
        .map((i: any) => `- ${i.name} = #${i.ingredientId}`);
      // De-dupe identical "name = #id" lines (same name listed twice in the parse).
      const uniqueLines = Array.from(new Set(resolved));
      if (uniqueLines.length) {
        identityBlock =
          '\n\nINGREDIENT IDENTITY (resolved against the catalog). Each line is a recipe ' +
          'ingredient and its catalog id. When two steps use ingredients with the SAME id, ' +
          'they are DEFINITIVELY the same catalog ingredient — use that for rule 6b shared-prep ' +
          'merging (id equality overrides name-string similarity). An ingredient NOT listed here ' +
          'is new/uncataloged — judge its sameness by name + meaning as usual. This identity ' +
          'signal does NOT override the rule 6b SAFETY clause: generic cooking media (water, oil, ' +
          'salt) are never merged as shared prep even if they share an id.\n' +
          uniqueLines.join('\n');
      }
    }
  } catch (e) {
    console.error('[decompose] ingredient resolution failed (continuing name-based):', e);
  }

  // ── GUIDE LAYER ──────────────────────────────────────────────────────────
  // Fetch the VERIFIED task library and build a compact "known techniques" block
  // the model must MATCH to (instead of inventing). The expectation (completion
  // type/target, typical duration, input/output state, tools) travels WITH each
  // task — so e.g. Boil advertises it wants a doneness signal, and "Bring to a
  // boil" advertises NO fixed duration, which stops the cook-time landing on the
  // wrong node. The verified core is small (~30) so we include all of it; verb-
  // keyed narrowing can come later if it grows large.
  let guideBlock = '';
  try {
    const { data: guideTasks } = await (supabase as any)
      .from('tasks')
      .select('name, description, completion_type, completion_target, completion_criterion, min_duration_seconds, max_duration_seconds, typical_input_state, typical_output_state, heat_mechanism, heat_medium, suggested_tool_slugs')
      .eq('is_verified', true)
      .order('category', { ascending: true });

    if (guideTasks && guideTasks.length > 0) {
      const fmtDur = (a: number | null, b: number | null) => {
        if (!a && !b) return '';
        const m = (s: number) => s % 60 === 0 ? `${s / 60}m` : `${s}s`;
        return a && b ? `${m(a)}-${m(b)}` : m((a || b)!);
      };
      const lines = guideTasks.map((t: any) => {
        const parts: string[] = [`- ${t.name}`];
        if (t.description) parts.push(`— ${t.description}`);
        const meta: string[] = [];
        if (t.typical_input_state || t.typical_output_state)
          meta.push(`${t.typical_input_state ?? '?'}→${t.typical_output_state ?? '?'}`);
        if (t.heat_mechanism && t.heat_mechanism !== 'none')
          meta.push(`heat: ${t.heat_mechanism}${t.heat_medium && t.heat_medium !== 'none' ? '/' + t.heat_medium : ''}`);
        // completion expectation — the key anti-bug signal
        if (t.completion_type === 'subjective' || !t.completion_type) {
          meta.push('completion: none expected');
        } else if (t.completion_type === 'time') {
          meta.push(`completion: a TIME${fmtDur(t.min_duration_seconds, t.max_duration_seconds) ? ` (typ ${fmtDur(t.min_duration_seconds, t.max_duration_seconds)})` : ''}`);
        } else {
          meta.push(`completion: ${t.completion_type}${t.completion_target ? ` ("${t.completion_target}")` : ''} — CAPTURE it if the source states one`);
        }
        const dur = fmtDur(t.min_duration_seconds, t.max_duration_seconds);
        if (dur && t.completion_type !== 'time') meta.push(`typ ${dur}`);
        if (Array.isArray(t.suggested_tool_slugs) && t.suggested_tool_slugs.length)
          meta.push(`tools: ${t.suggested_tool_slugs.join('/')}`);
        if (meta.length) parts.push(`[${meta.join('; ')}]`);
        return parts.join(' ');
      });
      guideBlock =
        '\n\nKNOWN TECHNIQUES (the verified task library). MATCH each step to one of these by ' +
        'MEANING and use its EXACT name as the "task". These carry the expected completion ' +
        'signal and tools — honour them: if a technique says it expects a completion and the ' +
        'source gives one, you MUST capture it; if it says "none expected" (e.g. Bring to a ' +
        'boil), do NOT attach a fixed time. Pick the most specific matching technique ' +
        '(Sauté vs Sear vs Pan-fry are distinct). Only if NONE fits, invent a new lowercase ' +
        'task and set "new_task": true on that node so it can be curated.\n' +
        lines.join('\n');
    }
  } catch (e) {
    console.error('[decompose] guide fetch failed (continuing without guide):', e);
  }

  const resolvedBlock = resolvedDishes.length
    ? '\n\nRESOLVED DISHES (already matched to existing recipes — LINK these per rule 6c, do NOT decompose them):\n' +
      resolvedDishes.map(d => `- ${d.dishName} → ${d.canonicalSlug}`).join('\n')
    : '';

  const userMsg =
    'Here is the bundled extraction of a recipe. Convert it to the atomic executable ' +
    'dependency graph per your instructions. Return ONLY the JSON object.\n\nEXTRACTION:\n<<<\n' +
    JSON.stringify(extraction, null, 2) +
    '\n>>>' +
    resolvedBlock +
    identityBlock;

  try {
    // One AI call + parse + structural validation. Returns { dag } on success, or
    // { fail } with a user-facing message when the MODEL produced unusable output
    // (bad JSON, no nodes, dangling consumes). HTTP-level transient failures (429/5xx)
    // are already retried inside aiMessage; this handles CONTENT failures the gate
    // can't see — which is the class Beef Wellington hit (200 OK, malformed output).
    const attemptDecompose = async (): Promise<
      { dag: any } | { fail: { error: string; status: number; retryable?: boolean } }
    > => {
      const result = await aiMessage({
        // Model is configurable so we can A/B Haiku vs Sonnet for decompose without a code
        // change. Default = Sonnet 4.6 (current behavior, no env var needed). Set
        // DECOMPOSE_MODEL=claude-haiku-4-5-20251001 in the environment to try Haiku
        // (faster + cheaper generation — the dominant cost here per the latency analysis);
        // verify quality with the vessel-edges + multi-dish eval harnesses before keeping.
        // Remove the env var to instantly revert to Sonnet.
        model:      process.env.DECOMPOSE_MODEL || 'claude-sonnet-4-6',
        feature:    'import_parse',          // reuse existing feature label; decomposition is part of import
        accountId:  user.id,
        max_tokens: 8000,
        system:     SYSTEM + guideBlock,
        cacheSystem: true,   // SYSTEM + guideBlock is a large STABLE prefix (rules + task
                             // guide), identical across calls — ideal for prompt caching.
                             // The variable recipe is in the user message (after system),
                             // so the cached prefix stays stable. ~0.1x cost + faster
                             // prefill on hits within the TTL.
        messages:   [{ role: 'user', content: userMsg }],
      });

      if (!result.ok) {
        console.error('[decompose] Anthropic error:', result.errorText);
        return { fail: { error: 'Decomposition failed', status: 502 } };
      }

      // Robust extraction: strip fences, take outermost { ... } (same pattern as import).
      const raw = result.data.content?.[0]?.text ?? '';
      let clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const a = clean.indexOf('{');
      const b = clean.lastIndexOf('}');
      if (a !== -1 && b !== -1 && b > a) clean = clean.slice(a, b + 1);

      let dag: any;
      try {
        dag = JSON.parse(clean);
      } catch {
        console.error('[decompose] JSON parse failed. rawLen=%d, tail=%j', raw.length, raw.slice(-200));
        return { fail: { error: 'We had trouble structuring that recipe. Please try again.', status: 502, retryable: true } };
      }

      if (!Array.isArray(dag.nodes) || dag.nodes.length === 0) {
        return { fail: { error: 'Decomposition returned no steps', status: 502, retryable: true } };
      }

      // Light structural guard (cheap; full validation lives in decompose-save).
      const ids = new Set(dag.nodes.map((n: any) => n.id));
      for (const n of dag.nodes) {
        for (const c of n.consumes ?? []) {
          if (!ids.has(c)) {
            console.error('[decompose] node %s consumes unknown id %s', n.id, c);
            return { fail: { error: 'Decomposition produced an invalid graph. Please try again.', status: 502, retryable: true } };
          }
        }
      }

      // Ensure linkedDishes is always an array (model may omit it for single-dish).
      if (!Array.isArray(dag.linkedDishes)) dag.linkedDishes = [];
      return { dag };
    };

    // Try up to twice: a content failure on the first attempt is usually transient
    // (the model is non-deterministic — re-calling often yields valid output, as Beef
    // Wellington demonstrated). Only surface the error after BOTH attempts fail, so a
    // one-off malformed generation self-heals without the user seeing it.
    const MAX_DECOMPOSE_ATTEMPTS = 2;
    let lastFail: { error: string; status: number; retryable?: boolean } | null = null;
    for (let attempt = 1; attempt <= MAX_DECOMPOSE_ATTEMPTS; attempt++) {
      const outcome = await attemptDecompose();
      if ('dag' in outcome) {
        return NextResponse.json({ dag: outcome.dag });
      }
      lastFail = outcome.fail;
      if (attempt < MAX_DECOMPOSE_ATTEMPTS) {
        console.warn('[decompose] attempt %d failed (%s) — retrying once', attempt, lastFail.error);
      }
    }
    // Both attempts failed — surface the last failure to the user (still retryable).
    return NextResponse.json(
      { error: lastFail!.error, ...(lastFail!.retryable ? { retryable: true } : {}) },
      { status: lastFail!.status },
    );

  } catch (err: any) {
    console.error('[decompose]', err);
    return NextResponse.json({ error: err.message ?? 'Decomposition failed' }, { status: 500 });
  }
}
