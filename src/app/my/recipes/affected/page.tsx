// src/app/my/recipes/affected/page.tsx
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const B = '1px solid var(--border)';

interface AffectedRecipe { slug: string; title: string; cuisine: string | null; stepCount: number; }
interface Resp { task: { id: string; name: string }; recipeCount: number; recipes: AffectedRecipe[]; }

function AffectedInner() {
  const params = useSearchParams();
  const taskId = params.get('task');
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) { setErr('No technique specified.'); setLoading(false); return; }
    let cancelled = false;
    fetch(`/api/my/recipes/affected?task=${encodeURIComponent(taskId)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed'); return d; })
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setErr(e.message ?? 'Failed'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [taskId]);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 24px' }}>
      <Link href="/my/recipes"
        style={{ ...MONO, fontSize: 11, color: 'var(--muted)', textDecoration: 'none', letterSpacing: '0.08em' }}>
        ← My Recipes
      </Link>

      <h1 className="font-display" style={{ fontSize: 28, fontWeight: 300, color: 'var(--fg)', margin: '14px 0 4px' }}>
        {data ? `Recipes using “${data.task.name}”` : 'Affected recipes'}
      </h1>
      <p style={{ ...MONO, fontSize: 12, color: 'var(--muted)', marginBottom: 24 }}>
        {data ? `${data.recipeCount} of your recipes would update to this technique.` : '\u00A0'}
      </p>

      {loading && (
        <div style={{ ...MONO, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={14} className="animate-spin" /> Scanning your recipes…
        </div>
      )}
      {err && <div style={{ ...MONO, fontSize: 12, color: 'var(--muted)' }}>{err}</div>}

      {data && data.recipes.length > 0 && (
        <div style={{ border: B }}>
          {data.recipes.map((r, i) => (
            <Link key={r.slug} href={`/recipes/${r.slug}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 18px', borderTop: i === 0 ? 'none' : B, textDecoration: 'none',
                background: 'var(--surface)' }}
              className="hover:opacity-80 transition-opacity">
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="font-display" style={{ fontSize: 16, color: 'var(--fg)' }}>{r.title}</span>
                {r.cuisine && <span style={{ ...MONO, fontSize: 11, color: 'var(--muted)' }}>{r.cuisine}</span>}
              </span>
              <span style={{ ...MONO, fontSize: 11, color: 'var(--accent)' }}>
                {r.stepCount} step{r.stepCount === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {data && data.recipes.length === 0 && (
        <div style={{ border: `1px dashed var(--border)`, padding: '40px 24px', textAlign: 'center',
          ...MONO, fontSize: 12, color: 'var(--muted)' }}>
          No recipes currently need this update.
        </div>
      )}
    </div>
  );
}

export default function AffectedPage() {
  return (
    <Suspense fallback={null}>
      <AffectedInner />
    </Suspense>
  );
}
