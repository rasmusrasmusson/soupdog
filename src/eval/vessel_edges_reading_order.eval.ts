// src/eval/vessel_edges_reading_order.eval.ts
//
// EVAL SET — honest vessel edges & cook-along reading order.
// Locks in the Phase A (prompt) + toposort (order_index) behaviour verified by hand
// on greek-salad and béchamel, so a future prompt change can't silently regress it.
// Spec: Soupdog_Honest_Vessel_Edges_And_Reading_Order_Design_v0_1.md §6 Phase B.
//
// THE BEHAVIOURS A VESSEL-ACCUMULATION DECOMPOSITION MUST HAVE:
//   (O) ORDER — order-INDEPENDENT adds into a passive container (salad bowl) have NO
//       inter-sibling edges (add-cucumber does not depend on add-tomato); order-
//       DEPENDENT accumulation (a roux) KEEPS its chain.
//   (E) EMISSION/READING — a consumer follows its producer (cut-one-add-one), and no
//       consumer ever precedes a producer in order_index (the toposort guarantee).
//   (C) CONVERGENCE — the final combine (toss/whisk) fans in from ALL its inputs.
//
// Reuses the type + assertion shapes from multi_dish_decomposition.eval.ts.

import type { Extraction, Dag, DagNode } from './multi_dish_decomposition.eval';

// Local assertion type — this eval's behaviour codes (O/E/C) are specific to vessel
// edges & reading order, distinct from the multi-dish eval's M/T/R/G. Kept local so
// the shared eval file stays untouched.
type Assertion = { name: string; behaviour: 'O' | 'E' | 'C'; check: (dag: Dag) => boolean | string };

// ─── pure helpers over the DAG ───────────────────────────────────────────────
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// node whose task+ingredient (or instruction-ish) matches a verb on an ingredient
const findNode = (dag: Dag, verb: string, ingredient?: string): DagNode | undefined =>
  dag.nodes.find(n =>
    norm(n.task).includes(norm(verb)) &&
    (ingredient ? (n.ingredients ?? []).some(i => norm(i.name).includes(norm(ingredient))) : true)
  );

// the "add X" node for an ingredient (task add/combine, consuming a prep, into a vessel)
const addNodeFor = (dag: Dag, ingredient: string): DagNode | undefined =>
  dag.nodes.find(n =>
    /add|combine|place|tip|scatter|lay/.test(norm(n.task)) &&
    ( (n.ingredients ?? []).some(i => norm(i.name).includes(norm(ingredient)))
      || norm(n.produces).includes(norm(ingredient))
      || (n.consumes ?? []).some(cid => {
           const p = dag.nodes.find(x => x.id === cid);
           return p && (p.ingredients ?? []).some(i => norm(i.name).includes(norm(ingredient)));
         })
    )
  );

const prepNodeFor = (dag: Dag, ingredient: string): DagNode | undefined =>
  dag.nodes.find(n =>
    /slice|chop|dice|cut|grate|mince|tear/.test(norm(n.task)) &&
    (n.ingredients ?? []).some(i => norm(i.name).includes(norm(ingredient)))
  );

const indexOf = (dag: Dag, id: string | undefined): number =>
  id ? dag.nodes.findIndex(n => n.id === id) : -1;

// does node A (transitively) depend on node B?
const dependsOn = (dag: Dag, aId: string, bId: string): boolean => {
  const seen = new Set<string>(); const stack = [aId];
  while (stack.length) {
    const cur = stack.pop()!;
    const node = dag.nodes.find(n => n.id === cur);
    for (const c of (node?.consumes ?? [])) {
      if (c === bId) return true;
      if (!seen.has(c)) { seen.add(c); stack.push(c); }
    }
  }
  return false;
};

// ─── CASE 1 — Greek salad: order-INDEPENDENT bowl (concurrent siblings) ───────
export const caseSaladConcurrent: { name: string; extraction: Extraction; assertions: Assertion[] } = {
  name: 'greek salad: adds into the bowl are concurrent siblings, read cut-one-add-one, toss converges all',
  extraction: {
    title: 'Greek Salad',
    servings: 2,
    ingredients: [
      { name: 'tomato', quantityValue: 2, quantityUnit: 'piece', prepNote: 'sliced' },
      { name: 'cucumber', quantityValue: 1, quantityUnit: 'piece', prepNote: 'sliced' },
      { name: 'green pepper', quantityValue: 1, quantityUnit: 'piece', prepNote: 'sliced' },
      { name: 'red onion', quantityValue: 0.5, quantityUnit: 'piece', prepNote: 'sliced' },
      { name: 'kalamata olives', quantityValue: 80, quantityUnit: 'g', prepNote: null },
    ],
    equipment: ['chefs knife', 'large bowl'],
    groups: [{
      outputName: '',
      steps: [
        { instruction: 'Slice the tomato', stepIngredients: ['tomato'], stepTools: ['chefs knife'], taskFamily: 'cut' },
        { instruction: 'Slice the cucumber', stepIngredients: ['cucumber'], stepTools: ['chefs knife'], taskFamily: 'cut' },
        { instruction: 'Slice the green pepper', stepIngredients: ['green pepper'], stepTools: ['chefs knife'], taskFamily: 'cut' },
        { instruction: 'Slice the red onion', stepIngredients: ['red onion'], stepTools: ['chefs knife'], taskFamily: 'cut' },
        { instruction: 'Add the sliced tomato, cucumber, pepper and onion to the bowl with the olives', stepIngredients: ['kalamata olives'], stepTools: ['large bowl'], taskFamily: 'combine' },
        { instruction: 'Toss', stepIngredients: [], stepTools: ['large bowl'], taskFamily: 'mix' },
      ],
    }],
  },
  assertions: [
    {
      name: 'each add depends on its OWN prep (add-tomato consumes slice-tomato)',
      behaviour: 'E',
      check: (dag) => {
        const addT = addNodeFor(dag, 'tomato'); const prepT = prepNodeFor(dag, 'tomato');
        if (!addT || !prepT) return 'could not locate tomato add/prep nodes';
        return dependsOn(dag, addT.id, prepT.id) ? true : 'add-tomato does not depend on slice-tomato';
      },
    },
    {
      name: 'adds are NOT chained to each other (add-cucumber does NOT depend on add-tomato)',
      behaviour: 'O',
      check: (dag) => {
        const addT = addNodeFor(dag, 'tomato'); const addC = addNodeFor(dag, 'cucumber');
        if (!addT || !addC) return 'could not locate add nodes';
        if (addT.id === addC.id) return true; // a single combined add node is also fine (no chain)
        return !dependsOn(dag, addC.id, addT.id) ? true : 'FALSE EDGE: add-cucumber depends on add-tomato';
      },
    },
    {
      name: 'reads cut-one-add-one (slice-tomato immediately precedes its add)',
      behaviour: 'E',
      check: (dag) => {
        const addT = addNodeFor(dag, 'tomato'); const prepT = prepNodeFor(dag, 'tomato');
        const ai = indexOf(dag, addT?.id), pi = indexOf(dag, prepT?.id);
        if (ai < 0 || pi < 0) return 'tomato nodes missing';
        return ai > pi ? true : 'tomato add does not follow its slice in order';
      },
    },
    {
      name: 'no consumer precedes its producer anywhere (toposort guarantee)',
      behaviour: 'E',
      check: (dag) => {
        for (let i = 0; i < dag.nodes.length; i++) {
          for (const cid of (dag.nodes[i].consumes ?? [])) {
            const pi = dag.nodes.findIndex(n => n.id === cid);
            if (pi > i) return `node ${dag.nodes[i].id} (pos ${i}) precedes its producer ${cid} (pos ${pi})`;
          }
        }
        return true;
      },
    },
    {
      name: 'the toss/convergence fans in from multiple adds',
      behaviour: 'C',
      check: (dag) => {
        const toss = findNode(dag, 'toss') ?? findNode(dag, 'mix');
        if (!toss) return 'no toss/mix convergence node';
        return (toss.consumes ?? []).length >= 2 ? true : `convergence fans in from ${(toss.consumes ?? []).length}, expected ≥2`;
      },
    },
  ],
};

// ─── CASE 2 — Béchamel: order-DEPENDENT chain (must keep its edges) ───────────
export const caseBechamelOrdered: { name: string; extraction: Extraction; assertions: Assertion[] } = {
  name: 'béchamel: roux is order-dependent — add-flour depends on melt-butter, add-milk on the roux',
  extraction: {
    title: 'Béchamel Sauce',
    servings: 4,
    ingredients: [
      { name: 'unsalted butter', quantityValue: 50, quantityUnit: 'g', prepNote: null },
      { name: 'plain flour', quantityValue: 50, quantityUnit: 'g', prepNote: null },
      { name: 'whole milk', quantityValue: 500, quantityUnit: 'ml', prepNote: 'warmed' },
    ],
    equipment: ['saucepan', 'whisk'],
    groups: [{
      outputName: '',
      steps: [
        { instruction: 'Melt the butter in the saucepan', stepIngredients: ['unsalted butter'], stepTools: ['saucepan'], taskFamily: 'heat', durationMinutes: 2 },
        { instruction: 'Stir in the flour and cook to a pale roux', stepIngredients: ['plain flour'], stepTools: ['whisk'], taskFamily: 'mix', durationMinutes: 2 },
        { instruction: 'Gradually add the warmed milk, whisking constantly after each addition', stepIngredients: ['whole milk'], stepTools: ['whisk'], taskFamily: 'mix' },
        { instruction: 'Whisk until the sauce coats the back of a spoon', stepIngredients: [], stepTools: ['whisk'], taskFamily: 'mix', durationMinutes: 6 },
      ],
    }],
  },
  assertions: [
    {
      name: 'add-flour depends on melt-butter (roux chain kept)',
      behaviour: 'O',
      check: (dag) => {
        const flour = findNode(dag, 'add', 'flour') ?? findNode(dag, 'stir', 'flour') ?? findNode(dag, 'mix', 'flour');
        const melt = findNode(dag, 'melt', 'butter') ?? findNode(dag, 'heat', 'butter');
        if (!flour || !melt) return 'could not locate flour/butter nodes';
        return dependsOn(dag, flour.id, melt.id) ? true : 'add-flour does NOT depend on melt-butter (chain wrongly stripped)';
      },
    },
    {
      name: 'milk depends on the flour/roux step (order-dependent, not concurrent)',
      behaviour: 'O',
      check: (dag) => {
        const milk = findNode(dag, 'add', 'milk') ?? findNode(dag, 'mix', 'milk');
        const flour = findNode(dag, 'add', 'flour') ?? findNode(dag, 'stir', 'flour') ?? findNode(dag, 'mix', 'flour');
        if (!milk || !flour) return 'could not locate milk/flour nodes';
        return dependsOn(dag, milk.id, flour.id) ? true : 'add-milk does NOT depend on the roux (wrongly made concurrent)';
      },
    },
    {
      name: 'no consumer precedes its producer (toposort guarantee)',
      behaviour: 'E',
      check: (dag) => {
        for (let i = 0; i < dag.nodes.length; i++) {
          for (const cid of (dag.nodes[i].consumes ?? [])) {
            const pi = dag.nodes.findIndex(n => n.id === cid);
            if (pi > i) return `node ${dag.nodes[i].id} (pos ${i}) precedes producer ${cid} (pos ${pi})`;
          }
        }
        return true;
      },
    },
  ],
};

export const vesselEdgesCases = [caseSaladConcurrent, caseBechamelOrdered];
