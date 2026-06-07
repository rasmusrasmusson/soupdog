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
2. One ingredient per node, always — NO bundling, ever. Each ingredient enters the graph at its OWN node. A node's "ingredients" array holds AT MOST ONE ingredient. "add the flour, sugar and salt" → THREE separate add nodes. Cooking liquids/media count as ingredients: "boil the pasta in water" → a node for water AND a separate node for pasta, never boil [pasta, water] in one node (same for stock, oil, brine). Finishing/seasoning liquids count too: "finish with a squeeze of lime" → a separate add node for lime, THEN the mix node that consumes it. A transformation node (mix, simmer, whisk, combine, bake) acting on already-introduced inputs has an EMPTY ingredients array; it only consumes prior nodes. Introduce each ingredient EXACTLY ONCE — after it appears on its introduction node, NEVER list it again on a later node; refer to it only via consumes. "Chop the onion, then add the chopped onion to the pan" → ONE chop node introducing onion, and the pan node simply consumes the chop node (empty ingredients). Do NOT re-list "onion (chopped)" on the pan node. The display layer re-bundles them; you must not.
3. Match on the transformation, parameters absorb the variant. "sauté" / "fry gently" / "cook in a little oil" are the SAME task ("sauté") with different params. "stir" / "stir gently" / "stir vigorously" = ONE task ("stir") + a vigour param. But genuinely different transformations stay different tasks: sauté ≠ sear ≠ boil ≠ braise ≠ fold ≠ whisk. When unsure, prefer the more general existing-sounding verb over inventing a new one — but NEVER merge two distinct transformations. Use lowercase canonical verb names.
4. Edges = real dependencies, NOT sequence. "consumes" lists the node ids whose OUTPUT this node needs before it can start. A node depends on another ONLY if it uses that node's product or the same vessel's accumulated contents. Two prep chains that never meet until a later combine MUST NOT depend on each other — that independence is the parallelism the graph exists to capture. Do not chain every node to the previous one. The first node(s) touching only raw ingredients have empty consumes.
5. Intermediates & convergence. A node that consumes TWO OR MORE prior outputs is a convergence point (a combine, a plating). The chain of nodes feeding one input of a convergence is a sub-graph that produces an intermediate — give it a short "produces" name on the LAST node of that chain. If the source explicitly names a section ("For the marinade:", "Masala sauce:"), use that exact name and set "group" on those nodes. Explicit names always win over your own derivation.
6. Fan-out. One prep can feed several consumers. Emit ONE node; multiple later nodes list it in consumes. Put per-consumer quantities on the consuming node's notes if the source specifies a split.
7. Tools & timing. Suggest a "tool" per node. For waits, set "passive": true and put the duration/criterion in "completion": a fixed time ("PT12M") OR an observable end-state ("until golden", "internal temp 74C"). Map "until X" to an observable completion, not a guess at minutes.

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
    }
  ]
}

Hard constraints:
- Every consumes id must reference an EARLIER node's id. No cycles. No self-edges.
- Every ingredient from the extraction appears in exactly one node's ingredients (introduced once, then referenced via consumes, never re-listed).
- At least one terminal node (nothing consumes it) — the finished dish / plating.
- Independent prep chains share NO edges until they converge.
- "add" is a valid task for introducing an ingredient into an existing vessel.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const extraction = body?.extraction;
  if (!extraction || typeof extraction !== 'object') {
    return NextResponse.json({ error: 'extraction required' }, { status: 400 });
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
      system:     SYSTEM,
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
