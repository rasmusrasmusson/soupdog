// src/app/my/recipes/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RecipeEditor } from '@/components/recipe/RecipeEditor';
import type { RecipeFormData } from '@/lib/recipe-actions';

// Convert imported recipe JSON into RecipeEditor initial format
function importToInitial(imp: any) {
  if (!imp) return undefined;

  // Build steps from groups — each step gets stepIngredients linked by name
  const allIngredients = imp.ingredients ?? [];

  const steps = (imp.groups ?? []).flatMap((group: any) =>
    (group.steps ?? []).map((step: any, si: number) => ({
      id:           `import-${Math.random().toString(36).slice(2)}`,
      instruction:  step.instruction ?? '',
      durationMinutes: step.durationMinutes ?? 0,
      temperatureCelsius: 0,
      taskFamily:   step.taskFamily ?? null,
      taskId:       null,
      taskName:     null,
      group:        group.outputName ?? '',
      stepIngredients: (step.stepIngredients ?? []).map((name: string) => {
        const match = allIngredients.find((i: any) =>
          i.name.toLowerCase().trim() === name.toLowerCase().trim()
        );
        return {
          ingredientId:   null,
          ingredientSlug: null,
          name,
          quantityValue:  match?.quantityValue ?? 0,
          quantityUnit:   match?.quantityUnit ?? 'g',
          prepNote:       match?.prepNote ?? '',
          optional:       match?.optional ?? false,
        };
      }),
      stepTools: [],
    }))
  );

  const ingredients = allIngredients.map((ing: any) => ({
    ingredientId:   null,
    ingredientSlug: null,
    name:           ing.name,
    quantityValue:  ing.quantityValue ?? 0,
    quantityUnit:   ing.quantityUnit ?? 'g',
    prepNote:       ing.prepNote ?? '',
    optional:       ing.optional ?? false,
  }));

  return {
    canonicalId:      '',
    versionId:        '',
    title:            imp.title ?? '',
    description:      imp.description ?? '',
    cuisine:          imp.cuisine ?? '',
    tags:             (imp.tags ?? []).join(', '),
    servings:         imp.servings ?? 4,
    difficulty:       imp.difficulty ?? 'medium',
    totalTimeMinutes: imp.totalTimeMinutes ?? 0,
    activeTimeMinutes: imp.activeTimeMinutes ?? 0,
    ingredients,
    steps,
    equipmentIds:     [],
    isPublished:      false,
  };
}

export default function NewRecipePage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [saving,  setSaving]  = useState(false);
  const [initial, setInitial] = useState<any>(undefined);

  // Load import data from sessionStorage if redirected from import page
  useEffect(() => {
    if (searchParams.get('import') === '1') {
      try {
        const raw = sessionStorage.getItem('soupdog_import');
        if (raw) {
          const imp = JSON.parse(raw);
          setInitial(importToInitial(imp));
          sessionStorage.removeItem('soupdog_import');
        }
      } catch (e) {
        console.warn('Failed to load import data', e);
      }
    }
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

      <RecipeEditor key={initial ? 'imported' : 'empty'} initial={initial} onSave={handleSave} saving={saving} />
    </div>
  );
}
