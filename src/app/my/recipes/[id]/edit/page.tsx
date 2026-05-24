// src/app/my/recipes/[id]/edit/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { RecipeEditor } from '@/components/recipe/RecipeEditor';
import type { RecipeFormData } from '@/lib/recipe-actions';

export default function EditRecipePage() {
  const params   = useParams();
  const router   = useRouter();
  const id       = params.id as string;

  const [initial, setInitial] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch(`/api/my/recipes/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(data => { setInitial(data); setLoading(false); })
      .catch(() => { setError('Recipe not found or you do not have permission to edit it.'); setLoading(false); });
  }, [id]);

  const handleSave = async (data: RecipeFormData) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/my/recipes/${id}`, {
        method: 'PUT',
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
        <span className="text-[11px] font-mono text-[var(--fg)]">
          {loading ? '…' : initial?.title ?? 'Edit recipe'}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--muted)] text-[12px] font-mono px-8 py-16">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="px-8 py-16 text-[var(--error)] text-[12px] font-mono">{error}</div>
      ) : (
        <RecipeEditor initial={initial} onSave={handleSave} saving={saving} />
      )}
    </div>
  );
}
