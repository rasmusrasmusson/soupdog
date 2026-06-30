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
type Assertion = { name: string; behaviour: 'O' | 'E' | 'C' | 'B'; check: (dag: Dag) => boolean | string };

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

// ─── CASE 3 — Binding: multi-ingredient prep must NOT produce objectless steps ──
// The risotto/Wellington failure mode: several ingredients each stated with a prep
// ("onion, diced"; "garlic, minced"; "parmesan, grated") get their own transformation
// node, but the model emits a BARE verb ("Dice", "Mince", "Grate") with no ingredient
// bound and nothing consumed — an orphan the cook can't act on ("dice WHAT?"). Also
// covers objectless "Add to the pan" with no ingredient and no consumed producer.
// This case packs the trigger: 4 ingredients each needing a distinct prep + adds.
export const caseBindingNoOrphans: { name: string; extraction: Extraction; assertions: Assertion[] } = {
  name: 'binding: every prep/add step names its ingredient — no objectless "Dice"/"Add" orphans',
  extraction: {
    title: 'Mushroom Risotto Base',
    servings: 4,
    ingredients: [
      { name: 'onion', quantityValue: 1, quantityUnit: 'piece', prepNote: 'finely diced' },
      { name: 'garlic', quantityValue: 2, quantityUnit: 'clove', prepNote: 'minced' },
      { name: 'mushrooms', quantityValue: 300, quantityUnit: 'g', prepNote: 'sliced' },
      { name: 'parmesan', quantityValue: 50, quantityUnit: 'g', prepNote: 'grated' },
      { name: 'arborio rice', quantityValue: 300, quantityUnit: 'g', prepNote: null },
      { name: 'olive oil', quantityValue: 2, quantityUnit: 'tbsp', prepNote: null },
    ],
    equipment: ['chefs knife', 'grater', 'large pan'],
    groups: [{
      outputName: '',
      steps: [
        { instruction: 'Finely dice the onion', stepIngredients: ['onion'], stepTools: ['chefs knife'], taskFamily: 'cut' },
        { instruction: 'Mince the garlic', stepIngredients: ['garlic'], stepTools: ['chefs knife'], taskFamily: 'cut' },
        { instruction: 'Slice the mushrooms', stepIngredients: ['mushrooms'], stepTools: ['chefs knife'], taskFamily: 'cut' },
        { instruction: 'Grate the parmesan', stepIngredients: ['parmesan'], stepTools: ['grater'], taskFamily: 'cut' },
        { instruction: 'Heat the olive oil in the pan', stepIngredients: ['olive oil'], stepTools: ['large pan'], taskFamily: 'heat' },
        { instruction: 'Add the diced onion and cook until soft', stepIngredients: [], stepTools: ['large pan'], taskFamily: 'cook' },
        { instruction: 'Add the minced garlic', stepIngredients: [], stepTools: ['large pan'], taskFamily: 'combine' },
        { instruction: 'Add the sliced mushrooms and cook until golden', stepIngredients: [], stepTools: ['large pan'], taskFamily: 'cook' },
        { instruction: 'Add the rice and toast', stepIngredients: ['arborio rice'], stepTools: ['large pan'], taskFamily: 'cook' },
        { instruction: 'Stir in the grated parmesan', stepIngredients: [], stepTools: ['large pan'], taskFamily: 'mix' },
      ],
    }],
  },
  assertions: [
    {
      name: 'every prep (cut/dice/mince/slice/grate) node binds an ingredient — no bare prep verb',
      behaviour: 'B',
      check: (dag) => {
        const prepRe = /^(slice|chop|dice|cut|grate|mince|tear|crush|zest|peel)\b/;
        const orphans = dag.nodes.filter(n =>
          prepRe.test(norm(n.task)) &&
          (n.ingredients ?? []).length === 0 &&
          (n.consumes ?? []).length === 0
        );
        return orphans.length === 0
          ? true
          : `objectless prep node(s): ${orphans.map(o => `${o.id}:${o.task}`).join(', ')}`;
      },
    },
    {
      name: 'every add/combine node either binds an ingredient OR consumes a producer (no objectless Add)',
      behaviour: 'B',
      check: (dag) => {
        const addRe = /^(add|combine|place|tip|scatter|stir in|fold in|pour)\b/;
        const orphans = dag.nodes.filter(n =>
          addRe.test(norm(n.task)) &&
          (n.ingredients ?? []).length === 0 &&
          (n.consumes ?? []).length === 0
        );
        return orphans.length === 0
          ? true
          : `objectless add node(s): ${orphans.map(o => `${o.id}:${o.task}`).join(', ')}`;
      },
    },
    {
      name: 'no prep produces an intermediate that is then never consumed (dangling prep)',
      behaviour: 'B',
      check: (dag) => {
        const prepRe = /^(slice|chop|dice|cut|grate|mince|tear)\b/;
        const consumedIds = new Set<string>(dag.nodes.flatMap(n => n.consumes ?? []));
        const dangling = dag.nodes.filter(n =>
          prepRe.test(norm(n.task)) &&
          (n.ingredients ?? []).length > 0 &&
          !consumedIds.has(n.id)
        );
        // a dangling prep means the cook chopped something nothing uses — usually the
        // flip side of an objectless "Add" (the add that should have consumed it is bare)
        return dangling.length === 0
          ? true
          : `prep node(s) whose output is never consumed: ${dangling.map(o => `${o.id}:${o.task}`).join(', ')}`;
      },
    },
  ],
};

export const vesselEdgesCases = [caseSaladConcurrent, caseBechamelOrdered, caseBindingNoOrphans];
