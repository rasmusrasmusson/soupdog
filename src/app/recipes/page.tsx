import Link from 'next/link';
import { getRecipes } from '@/lib/recipes';
import { sampleRecipes } from '@/data/sample-recipes';
import { formatDuration } from '@/lib/utils';
import type { Recipe } from '@/types';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Recipes' };

export default async function RecipesPage() {
  let recipes: Recipe[] = [];
  try {
    recipes = await getRecipes();
  } catch {}
  if (!recipes.length) recipes = sampleRecipes;

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      <header className="mb-8">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)] mb-2">Recipe Index</p>
        <h1 className="font-display text-[32px] font-light text-[var(--fg)] mb-2">Recipes</h1>
        <p className="text-[12px] text-[var(--muted)] max-w-lg">
          Structured execution graphs for home cooks, professional kitchens, and connected appliances.
        </p>
      </header>

      <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', border: '1px solid var(--border)' }}>
        <thead>
          <tr style={{ background: 'var(--surface-hover)' }}>
            {['Recipe', 'Cuisine', 'Time', 'Difficulty', 'Rating'].map((h, i, arr) => (
              <th key={h} style={{
                padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 9,
                textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)',
                textAlign: h === 'Time' || h === 'Rating' ? 'right' : 'left',
                borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recipes.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}
              className="hover:bg-[var(--surface-hover)] transition-colors">
              <td style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', fontWeight: 500 }}>
                <Link href={`/recipes/${r.slug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}
                  className="hover:text-[var(--accent)] transition-colors">{r.title}</Link>
                {r.tags && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    {r.tags.slice(0, 2).join(' · ')}
                  </span>
                )}
              </td>
              <td style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', color: 'var(--muted)' }}>{r.cuisine ?? '—'}</td>
              <td style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--muted)' }}>
                {formatDuration(r.totalTimeSeconds)}
              </td>
              <td style={{ padding: '11px 14px', borderRight: '1px solid var(--border)', color: 'var(--muted)' }}>{r.difficulty}</td>
              <td style={{ padding: '11px 14px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--muted)' }}>
                {r.ratings ? r.ratings.average.toFixed(1) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
