// eval/grade.mjs  (v2 — ingredient-anchored alignment, tolerant edge scoring)
// Run: node eval/grade.mjs
//
// WHY v2: v1 aligned nodes by a RECURSIVE signature (task + ingredients + child
// signatures), demanding near-exact graph isomorphism. That false-failed CORRECT
// decompositions: a single defensible task-name difference near the root ("fry" vs
// "sauté", "heat oil" vs "add oil") poisoned every downstream signature, scoring a
// good graph at 0.00. Real recipes have multiple valid DAGs; the grader must measure
// whether the WIRING is right, not whether the verbs are identical.
//
// v2 approach — align, then score edges on the alignment:
//   1. ANCHOR each node by a stable identity independent of the rest of the graph:
//      the set of ingredients it introduces (case-folded), else its role for
//      ingredient-less combine/plate nodes.
//   2. MATCH model nodes to gold nodes on that anchor. Ingredient-introducers are
//      unambiguous. Process/combine nodes matched by topological depth + task family.
//   3. SCORE edges on the alignment. Tasks compared case-insensitively + via synonyms.
//
// Grades emitted JSON BEFORE any DB write. Does NOT test find-or-create.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, "cases");

const TASK_SYNONYMS = [
  ["add", "combine", "mix", "incorporate"],
  ["sauté", "saute", "fry", "pan-fry", "sweat", "soften"],
  ["heat", "warm"],
  ["simmer", "cook", "reduce", "braise"],
  ["boil", "blanch"],
  ["whisk", "beat", "blend"],
  ["stir", "fold"],
  ["plate", "serve", "assemble"],
  ["chop", "dice", "cut", "slice"],
];
const synGroup = new Map();
TASK_SYNONYMS.forEach((grp, i) => grp.forEach((t) => synGroup.set(t, i)));
const norm = (s) => (s || "").toLowerCase().trim();
const taskEq = (a, b) => {
  a = norm(a); b = norm(b);
  if (a === b) return true;
  return synGroup.has(a) && synGroup.get(a) === synGroup.get(b);
};
const ingKey = (n) =>
  (n.ingredients || []).map((i) => norm(i.name)).filter(Boolean).sort().join(",");

function structuralErrors(out) {
  const errs = [];
  if (!out || !Array.isArray(out.nodes)) return ["no nodes array"];
  const ids = new Set();
  for (const n of out.nodes) {
    if (!n.id) errs.push("node missing id");
    if (ids.has(n.id)) errs.push(`duplicate id ${n.id}`);
    ids.add(n.id);
    if (!n.task) errs.push(`node ${n.id} missing task`);
    if (!Array.isArray(n.consumes)) errs.push(`node ${n.id} consumes not array`);
  }
  const idset = new Set(out.nodes.map((n) => n.id));
  for (const n of out.nodes)
    for (const c of n.consumes || []) {
      if (!idset.has(c)) errs.push(`node ${n.id} consumes unknown id ${c}`);
      if (c === n.id) errs.push(`node ${n.id} self-edge`);
    }
  if (hasCycle(out.nodes)) errs.push("graph has a cycle");
  const terminals = out.nodes.filter((n) => !out.nodes.some((m) => (m.consumes || []).includes(n.id)));
  if (terminals.length === 0) errs.push("no terminal node");
  const seen = new Map();
  for (const n of out.nodes)
    for (const ing of n.ingredients || []) {
      const k = norm(ing.name);
      if (k) seen.set(k, (seen.get(k) || 0) + 1);
    }
  for (const [k, c] of seen) if (c > 1) errs.push(`ingredient "${k}" introduced ${c}×`);
  return errs;
}
function hasCycle(nodes) {
  const adj = new Map(nodes.map((n) => [n.id, n.consumes || []]));
  const state = new Map();
  let cyc = false;
  const visit = (id) => {
    if (state.get(id) === 1) return (cyc = true);
    if (state.get(id) === 2) return;
    state.set(id, 1);
    for (const c of adj.get(id) || []) if (adj.has(c)) visit(c);
    state.set(id, 2);
  };
  for (const n of nodes) if (!state.get(n.id)) visit(n.id);
  return cyc;
}
function topoDepth(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map();
  const d = (id, g = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (g.has(id)) return 0;
    g.add(id);
    const n = byId.get(id);
    const cs = (n?.consumes || []).filter((c) => byId.has(c));
    const v = cs.length ? 1 + Math.max(...cs.map((c) => d(c, g))) : 0;
    memo.set(id, v);
    return v;
  };
  const out = new Map();
  for (const n of nodes) out.set(n.id, d(n.id));
  return out;
}
function align(model, gold) {
  const map = new Map();
  const usedModel = new Set();
  const modelByIng = new Map();
  for (const n of model.nodes) {
    const k = ingKey(n);
    if (k) {
      if (!modelByIng.has(k)) modelByIng.set(k, []);
      modelByIng.get(k).push(n.id);
    }
  }
  for (const g of gold.nodes) {
    const k = ingKey(g);
    if (!k) continue;
    const cands = (modelByIng.get(k) || []).filter((id) => !usedModel.has(id));
    if (cands.length) { map.set(g.id, cands[0]); usedModel.add(cands[0]); }
  }
  const md = topoDepth(model.nodes);
  const gd = topoDepth(gold.nodes);
  const modelProc = model.nodes.filter((n) => !ingKey(n) && !usedModel.has(n.id));
  const goldProc = gold.nodes.filter((g) => !ingKey(g) && !map.has(g.id));
  for (const g of goldProc) {
    let best = null, bestScore = -1;
    for (const m of modelProc) {
      if (usedModel.has(m.id)) continue;
      const depthClose = 1 - Math.min(1, Math.abs((md.get(m.id) || 0) - (gd.get(g.id) || 0)) / 3);
      const taskClose = taskEq(m.task, g.task) ? 1 : 0;
      const score = depthClose + taskClose;
      if (score > bestScore) { bestScore = score; best = m.id; }
    }
    if (best) { map.set(g.id, best); usedModel.add(best); }
  }
  return map;
}
// ancestor set: all nodes reachable by following `consumes` transitively from `id`
// (i.e. everything `id` ultimately depends on). Used for reachability scoring.
function ancestors(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map();
  const anc = (id, guard = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (guard.has(id)) return new Set();
    guard.add(id);
    const set = new Set();
    for (const c of byId.get(id)?.consumes || []) {
      if (!byId.has(c)) continue;
      set.add(c);
      for (const a of anc(c, guard)) set.add(a);
    }
    memo.set(id, set);
    return set;
  };
  const out = new Map();
  for (const n of nodes) out.set(n.id, anc(n.id));
  return out;
}

function gradeEdges(model, gold) {
  const map = align(model, gold); // gold id -> model id
  const goldIds = gold.nodes.map((n) => n.id);
  const nodeRecall = goldIds.filter((id) => map.has(id)).length / (goldIds.length || 1);

  // REACHABILITY scoring (v3): a gold dependency A<=B means "A ultimately depends on
  // B". We score whether that ANCESTRY holds in the model between the aligned nodes,
  // not whether a DIRECT edge exists. This is invariant to the model inserting an
  // extra intermediate node (combine→mix) or ordering independent adds differently —
  // the run-to-run variance that made direct-edge matching false-fail correct graphs.
  const mAnc = ancestors(model.nodes);
  const gAnc = ancestors(gold.nodes);
  const revMap = new Map([...map].map(([g, m]) => [m, g])); // model id -> gold id

  // recall: for each gold ancestry pair (consumer, ancestor) between ALIGNED nodes,
  // does the model preserve it (aligned consumer reaches aligned ancestor)?
  let goldPairs = 0, recallHit = 0;
  for (const g of gold.nodes) {
    const mG = map.get(g.id);
    if (!mG) continue;
    for (const ga of gAnc.get(g.id) || []) {
      const mGa = map.get(ga);
      if (!mGa) continue;
      goldPairs++;
      if ((mAnc.get(mG) || new Set()).has(mGa)) recallHit++;
    }
  }
  const edgeRecall = goldPairs ? recallHit / goldPairs : 1;

  // precision: of the model's ancestry pairs between aligned nodes, how many are
  // licensed by gold ancestry? (catches the model inventing dependencies that
  // shouldn't exist — e.g. serialising two independent chains.)
  let modelPairs = 0, precHit = 0;
  for (const n of model.nodes) {
    const gN = revMap.get(n.id);
    if (!gN) continue;
    for (const ma of mAnc.get(n.id) || []) {
      const gA = revMap.get(ma);
      if (!gA) continue;
      modelPairs++;
      if ((gAnc.get(gN) || new Set()).has(gA)) precHit++;
    }
  }
  const edgePrecision = modelPairs ? precHit / modelPairs : 1;
  const goldFanout = gold.nodes.filter(
    (g) => gold.nodes.filter((x) => (x.consumes || []).includes(g.id)).length > 1
  );
  let fanoutKept = 0;
  for (const g of goldFanout) {
    const m = map.get(g.id);
    if (m && model.nodes.filter((x) => (x.consumes || []).includes(m)).length > 1) fanoutKept++;
  }
  const fanoutOk = goldFanout.length ? fanoutKept / goldFanout.length : 1;
  // linearity flag (reachability-aware): a linear collapse has NO convergence points.
  // Count direct multi-input nodes in each graph; flag only if gold expects
  // convergences and the model produced none.
  const modelConvergences = model.nodes.filter((n) => (n.consumes || []).length > 1).length;
  const goldConvergences = gold.nodes.filter((g) => (g.consumes || []).length > 1).length;
  const looksLinear = goldConvergences > 0 && modelConvergences === 0;
  return { nodeRecall, edgeRecall, edgePrecision, fanoutOk, looksLinear, matched: map.size, goldNodes: goldIds.length };
}
function loadCases() {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) }));
}
function gradeOne(c) {
  const out = c.prediction;
  if (!out) return { name: c.name, skipped: "no prediction captured (run eval/run-case.mjs)" };
  const structural = structuralErrors(out);
  const edges = structural.length ? null : gradeEdges(out, c.gold);
  const pass =
    structural.length === 0 &&
    edges.nodeRecall >= 0.85 &&
    edges.edgeRecall >= 0.85 &&
    edges.edgePrecision >= 0.6 &&
    edges.fanoutOk >= 0.99 &&
    !edges.looksLinear;
  return { name: c.name, pass, structural, edges };
}
function main() {
  const cases = loadCases();
  let pass = 0, graded = 0;
  for (const c of cases) {
    const r = gradeOne(c);
    if (r.skipped) { console.log(`SKIP  ${r.name}: ${r.skipped}`); continue; }
    graded++;
    if (r.pass) pass++;
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
    if (r.structural?.length) console.log(`      structural: ${r.structural.join("; ")}`);
    if (r.edges)
      console.log(
        `      nodes ${r.edges.matched}/${r.edges.goldNodes}  ` +
          `nodeRecall=${r.edges.nodeRecall.toFixed(2)}  ` +
          `edgeRecall=${r.edges.edgeRecall.toFixed(2)}  ` +
          `edgePrecision=${r.edges.edgePrecision.toFixed(2)}  ` +
          `fanout=${r.edges.fanoutOk.toFixed(2)}` +
          (r.edges.looksLinear ? "  ⚠ LOOKS LINEAR" : "")
      );
  }
  console.log(`\n${pass}/${graded} graded cases passed (${cases.length - graded} skipped).`);
}
main();
