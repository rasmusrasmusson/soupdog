// eval/multi_dish_decomposition.eval.ts
//
// EVAL SET — multi-dish ("meal") decomposition.
// Written eval-FIRST (per Soupdog_Multi_Dish_Recipes_Consolidation_v0_1 §6.5):
// these cases DEFINE "correct" before the multi-dish prompt is built. They are the
// spec the prompt is iterated against in the build session (run decompose with the
// new prompt → assert → adjust). Each case = a step-1 extraction (the real shape
// the /api/recipes/decompose endpoint consumes as body.extraction) + assertions on
// the emitted DAG.
//
// THE THREE BEHAVIOURS A MULTI-DISH DECOMPOSITION MUST HAVE (consolidation §1, §2):
//   (M) MERGE   — shared work across dishes becomes ONE node fanning out, never
//                 duplicated. "chop red onion" used by two dishes = one chop node.
//   (T) TERMINALS — one NAMED terminal output per dish (multiple end-products in one
//                 DAG), not a single finished dish.
//   (R) REUSE   — a requested dish that already EXISTS as a standalone recipe is
//                 LINKED (version_sub_recipes), not re-decomposed. Reuse is priority.
//
// How a multi-dish request is REPRESENTED in the extraction: each dish is a group
// with its own `outputName` (the existing groups[].outputName mechanism — no new
// extraction shape needed). The DAG's terminal nodes carry that dish name (via
// `produces` / `group`).
//
// NOTE on running: the assertions are pure functions over the DAG JSON. The harness
// (to be written in the build session) calls POST /api/recipes/decompose with each
// `extraction`, then runs that case's assertions on the returned `{ nodes }`. For
// the REUSE case the harness must first ensure the named dish exists (seed or point
// at a real canonical) so the prompt can find it.

// ───────────────────────────────────────────────────────────────────────────────
// Types (mirror the decompose I/O; keep in sync with the route)
// ───────────────────────────────────────────────────────────────────────────────

export interface ExtractionIngredient {
  name: string;
  quantityValue: number | null;
  quantityUnit: string;
  prepNote: string | null;
  optional?: boolean;
}
export interface ExtractionStep {
  instruction: string;
  durationMinutes?: number | null;
  temperatureCelsius?: number | null;
  taskFamily?: string;
  stepIngredients: string[];
  stepTools?: string[];
}
export interface ExtractionGroup {
  outputName: string;            // the DISH name in a multi-dish meal ("" only for single-dish)
  steps: ExtractionStep[];
}
export interface Extraction {
  title: string;
  description?: string;
  cuisine?: string | null;
  difficulty?: string;
  servings: number;
  totalTimeMinutes?: number;
  activeTimeMinutes?: number | null;
  tags?: string[];
  ingredients: ExtractionIngredient[];
  equipment?: string[];
  groups: ExtractionGroup[];
  // multi-dish hint the prompt should honour (each group's outputName is a dish):
  isMultiDish?: boolean;
}

export interface DagNode {
  id: string;
  task: string;
  ingredients: { name: string; qty: number | null; unit: string; prep: string | null }[];
  consumes: string[];
  produces: string | null;
  group: string | null;
  tool: string | null;
  params?: Record<string, unknown>;
  passive?: boolean;
  completion?: string | null;
  notes?: string | null;
  // REUSE: when a dish is satisfied by an existing recipe, the prompt marks the
  // terminal that stands in for it (the harness/save maps this to version_sub_recipes).
  linkedCanonicalSlug?: string | null;
  newTask?: boolean;
}
export interface Dag {
  title: string;
  servings: number;
  nodes: DagNode[];
  // REUSE: dishes resolved to existing recipes rather than decomposed inline.
  linkedDishes?: { dishName: string; canonicalSlug: string }[];
}

// ───────────────────────────────────────────────────────────────────────────────
// Assertion helpers (pure, over the DAG)
// ───────────────────────────────────────────────────────────────────────────────

export type Assertion = { name: string; behaviour: 'M' | 'T' | 'R' | 'G'; check: (dag: Dag) => boolean | string };
// check() returns true (pass) or a string (fail message).

const terminals = (dag: Dag): DagNode[] =>
  dag.nodes.filter(n => !dag.nodes.some(o => (o.consumes ?? []).includes(n.id)));

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

// count nodes whose task+introduced-ingredient match a (verb, ingredient) pair
const countTaskOnIngredient = (dag: Dag, verb: string, ingredient: string): number =>
  dag.nodes.filter(n =>
    norm(n.task) === norm(verb) &&
    (n.ingredients ?? []).some(i => norm(i.name).includes(norm(ingredient)))
  ).length;

// does some terminal carry this dish name (via produces or group)?
const hasTerminalForDish = (dag: Dag, dishName: string): boolean =>
  terminals(dag).some(t => norm(t.produces) === norm(dishName) || norm(t.group) === norm(dishName)) ||
  (dag.linkedDishes ?? []).some(l => norm(l.dishName) === norm(dishName));

// fan-out: a node consumed by ≥2 distinct downstream nodes
const fansOut = (dag: Dag, nodeId: string): boolean =>
  dag.nodes.filter(n => (n.consumes ?? []).includes(nodeId)).length >= 2;

// ───────────────────────────────────────────────────────────────────────────────
// CASE 1 — Shared prep MUST merge (the headline behaviour)
// Two dishes both need finely chopped red onion. Correct output: ONE chop-red-onion
// node, fanning out to both dishes' downstream steps. Plus one named terminal each.
// ───────────────────────────────────────────────────────────────────────────────

export const case1_sharedOnion: { name: string; extraction: Extraction; assertions: Assertion[] } = {
  name: 'shared red onion merges into one chop node, fanning out to two dishes',
  extraction: {
    title: 'Kachumber salad & onion dal',
    servings: 4,
    isMultiDish: true,
    ingredients: [
      { name: 'red onion', quantityValue: 2, quantityUnit: 'piece', prepNote: 'finely chopped' },
      { name: 'tomato', quantityValue: 2, quantityUnit: 'piece', prepNote: 'diced' },
      { name: 'cucumber', quantityValue: 1, quantityUnit: 'piece', prepNote: 'diced' },
      { name: 'lemon juice', quantityValue: 2, quantityUnit: 'tbsp', prepNote: null },
      { name: 'red lentils', quantityValue: 200, quantityUnit: 'g', prepNote: null },
      { name: 'water', quantityValue: 600, quantityUnit: 'ml', prepNote: null },
      { name: 'turmeric', quantityValue: 1, quantityUnit: 'tsp', prepNote: null },
      { name: 'cumin seeds', quantityValue: 1, quantityUnit: 'tsp', prepNote: null },
    ],
    equipment: ['chefs knife', 'mixing bowl', 'saucepan', 'frying pan'],
    groups: [
      {
        outputName: 'Kachumber salad',
        steps: [
          { instruction: 'Finely chop the red onion', stepIngredients: ['red onion'], stepTools: ['chefs knife'], taskFamily: 'cut' },
          { instruction: 'Dice the tomato', stepIngredients: ['tomato'], stepTools: ['chefs knife'], taskFamily: 'cut' },
          { instruction: 'Dice the cucumber', stepIngredients: ['cucumber'], stepTools: ['chefs knife'], taskFamily: 'cut' },
          { instruction: 'Toss the chopped onion, tomato and cucumber with lemon juice', stepIngredients: ['lemon juice'], stepTools: ['mixing bowl'], taskFamily: 'mix' },
        ],
      },
      {
        outputName: 'Onion dal',
        steps: [
          { instruction: 'Finely chop the red onion', stepIngredients: ['red onion'], stepTools: ['chefs knife'], taskFamily: 'cut' },
          { instruction: 'Simmer the red lentils in water with turmeric', stepIngredients: ['red lentils', 'water', 'turmeric'], stepTools: ['saucepan'], taskFamily: 'heat_wet', durationMinutes: 20 },
          { instruction: 'Fry the cumin seeds and chopped onion', stepIngredients: ['cumin seeds'], stepTools: ['frying pan'], taskFamily: 'heat_dry', durationMinutes: 5 },
          { instruction: 'Stir the fried onion tempering into the lentils', stepIngredients: [], stepTools: ['saucepan'], taskFamily: 'mix' },
        ],
      },
    ],
  },
  assertions: [
    {
      name: 'exactly ONE chop-red-onion node (merged, not one per dish)',
      behaviour: 'M',
      check: (dag) => {
        const c = countTaskOnIngredient(dag, 'chop', 'red onion');
        return c === 1 ? true : `expected 1 chop-red-onion node, found ${c}`;
      },
    },
    {
      name: 'red onion introduced exactly once across the whole DAG',
      behaviour: 'M',
      check: (dag) => {
        const intro = dag.nodes.filter(n => (n.ingredients ?? []).some(i => norm(i.name).includes('red onion'))).length;
        return intro === 1 ? true : `red onion introduced on ${intro} nodes, expected 1`;
      },
    },
    {
      name: 'the chopped-onion node fans out to BOTH dishes (≥2 consumers)',
      behaviour: 'M',
      check: (dag) => {
        const onion = dag.nodes.find(n => norm(n.task) === 'chop' && (n.ingredients ?? []).some(i => norm(i.name).includes('red onion')));
        if (!onion) return 'no chop-red-onion node found';
        return fansOut(dag, onion.id) ? true : 'chop-red-onion node does not fan out to 2+ consumers';
      },
    },
    {
      name: 'a named terminal exists for EACH dish',
      behaviour: 'T',
      check: (dag) => {
        const miss = ['Kachumber salad', 'Onion dal'].filter(d => !hasTerminalForDish(dag, d));
        return miss.length === 0 ? true : `no terminal for dish(es): ${miss.join(', ')}`;
      },
    },
    {
      name: 'exactly TWO terminal nodes (one per dish, no stray terminals)',
      behaviour: 'T',
      check: (dag) => {
        const t = terminals(dag).length + (dag.linkedDishes?.length ?? 0);
        return t === 2 ? true : `expected 2 terminals, found ${t}`;
      },
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────────
// CASE 2 — Three dishes, NO shared prep: independence + 3 named terminals.
// Guards against the opposite failure: forcing false merges / false dependencies
// between dishes that share nothing. Carbonara + green salad + iced tea.
// ───────────────────────────────────────────────────────────────────────────────

export const case2_threeIndependent: { name: string; extraction: Extraction; assertions: Assertion[] } = {
  name: 'three independent dishes → three terminals, no cross-dish false edges',
  extraction: {
    title: 'Carbonara, green salad & iced tea',
    servings: 4,
    isMultiDish: true,
    ingredients: [
      { name: 'spaghetti', quantityValue: 400, quantityUnit: 'g', prepNote: null },
      { name: 'water', quantityValue: 3, quantityUnit: 'l', prepNote: null },
      { name: 'guanciale', quantityValue: 150, quantityUnit: 'g', prepNote: 'diced' },
      { name: 'egg yolk', quantityValue: 4, quantityUnit: 'piece', prepNote: null },
      { name: 'pecorino', quantityValue: 50, quantityUnit: 'g', prepNote: 'grated' },
      { name: 'salad leaves', quantityValue: 100, quantityUnit: 'g', prepNote: null },
      { name: 'olive oil', quantityValue: 2, quantityUnit: 'tbsp', prepNote: null },
      { name: 'black tea bags', quantityValue: 3, quantityUnit: 'piece', prepNote: null },
      { name: 'ice', quantityValue: 200, quantityUnit: 'g', prepNote: null },
    ],
    equipment: ['large pot', 'frying pan', 'mixing bowl', 'salad bowl', 'jug'],
    groups: [
      {
        outputName: 'Spaghetti carbonara',
        steps: [
          { instruction: 'Boil the spaghetti in water', stepIngredients: ['spaghetti', 'water'], stepTools: ['large pot'], taskFamily: 'heat_wet', durationMinutes: 10 },
          { instruction: 'Fry the diced guanciale until crisp', stepIngredients: ['guanciale'], stepTools: ['frying pan'], taskFamily: 'heat_dry', durationMinutes: 6 },
          { instruction: 'Whisk the egg yolk and grated pecorino', stepIngredients: ['egg yolk', 'pecorino'], stepTools: ['mixing bowl'], taskFamily: 'mix' },
          { instruction: 'Toss the drained spaghetti with the guanciale and the egg mixture', stepIngredients: [], stepTools: ['frying pan'], taskFamily: 'mix' },
        ],
      },
      {
        outputName: 'Green salad',
        steps: [
          { instruction: 'Dress the salad leaves with olive oil', stepIngredients: ['salad leaves', 'olive oil'], stepTools: ['salad bowl'], taskFamily: 'finish' },
        ],
      },
      {
        outputName: 'Iced tea',
        steps: [
          { instruction: 'Steep the tea bags in hot water', stepIngredients: ['black tea bags', 'water'], stepTools: ['jug'], taskFamily: 'heat_wet', durationMinutes: 5 },
          { instruction: 'Add ice to the tea', stepIngredients: ['ice'], stepTools: ['jug'], taskFamily: 'move' },
        ],
      },
    ],
  },
  assertions: [
    {
      name: 'exactly THREE terminals (one per dish)',
      behaviour: 'T',
      check: (dag) => {
        const t = terminals(dag).length + (dag.linkedDishes?.length ?? 0);
        return t === 3 ? true : `expected 3 terminals, found ${t}`;
      },
    },
    {
      name: 'a named terminal for each of the three dishes',
      behaviour: 'T',
      check: (dag) => {
        const miss = ['Spaghetti carbonara', 'Green salad', 'Iced tea'].filter(d => !hasTerminalForDish(dag, d));
        return miss.length === 0 ? true : `missing terminal(s): ${miss.join(', ')}`;
      },
    },
    {
      name: 'no cross-dish edges: the salad node depends on nothing from carbonara/tea',
      behaviour: 'G',
      check: (dag) => {
        // salad is a single dress node; its transitive deps must stay within salad ingredients
        const dress = dag.nodes.find(n => norm(n.task).includes('dress') || (n.ingredients ?? []).some(i => norm(i.name).includes('salad leaves')));
        if (!dress) return 'no salad node found';
        // walk deps; none should introduce spaghetti/guanciale/tea
        const seen = new Set<string>(); const stack = [...(dress.consumes ?? [])];
        while (stack.length) {
          const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id);
          const n = dag.nodes.find(x => x.id === id); if (!n) continue;
          if ((n.ingredients ?? []).some(i => /spaghetti|guanciale|tea|ice|pecorino|egg/.test(norm(i.name))))
            return 'salad transitively depends on a non-salad ingredient (false cross-dish edge)';
          stack.push(...(n.consumes ?? []));
        }
        return true;
      },
    },
    {
      name: 'water introduced separately where used (pasta vs tea) — not falsely merged',
      behaviour: 'G',
      check: (dag) => {
        // water is a generic medium; merging pasta-water and tea-water would be wrong.
        // At least the two heat_wet uses must not share a single water node feeding both.
        const waterNodes = dag.nodes.filter(n => (n.ingredients ?? []).some(i => norm(i.name) === 'water'));
        // acceptable: 2 separate water introductions; failing case: 1 water node fanning to both boils
        if (waterNodes.length >= 2) return true;
        if (waterNodes.length === 1) return fansOut(dag, waterNodes[0].id)
          ? 'single water node fans out to both pasta and tea — should be separate (generic medium, not a shared intermediate)'
          : true;
        return 'no water node found';
      },
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────────
// CASE 3 — REUSE: decompose HONOURS a pre-resolved dish link (it does NOT decide
// reuse itself). Reuse is decided UPSTREAM by search + user disambiguation; the
// resolved dish is passed into decompose as `resolvedDishes`. decompose must LINK
// it (emit in linkedDishes) and NOT decompose it inline. The fresh side salad (not
// resolved) IS decomposed. Harness forwards case.resolvedDishes to the endpoint.
// ───────────────────────────────────────────────────────────────────────────────

export const case3_reuseExisting: {
  name: string;
  extraction: Extraction;
  resolvedDishes: { dishName: string; canonicalSlug: string }[];
  assertions: Assertion[];
} = {
  name: 'decompose honours a pre-resolved dish link (links, does not decompose inline)',
  resolvedDishes: [
    // decided upstream by search + user pick; decompose must honour this:
    { dishName: 'Spaghetti aglio e olio', canonicalSlug: 'spaghetti-aglio-e-olio-mpw6yxsz' },
  ],
  extraction: {
    title: 'Aglio e olio with a side salad',
    servings: 4,
    isMultiDish: true,
    ingredients: [
      { name: 'salad leaves', quantityValue: 100, quantityUnit: 'g', prepNote: null },
      { name: 'olive oil', quantityValue: 2, quantityUnit: 'tbsp', prepNote: null },
      // aglio e olio ingredients deliberately absent — it is a RESOLVED dish (linked).
    ],
    equipment: ['salad bowl'],
    groups: [
      {
        // a resolved dish → must be LINKED, not decomposed
        outputName: 'Spaghetti aglio e olio',
        steps: [],
      },
      {
        outputName: 'Side salad',
        steps: [
          { instruction: 'Dress the salad leaves with olive oil', stepIngredients: ['salad leaves', 'olive oil'], stepTools: ['salad bowl'], taskFamily: 'finish' },
        ],
      },
    ],
  },
  assertions: [
    {
      name: 'the resolved dish is LINKED (in linkedDishes with its slug), not decomposed',
      behaviour: 'R',
      check: (dag) => {
        const linked = (dag.linkedDishes ?? []).some(l => norm(l.canonicalSlug) === norm('spaghetti-aglio-e-olio-mpw6yxsz'));
        return linked ? true : 'resolved aglio e olio was not in linkedDishes (decompose did not honour the pre-resolved link)';
      },
    },
    {
      name: 'the resolved dish was NOT decomposed inline (no garlic/spaghetti nodes minted for it)',
      behaviour: 'R',
      check: (dag) => {
        const inlined = dag.nodes.some(n => (n.ingredients ?? []).some(i => /spaghetti|garlic|chilli|chili/.test(norm(i.name))));
        return inlined ? 'aglio e olio appears decomposed inline — it should have been linked, not re-specified' : true;
      },
    },
    {
      name: 'the fresh side salad IS decomposed inline (its dress node exists)',
      behaviour: 'R',
      check: (dag) => {
        const salad = dag.nodes.some(n => (n.ingredients ?? []).some(i => norm(i.name).includes('salad leaves')));
        return salad ? true : 'side salad was not decomposed (it should be — it is new, not resolved)';
      },
    },
    {
      name: 'one inline terminal (the salad) + one linked dish = two dishes total',
      behaviour: 'T',
      check: (dag) => {
        const t = terminals(dag).length + (dag.linkedDishes?.length ?? 0);
        return t === 2 ? true : `expected 2 dishes (1 linked + 1 inline terminal), found ${t}`;
      },
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────────
// Registry + a tiny runner contract (harness implemented in the build session)
// ───────────────────────────────────────────────────────────────────────────────

export const MULTI_DISH_EVAL_CASES = [case1_sharedOnion, case2_threeIndependent, case3_reuseExisting];

// The build-session harness should:
//   for each case:
//     1. (case3 only) ensure existingDishSlug is present in the DB
//     2. POST /api/recipes/decompose { extraction: case.extraction }  → dag
//     3. for each assertion: r = assertion.check(dag);
//        pass if r === true, else record the string as the failure reason
//   report per-behaviour (M/T/R/G) pass rates. Iterate the prompt until all green.
//
// Behaviour legend: M = merge shared work · T = terminals per dish · R = reuse
// existing · G = guard against false merges/edges.
