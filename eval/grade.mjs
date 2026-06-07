// eval/grade.mjs
// Decomposition eval grader. Run: node eval/grade.mjs
//
// WHY: dependency-inference is the hard part of decomposition. A run that produces
// valid JSON can still produce a WRONG graph — the classic failure is "linear": every
// node depends on the previous one, which destroys the parallelism the DAG exists for.
// This grader checks STRUCTURE (is it a valid DAG?) and EDGE CORRECTNESS (does the
// dependency set match the gold set?) separately, so we can see whether the model gets
// the shape right but the edges wrong.
//
// It grades the JSON the prompt emits, BEFORE any DB insert — the cheapest place to
// catch dependency errors. It does NOT test find-or-create (that's code-side).
//
// Each gold case (eval/cases/*.json) has:
//   { name, extraction, gold: { nodes:[{id, task, consumes:[...], produces?}], terminals:[ids] } }
// Gold edges are expressed as a SET per node — order of ids doesn't matter, identity does.
// Because node ids the model picks won't match gold ids, we ALIGN by a signature
// (task + sorted ingredient names + sorted consumed-signatures), computed bottom-up.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(HERE, "cases");

// ---- structural validators (run on the model output alone) -------------------

function structuralErrors(out) {
  const errs = [];
  if (!out || !Array.isArray(out.nodes)) return ["no nodes array"];
  const ids = new Set();
  for (const n of out.nodes) {
    if (!n.id) errs.push(`node missing id`);
    if (ids.has(n.id)) errs.push(`duplicate id ${n.id}`);
    ids.add(n.id);
    if (!n.task) errs.push(`node ${n.id} missing task`);
    if (!Array.isArray(n.consumes)) errs.push(`node ${n.id} consumes not array`);
  }
  // edges reference earlier-or-existing ids, no self-edge, no cycle
  const index = new Map(out.nodes.map((n, i) => [n.id, i]));
  for (const n of out.nodes) {
    for (const c of n.consumes || []) {
      if (!index.has(c)) errs.push(`node ${n.id} consumes unknown id ${c}`);
      if (c === n.id) errs.push(`node ${n.id} self-edge`);
    }
  }
  if (hasCycle(out.nodes)) errs.push("graph has a cycle");
  const terminals = out.nodes.filter(
    (n) => !out.nodes.some((m) => (m.consumes || []).includes(n.id))
  );
  if (terminals.length === 0) errs.push("no terminal node");
  // ingredient introduced exactly once
  const seen = new Map();
  for (const n of out.nodes)
    for (const ing of n.ingredients || []) {
      const k = (ing.name || "").toLowerCase().trim();
      if (!k) continue;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  for (const [k, c] of seen) if (c > 1) errs.push(`ingredient "${k}" introduced ${c}×`);
  return errs;
}

function hasCycle(nodes) {
  const adj = new Map(nodes.map((n) => [n.id, n.consumes || []]));
  const state = new Map(); // 0=unseen,1=instack,2=done
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

// ---- signature alignment (match model nodes to gold nodes structurally) ------
// A node's signature is task + its ingredient names + the MULTISET of its consumed
// signatures. Computed bottom-up so it's id-independent. Two graphs that are
// isomorphic-by-meaning get identical signatures.

function signatures(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map();
  const sig = (id, guard = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (guard.has(id)) return "CYCLE";
    guard.add(id);
    const n = byId.get(id);
    if (!n) return "MISSING";
    const ings = (n.ingredients || [])
      .map((i) => (i.name || "").toLowerCase().trim())
      .sort()
      .join(",");
    const childSigs = (n.consumes || [])
      .map((c) => sig(c, guard))
      .sort()
      .join("|");
    const s = `${(n.task || "").toLowerCase()}(${ings})[${childSigs}]`;
    memo.set(id, s);
    return s;
  };
  const out = new Map();
  for (const n of nodes) out.set(n.id, sig(n.id));
  return out;
}

// ---- edge-correctness score --------------------------------------------------
// Compare the model's dependency structure to gold by aligning on signatures.
// We score: node-recall (did gold nodes get produced?), edge precision/recall
// (do the consumes-sets match on aligned nodes), and a LINEARITY penalty flag.

function gradeEdges(out, gold) {
  const modelSig = signatures(out.nodes);
  const goldSig = signatures(gold.nodes);

  // map gold signature -> set of model nodes that match
  const modelBySig = new Map();
  for (const [id, s] of modelSig) {
    if (!modelBySig.has(s)) modelBySig.set(s, []);
    modelBySig.get(s).push(id);
  }

  let nodeHits = 0;
  for (const [, s] of goldSig) if (modelBySig.has(s) && modelBySig.get(s).length) nodeHits++;
  const nodeRecall = goldSig.size ? nodeHits / goldSig.size : 0;

  // edge comparison: build the set of (consumer-sig -> consumed-sig) pairs for each graph
  const edgeSet = (nodes, sigs) => {
    const s = new Set();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes)
      for (const c of n.consumes || [])
        if (byId.has(c)) s.add(`${sigs.get(n.id)} <= ${sigs.get(c)}`);
    return s;
  };
  const me = edgeSet(out.nodes, modelSig);
  const ge = edgeSet(gold.nodes, goldSig);
  let inter = 0;
  for (const e of ge) if (me.has(e)) inter++;
  const edgeRecall = ge.size ? inter / ge.size : 1;
  const edgePrecision = me.size ? inter / me.size : 1;

  // linearity flag: model produced a near-chain (edges ≈ nodes-1, max in-degree 1)
  const indeg = new Map(out.nodes.map((n) => [n.id, 0]));
  for (const n of out.nodes) for (const c of n.consumes || []) indeg.set(c, (indeg.get(c) || 0));
  // count consumers per node = out-edges; linear if total edges ≈ N-1 and no fan-in
  const totalEdges = out.nodes.reduce((a, n) => a + (n.consumes?.length || 0), 0);
  const maxConsumes = Math.max(0, ...out.nodes.map((n) => n.consumes?.length || 0));
  const looksLinear = totalEdges <= out.nodes.length - 1 && maxConsumes <= 1 && ge.size > out.nodes.length - 1;

  return { nodeRecall, edgeRecall, edgePrecision, looksLinear };
}

// ---- runner ------------------------------------------------------------------
// In CI you'd call the real model here. For offline grading, a case may include a
// `prediction` field (a captured model output) to grade without an API call. If
// absent and ANTHROPIC_API_KEY is set, this would call the model (left as a TODO
// hook so the harness runs with zero network in this environment).

function loadCases() {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) }));
}

function gradeOne(c) {
  const out = c.prediction; // captured model output, or null
  if (!out) return { name: c.name, skipped: "no prediction captured (wire model call here)" };
  const structural = structuralErrors(out);
  const edges = structural.length ? null : gradeEdges(out, c.gold);
  const pass =
    structural.length === 0 &&
    edges.nodeRecall >= 0.9 &&
    edges.edgeRecall >= 0.85 &&
    edges.edgePrecision >= 0.8 &&
    !edges.looksLinear;
  return { name: c.name, pass, structural, edges };
}

function main() {
  const cases = loadCases();
  let pass = 0,
    graded = 0;
  for (const c of cases) {
    const r = gradeOne(c);
    if (r.skipped) {
      console.log(`SKIP  ${r.name}: ${r.skipped}`);
      continue;
    }
    graded++;
    if (r.pass) pass++;
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
    if (r.structural?.length) console.log(`      structural: ${r.structural.join("; ")}`);
    if (r.edges)
      console.log(
        `      nodeRecall=${r.edges.nodeRecall.toFixed(2)} ` +
          `edgeRecall=${r.edges.edgeRecall.toFixed(2)} ` +
          `edgePrecision=${r.edges.edgePrecision.toFixed(2)}` +
          (r.edges.looksLinear ? "  ⚠ LOOKS LINEAR" : "")
      );
  }
  console.log(`\n${pass}/${graded} graded cases passed (${cases.length - graded} skipped).`);
}

main();
