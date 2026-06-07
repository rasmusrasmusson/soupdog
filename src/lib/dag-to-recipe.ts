// src/lib/dag-to-recipe.ts
//
// Map an in-memory decomposition DAG (the output of /api/recipes/decompose) into the
// `Recipe` shape that RecipeDisplay renders. This is what lets the Add-recipe PREVIEW
// show the recipe in the EXACT same presentation as the saved page — same component,
// same data shape, just sourced from the DAG instead of saved DB rows.
//
// Mirrors how decompose-save persists nodes, so preview ≈ saved view:
//   - each node → a RecipeStep (instruction built the same way, group_label, duration)
//   - the node's single ingredient → a RecipeIngredientRef linked to that step (stepId)
//   - the node's tool → appliance_settings.stepTools[] (so ToolCell renders it)

import type { Recipe, RecipeStep, RecipeIngredientRef, DifficultyLevel } from '@/types';

interface DagIngredient { name: string; qty?: number; unit?: string; prep?: string | null; }
interface DagNode {
  id: string;
  task: string;
  ingredients?: DagIngredient[];
  consumes?: string[];
  produces?: string | null;
  group?: string | null;
  tool?: string | null;
  params?: Record<string, any> | null;
  passive?: boolean;
  completion?: string | null;
  notes?: string | null;
}
export interface Dag { title?: string; servings?: number; nodes: DagNode[]; }

export interface DagRecipeMeta {
  title?: string;
  description?: string;
  cuisine?: string;
  tags?: string[];
  servings?: number;
  difficulty?: string;
  totalTimeMinutes?: number;
}

function capitalize(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// "PT12M" → seconds (mirrors decompose-save's durationToSeconds)
function durationToSeconds(completion?: string | null): number | undefined {
  if (!completion) return undefined;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(completion.trim());
  if (!m) return undefined;
  const secs = (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0');
  return secs > 0 ? secs : undefined;
}

// Natural-language duration ("about 9 minutes", "8-10 min", "90 seconds"); range→midpoint.
// Mirrors decompose-save so the preview Time column matches the saved view.
function naturalDurationToSeconds(text?: string | null): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  let total = 0; let found = false;
  const h = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/.exec(t);
  if (h) { total += parseFloat(h[1]) * 3600; found = true; }
  const minRange = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/.exec(t);
  const minSingle = /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/.exec(t);
  if (minRange) { total += ((parseFloat(minRange[1]) + parseFloat(minRange[2])) / 2) * 60; found = true; }
  else if (minSingle) { total += parseFloat(minSingle[1]) * 60; found = true; }
  const secRange = /(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:seconds?|secs?|s)\b/.exec(t);
  const secSingle = /(\d+)\s*(?:seconds?|secs?|s)\b/.exec(t);
  if (secRange) { total += (parseInt(secRange[1]) + parseInt(secRange[2])) / 2; found = true; }
  else if (secSingle && !minSingle) { total += parseInt(secSingle[1]); found = true; }
  const secs = Math.round(total);
  return found && secs > 0 ? secs : undefined;
}

function buildInstruction(n: DagNode): string {
  const verb = (n.task || '').trim();
  const ing  = (n.ingredients ?? [])[0];
  if (ing?.name) {
    const qty = ing.qty != null ? `${ing.qty}${ing.unit ? ' ' + ing.unit : ''} ` : '';
    return `${capitalize(verb)} ${qty}${ing.name}${ing.prep ? `, ${ing.prep}` : ''}`.trim();
  }
  return capitalize(verb);
}

export function dagToRecipe(dag: Dag, meta: DagRecipeMeta = {}): Recipe {
  const steps: RecipeStep[] = [];
  const ingredients: RecipeIngredientRef[] = [];

  (dag.nodes ?? []).forEach((n, i) => {
    const stepId = n.id; // node id doubles as the step id for preview-time stepIngMap
    const durationSeconds =
      durationToSeconds(n.completion)
      ?? naturalDurationToSeconds(n.completion)
      ?? naturalDurationToSeconds(n.notes);
    // completion text that isn't a duration (e.g. "until golden") → notes
    const completionNote = (n.completion && durationToSeconds(n.completion) == null) ? n.completion : null;
    const noteParts = [completionNote, n.notes].filter(Boolean) as string[];

    steps.push({
      id:          stepId,
      order:       i + 1,
      type:        n.passive ? 'passive' : 'human',
      group:       n.group?.trim() || undefined,
      instruction: buildInstruction(n),
      durationSeconds,
      notes:       noteParts.length ? noteParts.join(' — ') : undefined,
      applianceSettings: n.tool ? ({ stepTools: [{ name: n.tool }] } as any) : undefined,
    });

    const ing = (n.ingredients ?? [])[0];
    if (ing?.name?.trim()) {
      ingredients.push({
        ingredientId:   stepId,           // synthetic id (no DB id yet at preview time)
        ingredientSlug: '',
        name:           ing.name.trim(),
        quantity:       { value: ing.qty ?? 0, unit: ing.unit ?? '' },
        prep:           ing.prep?.trim() || undefined,
        optional:       false,
        stepId,
      });
    }
  });

  const now = new Date().toISOString();
  return {
    id:               'preview',
    slug:             'preview',
    version:          1,
    title:            meta.title ?? dag.title ?? 'Untitled recipe',
    description:      meta.description || undefined,
    cuisine:          meta.cuisine || undefined,
    tags:             meta.tags && meta.tags.length ? meta.tags : undefined,
    servings:         meta.servings ?? dag.servings ?? 4,
    difficulty:       (meta.difficulty as DifficultyLevel) ?? 'medium',
    totalTimeSeconds: (meta.totalTimeMinutes ?? 0) * 60,
    ingredients,
    steps,
    equipment:        [],
    createdAt:        now,
    updatedAt:        now,
  };
}
