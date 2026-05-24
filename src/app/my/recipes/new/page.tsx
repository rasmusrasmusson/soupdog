// src/app/my/recipes/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RecipeEditor } from '@/components/recipe/RecipeEditor';
import type { RecipeFormData } from '@/lib/recipe-actions';

export default function NewRecipePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleSave = async (data: RecipeFormData) => {
    setSaving(true);
    try {
      const res = await fetch('/api/my/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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
      {/* Breadcrumb */}
      <div className="border-b border-[var(--border)] px-4 md:px-8 py-3 flex items-center gap-3">
        <Link href="/my/recipes"
          className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--muted)] hover:text-[var(--accent)] transition-colors">
          <ArrowLeft size={12} /> My Recipes
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[11px] font-mono text-[var(--fg)]">New recipe</span>
      </div>

      <RecipeEditor onSave={handleSave} saving={saving} />
    </div>
  );
}
