// src/lib/tasks/resolve-concept.ts
// Concept field resolution (design v0.3 §3): a concept is a task row with
// parent_task_id set. Its content fields RESOLVE from the parent — the concept
// stores only what diverges. effective field = concept.field ?? parent.field.
//
// Ingredients always stay on the recipe step; bound_* on the concept are
// matching/content metadata only, so they are NOT resolved from the parent
// (a concept's whole point is that it binds its own dimension).

// The content fields that inherit from the parent when the concept leaves them null.
// (Identity/structural fields — id, slug, name, parent_task_id, bound_* — are NOT inherited.)
const INHERITED_FIELDS = [
  'description',
  'tips',
  'common_mistakes',
  'category',
  'completion_type',
  'completion_target',
  'completion_criterion',
  'completion_measurable',
  'heat_mechanism',
  'heat_medium',
  'typical_input_state',
  'typical_output_state',
  'min_duration_seconds',
  'max_duration_seconds',
  'suggested_tool_slugs',
  'image_url',
  'difficulty',
  'skill_level_required',
] as const;

type AnyTask = Record<string, any>;

function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Merge a concept over its parent for the inherited content fields.
 * Returns a NEW task object: own value wins; parent fills the gaps.
 * Non-inherited fields (id, slug, name, bound_*, parent_task_id) keep the concept's own.
 * If parent is null/undefined, returns the concept unchanged (with a flag).
 */
export function resolveConcept<T extends AnyTask>(concept: T, parent: AnyTask | null | undefined): T & { isConcept: boolean; parentName?: string } {
  const isConcept = !!concept.parent_task_id;
  if (!isConcept || !parent) {
    return { ...concept, isConcept };
  }
  const out: AnyTask = { ...concept };
  for (const f of INHERITED_FIELDS) {
    if (isEmpty(out[f]) && !isEmpty(parent[f])) {
      out[f] = parent[f];
    }
  }
  return { ...(out as T), isConcept: true, parentName: parent.name };
}

/**
 * Convenience: given a supabase client and a task row, fetch the parent (if any)
 * and return the resolved task. One extra query only when the task is a concept.
 */
export async function resolveConceptWithDb<T extends AnyTask>(db: any, concept: T): Promise<T & { isConcept: boolean; parentName?: string; parent?: AnyTask | null }> {
  if (!concept?.parent_task_id) {
    return { ...concept, isConcept: false };
  }
  const { data: parent } = await db.from('tasks').select('*').eq('id', concept.parent_task_id).maybeSingle();
  const resolved = resolveConcept(concept, parent ?? null);
  return { ...resolved, parent: parent ?? null };
}

export { INHERITED_FIELDS };
