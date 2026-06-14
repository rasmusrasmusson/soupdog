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

// Hardened step-2 system prompt — kept in sync with
// prompts/decomposition_step2_prompt.md and eval/run-case.mjs. Strict atomicity
// (one ingredient per node, incl. cooking liquids + finishing squeezes; introduce
// each ingredient once) + dependency edges + named groups.
const SYSTEM = `You convert a bundled recipe into an atomic executable dependency graph. The graph is for machines (Cook Mode, connected appliances, parallel scheduling, division of labour) and is re-bundled into readable prose for humans by a separate display layer — so optimise for correctness and atomicity, not readability.

Return ONLY a single JSON object, no preamble, no markdown fences.

Core rules:
1. One transformation per node. A node is one culinary action on its inputs. Stop at the culinary verb. Do NOT model micro-motions (pick up, pour, set down), retrieval, or opening packages. Assume continuity — a bowl/pan persists across the nodes that use it.
2. One ingredient per node, always — NO bundling, ever. Each ingredient enters the graph at its OWN node. A node's "ingredients" array holds AT MOST ONE ingredient. "add the flour, sugar and salt" → THREE separate add nodes. Cooking liquids/media count as ingredients: "boil the pasta in water" → a node for water AND a separate node for pasta, never boil [pasta, water] in one node (same for stock, oil, brine). Finishing/seasoning liquids count too: "finish with a squeeze of lime" → a separate add node for lime, THEN the mix node that consumes it. A transformation node (mix, simmer, whisk, combine, bake) acting on already-introduced inputs has an EMPTY ingredients array; it only consumes prior nodes. Introduce each ingredient EXACTLY ONCE — after it appears on its introduction node, NEVER list it again on a later node; refer to it only via consumes. "Chop the onion, then add the chopped onion to the pan" → ONE chop node introducing onion, and the pan node simply consumes the chop node (empty ingredients). Do NOT re-list "onion (chopped)" on the pan node. The display layer re-bundles them; you must not. STRUCTURED QUANTITY IS MANDATORY: whenever a node introduces an ingredient, that ingredient's name, qty (number), and unit MUST be in the node's "ingredients" array — NEVER convey the quantity only in prose. The structured fields are the single source of truth; the human-readable instruction is generated downstream FROM them. "add 3 l water" → ingredients:[{name:"water",qty:3,unit:"l"}], not an empty array. If a quantity is genuinely unspecified in the source, include the ingredient with qty:null — but still include it in the array.
3. Match on the transformation, parameters absorb the variant. "sauté" / "fry gently" / "cook in a little oil" are the SAME task ("sauté") with different params. "stir" / "stir gently" / "stir vigorously" = ONE task ("stir") + a vigour param. But genuinely different transformations stay different tasks: sauté ≠ sear ≠ boil ≠ braise ≠ fold ≠ whisk. When unsure, prefer the more general existing-sounding verb over inventing a new one — but NEVER merge two distinct transformations. Use lowercase canonical verb names.
2b. Prep that is a TRANSFORMATION becomes its OWN task — never a prep-note. If an ingredient is listed with a transformation done to it ("100g pecorino, finely grated"; "1 onion, diced"; "2 cloves garlic, minced"; "carrots, peeled and sliced"), the transformation is a TASK, not text on the ingredient. Introduce the RAW ingredient ("pecorino"), then emit the transformation task ("grate" → grated pecorino; "dice" → diced onion), with the qualifier as a PARAMETER (finely → params {fineness:"fine"}). The ingredient's "prep" field is ONLY for non-transformation qualifiers that are NOT actions ("at room temperature", "best quality", "ripe", "skin-on"). NEVER put "grated"/"diced"/"chopped"/"minced"/"sliced"/"peeled" etc. in "prep" — those are tasks. So "pecorino, finely grated" → an add/introduce node for pecorino (prep: null) + a grate node (params {fineness:"fine"}, produces "grated pecorino"). Do not also write "finely grated" on the ingredient.
4. Edges = real dependencies, NOT sequence. "consumes" lists the node ids whose OUTPUT this node needs before it can start. A node depends on another ONLY if it uses that node's product or the same vessel's accumulated contents. Two prep chains that never meet until a later combine MUST NOT depend on each other — that independence is the parallelism the graph exists to capture. Do not chain every node to the previous one. The first node(s) touching only raw ingredients have empty consumes.
5. Intermediates & convergence. A node that consumes TWO OR MORE prior outputs is a convergence point (a combine, a plating). The chain of nodes feeding one input of a convergence is a sub-graph that produces an intermediate — give it a short "produces" name on the LAST node of that chain. If the source explicitly names a section ("For the marinade:", "Masala sauce:"), use that exact name and set "group" on those nodes. Explicit names always win over your own derivation.
6. Fan-out. One prep can feed several consumers. Emit ONE node; multiple later nodes list it in consumes. Put per-consumer quantities on the consuming node's notes if the source specifies a split.
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
  ]
}

Hard constraints:
- Every consumes id must reference an EARLIER node's id. No cycles. No self-edges.
- Every ingredient from the extraction appears in exactly one node's ingredients (introduced once, then referenced via consumes, never re-listed).
- At least one terminal node (nothing consumes it) — the finished dish / plating.
- Independent prep chains share NO edges until they converge.
- "add" is a valid task for introducing an ingredient into an existing vessel.
- Never use a tool name as a "task" value (rule 9). Never invent a step absent from the source (rule 8).
- If the source states a time or end-condition for a step, that step's "completion" MUST be populated (rule 7).
- EVERY ingredient that appears in any instruction text MUST also be present in some node's structured "ingredients" array with its qty and unit. Before returning, verify: the count of distinct ingredients you introduced in the structured arrays equals the count of distinct ingredients the recipe actually uses. If any ingredient is mentioned but not in a structured array, FIX it before returning. A graph with cooking steps but zero structured ingredients is INVALID.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const extraction = body?.extraction;
  if (!extraction || typeof extraction !== 'object') {
    return NextResponse.json({ error: 'extraction required' }, { status: 400 });
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

  const userMsg =
    'Here is the bundled extraction of a recipe. Convert it to the atomic executable ' +
    'dependency graph per your instructions. Return ONLY the JSON object.\n\nEXTRACTION:\n<<<\n' +
    JSON.stringify(extraction, null, 2) +
    '\n>>>';

  try {
    const result = await aiMessage({
      model:      'claude-sonnet-4-6',
      feature:    'import_parse',          // reuse existing feature label; decomposition is part of import
      accountId:  user.id,
      max_tokens: 8000,
      system:     SYSTEM + guideBlock,
      messages:   [{ role: 'user', content: userMsg }],
    });

    if (!result.ok) {
      console.error('[decompose] Anthropic error:', result.errorText);
      return NextResponse.json({ error: 'Decomposition failed' }, { status: 502 });
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
      return NextResponse.json({
        error: 'We had trouble structuring that recipe. Please try again.',
        retryable: true,
      }, { status: 502 });
    }

    if (!Array.isArray(dag.nodes) || dag.nodes.length === 0) {
      return NextResponse.json({ error: 'Decomposition returned no steps' }, { status: 502 });
    }

    // Light structural guard (cheap; full validation lives in decompose-save).
    const ids = new Set(dag.nodes.map((n: any) => n.id));
    for (const n of dag.nodes) {
      for (const c of n.consumes ?? []) {
        if (!ids.has(c)) {
          console.error('[decompose] node %s consumes unknown id %s', n.id, c);
          return NextResponse.json({ error: 'Decomposition produced an invalid graph. Please try again.', retryable: true }, { status: 502 });
        }
      }
    }

    return NextResponse.json({ dag });

  } catch (err: any) {
    console.error('[decompose]', err);
    return NextResponse.json({ error: err.message ?? 'Decomposition failed' }, { status: 500 });
  }
}
