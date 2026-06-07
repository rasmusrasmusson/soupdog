// eval/run-case.mjs
// Standalone: run the step-2 decomposition prompt against live Sonnet for ONE eval
// case, print the model's JSON, and optionally write it into the case's `prediction`
// field so `node eval/grade.mjs` can grade it. Nothing here touches the app.
//
//   node eval/run-case.mjs 03                # run case 03, print result only
//   node eval/run-case.mjs 03 --save         # also write result into the case file
//
// Needs ANTHROPIC_API_KEY in the environment (Clash Verge TUN on for the API).
//   PowerShell:  $env:ANTHROPIC_API_KEY = "sk-ant-..."   (then run the command)
//
// The prompt text is kept here in sync with prompts/decomposition_step2_prompt.md.
// If you edit the prompt doc, mirror the SYSTEM string below (single source later).

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, "cases");
const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You convert a bundled recipe into an atomic executable dependency graph. The graph is for machines (Cook Mode, connected appliances, parallel scheduling, division of labour) and is re-bundled into readable prose for humans by a separate display layer — so optimise for correctness and atomicity, not readability.

Return ONLY a single JSON object, no preamble, no markdown fences.

Core rules:
1. One transformation per node. A node is one culinary action on its inputs. Stop at the culinary verb. Do NOT model micro-motions (pick up, pour, set down), retrieval, or opening packages. Assume continuity — a bowl/pan persists across the nodes that use it.
2. One ingredient per node, always — NO bundling, ever. Each ingredient enters the graph at its OWN node. A node's "ingredients" array holds AT MOST ONE ingredient. "add the flour, sugar and salt" → THREE separate add nodes. Cooking liquids/media count as ingredients: "boil the pasta in water" → a node for water AND a separate node for pasta, never boil [pasta, water] in one node (same for stock, oil, brine). Finishing/seasoning liquids count too: "finish with a squeeze of lime" → a separate add node for lime, THEN the mix node that consumes it. A transformation node (mix, simmer, whisk, combine, bake) acting on already-introduced inputs has an EMPTY ingredients array; it only consumes prior nodes. The display layer re-bundles them; you must not.
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

function findCaseFile(prefix) {
  const f = readdirSync(CASES_DIR).find((x) => x.startsWith(prefix) && x.endsWith(".json"));
  if (!f) throw new Error(`no case file starting with "${prefix}" in ${CASES_DIR}`);
  return join(CASES_DIR, f);
}

function extractJson(text) {
  // raw -> fence-strip -> outermost {...}
  let t = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(t);
  } catch {}
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("could not parse JSON from model response");
}

async function main() {
  const prefix = process.argv[2];
  const save = process.argv.includes("--save");
  if (!prefix) {
    console.error("usage: node eval/run-case.mjs <case-prefix> [--save]");
    process.exit(1);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("ANTHROPIC_API_KEY not set. (PowerShell: $env:ANTHROPIC_API_KEY = \"sk-ant-...\")");
    process.exit(1);
  }

  const file = findCaseFile(prefix);
  const c = JSON.parse(readFileSync(file, "utf8"));

  const userMsg =
    "Here is the bundled extraction of a recipe. Convert it to the atomic executable " +
    "dependency graph per your instructions. Return ONLY the JSON object.\n\nEXTRACTION:\n<<<\n" +
    JSON.stringify(c.extraction, null, 2) +
    "\n>>>";

  console.log(`Calling ${MODEL} for case "${c.name}"...`);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    console.error(`API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || "").join("\n");
  const out = extractJson(text);

  console.log("\n--- model output ---");
  console.log(JSON.stringify(out, null, 2));

  if (save) {
    c.prediction = out;
    writeFileSync(file, JSON.stringify(c, null, 2) + "\n");
    console.log(`\nSaved prediction into ${file}. Now run: node eval/grade.mjs`);
  } else {
    console.log("\n(run again with --save to write this into the case file for grading)");
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
