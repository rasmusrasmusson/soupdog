// src/lib/recipes/toposort-nodes.ts
// Group-aware stable topological sort of decomposition DAG nodes.
//
// WHY: order_index is assigned as emission order (decompose-save: `i + 1`). The
// model's emission can violate dependencies — e.g. "plate the dressing over the
// salad" emitted BEFORE the dressing-making nodes it consumes, producing a recipe
// that says "drizzle dressing" before the dressing exists. order_index alone can't
// be trusted; this sort makes ordering CORRECT BY CONSTRUCTION.
//
// GUARANTEES (in priority order):
//  1. DEPENDENCY (hard): a node never precedes a node it consumes. Always.
//  2. GROUP CONTIGUITY: nodes of the same `group` stay together (no interleaving
//     a sub-recipe's steps into another group), as long as dependencies allow.
//  3. EMISSION ORDER (tiebreak): among otherwise-equal candidates, keep the
//     model's original order — this preserves the cut-one-add-one reading the
//     emission-order prompt rule produces.
//
// Implementation: Kahn's algorithm with a stable, group-biased ready-queue.
// Ties are broken by (same-group-as-last-emitted first, then original index).

export interface DagNodeLike {
  id: string;
  consumes?: string[] | null;
  group?: string | null;
  [k: string]: any;
}

/**
 * Returns a new array of the nodes in a dependency-correct, group-contiguous,
 * emission-stable order. Pure — does not mutate the input. If the graph has a
 * cycle (should be impossible — validated upstream), the remaining nodes are
 * appended in original order so nothing is lost.
 */
export function toposortNodes<T extends DagNodeLike>(nodes: T[]): T[] {
  const byId = new Map<string, T>();
  const originalIndex = new Map<string, number>();
  nodes.forEach((n, i) => { byId.set(n.id, n); originalIndex.set(n.id, i); });

  // indegree = number of (valid) consumes edges still unsatisfied
  const indegree = new Map<string, number>();
  // dependents: for each producer, the nodes that consume it
  const dependents = new Map<string, string[]>();
  for (const n of nodes) {
    const deps = (n.consumes ?? []).filter((c) => byId.has(c));
    indegree.set(n.id, deps.length);
    for (const c of deps) {
      if (!dependents.has(c)) dependents.set(c, []);
      dependents.get(c)!.push(n.id);
    }
  }

  const out: T[] = [];
  const placed = new Set<string>();
  let lastGroup: string | null | undefined = undefined;

  // ready = all nodes with indegree 0, not yet placed
  const isReady = (id: string) => indegree.get(id) === 0 && !placed.has(id);

  // pick the next node from the ready set, biased to (a) same group as the last
  // placed node (contiguity), then (b) lowest original index (emission stability).
  function pickNext(): string | null {
    let best: string | null = null;
    let bestKey: [number, number] | null = null; // [groupRank, originalIndex]
    for (const n of nodes) {
      if (!isReady(n.id)) continue;
      const sameGroup = (n.group ?? null) === (lastGroup ?? null);
      const groupRank = sameGroup ? 0 : 1;           // prefer same group
      const idx = originalIndex.get(n.id)!;
      const key: [number, number] = [groupRank, idx];
      if (bestKey === null || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = n.id; bestKey = key;
      }
    }
    return best;
  }

  while (out.length < nodes.length) {
    const nextId = pickNext();
    if (nextId === null) break; // no ready node → cycle; handled below
    const node = byId.get(nextId)!;
    out.push(node);
    placed.add(nextId);
    lastGroup = node.group ?? null;
    // relax edges from this producer
    for (const depId of (dependents.get(nextId) ?? [])) {
      indegree.set(depId, (indegree.get(depId) ?? 1) - 1);
    }
  }

  // Cycle / leftover safety: append anything not placed, in original order.
  if (out.length < nodes.length) {
    for (const n of nodes) if (!placed.has(n.id)) out.push(n);
  }

  return out;
}
