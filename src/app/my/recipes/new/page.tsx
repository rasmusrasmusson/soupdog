// src/app/my/recipes/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RecipeEditor } from '@/components/recipe/RecipeEditor';
import type { RecipeFormData } from '@/lib/recipe-actions';

// Convert imported recipe JSON into RecipeEditor initial format
function uid() { return Math.random().toString(36).slice(2, 9); }

function importToInitial(imp: any, familyMap?: Map<string, any>) {
  if (!imp) return undefined;

  const allIngredients = imp.ingredients ?? [];

  // Track which ingredient names are used in steps (to avoid duplicating them)
  const usedInSteps = new Set<string>();
  // Track which ingredients have been assigned to a step already (avoid double-counting)
  const assignedToStep = new Set<string>();

  // Build steps — groupLabel is what initialToGroups uses to group them
  const steps = (imp.groups ?? []).flatMap((group: any) =>
    (group.steps ?? []).map((step: any) => {
      const stepIngs = (step.stepIngredients ?? [])
        .filter((name: string) => {
          const key = name.toLowerCase().trim();
          if (assignedToStep.has(key)) return false; // already in an earlier step
          assignedToStep.add(key);
          return true;
        })
        .map((name: string) => {
        usedInSteps.add(name.toLowerCase().trim());
        const match = allIngredients.find((i: any) =>
          i.name.toLowerCase().trim() === name.toLowerCase().trim()
        );
        return {
          id:            uid(),
          ingredientId:  '',
          name,
          quantityValue: match?.quantityValue ?? 0,
          quantityUnit:  match?.quantityUnit ?? 'g',
          prepNote:      match?.prepNote ?? '',
        };
      });
      const matchedTask = familyMap?.get(step.taskFamily ?? '');
      // Map freetext tool names to StepTool objects (no equipmentId — user can link later)
      const stepTools = (step.stepTools ?? []).map((toolName: string) => ({
        id:          uid(),
        equipmentId: '',
        name:        toolName,
      }));
      return {
        id:                 uid(),
        instruction:        step.instruction ?? '',
        durationMinutes:    step.durationMinutes ?? 0,
        temperatureCelsius: step.temperatureCelsius ?? 0,
        taskFamily:         matchedTask?.family ?? step.taskFamily ?? undefined,
        taskId:             matchedTask?.id ?? undefined,
        taskName:           matchedTask?.name ?? undefined,
        taskType:           matchedTask?.task_type ?? undefined,
        groupLabel:         group.outputName || '__default__',
        stepIngredients:    stepIngs,
        stepTools,
      };
    })
  );

  // Only include ingredients NOT already referenced in a step
  const ingredients = allIngredients
    .filter((ing: any) => !usedInSteps.has(ing.name.toLowerCase().trim()))
    .map((ing: any) => ({
      ingredientId:   '',
      ingredientSlug: '',
      name:           ing.name,
      quantityValue:  ing.quantityValue ?? 0,
      quantityUnit:   ing.quantityUnit ?? 'g',
      prepNote:       ing.prepNote ?? '',
      optional:       ing.optional ?? false,
    }));

  return {
    canonicalId:       '',
    versionId:         '',
    title:             imp.title ?? '',
    description:       imp.description ?? '',
    cuisine:           imp.cuisine ?? '',
    tags:              (imp.tags ?? []).join(', '),
    servings:          imp.servings ?? 4,
    difficulty:        imp.difficulty ?? 'medium',
    totalTimeMinutes:  imp.totalTimeMinutes ?? 0,
    activeTimeMinutes: imp.activeTimeMinutes ?? 0,
    ingredients,
    steps,
    equipmentIds:      [],
    isPublished:       false,
  };
}

export default function NewRecipePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [saving,    setSaving]   = useState(false);
  const [initial,   setInitial]  = useState<any>(undefined);
  // Start in importing state if ?import=1 — prevents editor mounting before data ready
  const [importing, setImporting] = useState(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('import') === '1'
  );

  // Load import data from sessionStorage if redirected from import page
  useEffect(() => {
    if (searchParams.get('import') !== '1') return;
    const raw = sessionStorage.getItem('soupdog_import');
    if (!raw) return;
    sessionStorage.removeItem('soupdog_import');

    let imp: any;
    try { imp = JSON.parse(raw); } catch { return; }

    // Hardcoded family → representative task (real UUIDs from tasks table)
    const familyMap = new Map<string, any>([
      ['cut',          { id: '31132714-14a6-4f36-984a-308683d059bb', name: 'Brunoise',     family: 'cut',          task_type: 'human'   }],
      ['finish',       { id: 'a9574682-9da1-4da8-a130-fe6ac78d7b06', name: 'Deglaze',     family: 'finish',       task_type: 'human'   }],
      ['heat_dry',     { id: '4a6f0b2d-7679-4b03-8983-1ad41ccb5e2b', name: 'Bake',        family: 'heat_dry',     task_type: 'machine' }],
      ['heat_machine', { id: '3c2ec27b-2c93-4363-a322-a5180c21af72', name: 'Combi steam', family: 'heat_machine', task_type: 'machine' }],
      ['heat_wet',     { id: '2f600f22-57f9-4d86-abbd-f06146a50626', name: 'Blanch',      family: 'heat_wet',     task_type: 'human'   }],
      ['mix',          { id: 'cdc58767-e42a-4206-9c27-2c82e3fdc395', name: 'Beat',        family: 'mix',          task_type: 'human'   }],
      ['move',         { id: '45b0f2b6-7897-4b28-91a8-03f5a43dbc10', name: 'Add',         family: 'move',         task_type: 'human'   }],
      ['passive',      { id: '193d41a3-521c-41c0-88f5-e44a48005d2e', name: 'Brine',       family: 'passive',      task_type: 'passive' }],
      ['prepare',      { id: '24a9b746-e572-41e2-b601-cdfad7850c33', name: 'Measure',     family: 'prepare',      task_type: 'human'   }],
    ]);

    // Use setTimeout to ensure setInitial and the re-render complete
    // before the editor mounts, so useState initializes with correct data
    setTimeout(() => {
      setInitial(importToInitial(imp, familyMap));
      setImporting(false);
    }, 0);
  }, [searchParams]);

  const handleSave = async (data: RecipeFormData) => {
    setSaving(true);
    try {
      const res = await fetch('/api/my/recipes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to save');
      }
      router.push('/my/recipes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="border-b border-[var(--border)] px-4 md:px-8 py-3 flex items-center gap-3">
        <Link href="/my/recipes"
          className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={12} /> My Recipes
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-mono text-[var(--fg)]">
          {initial ? 'Imported recipe' : 'New recipe'}
        </span>
      </div>

      {importing ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
          Loading imported recipe…
        </div>
      ) : (
        <RecipeEditor key={initial ? 'imported' : 'empty'} initial={initial} onSave={handleSave} saving={saving} />
      )}
    </div>
  );
}
