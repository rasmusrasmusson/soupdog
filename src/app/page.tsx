'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { sampleRecipes } from '@/data/sample-recipes';
import { formatDuration } from '@/lib/utils';

const CUISINES = ['All', 'Indian', 'European', 'Asian', 'American', 'Middle Eastern'];
const DIETARY  = ['All', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal'];
const DIFFICULTY = ['All', 'Easy', 'Medium', 'Hard'];

export default function Home() {
  const [query, setQuery]    = useState('');
  const [cuisine, setCuisine]   = useState('All');
  const [dietary, setDietary]   = useState('All');
  const [difficulty, setDiff]   = useState('All');
  const isLoggedIn = false; // will come from auth later

  return (
    <div className="flex flex-col items-center min-h-full bg-[var(--bg)]">

      {/* ── Hero search ── */}
      <div className="w-full flex flex-col items-center pt-20 pb-10 px-4">
        <div className="mb-8 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--muted)] mb-3">
            Precise cooking programs
          </p>
          <h1 className="font-display text-[36px] font-light text-[var(--fg)] leading-tight">
            What are you cooking?
          </h1>
        </div>

        {/* Search box */}
        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--accent)] transition-colors shadow-sm">
            <Search size={16} strokeWidth={1.5} className="text-[var(--muted)] flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Recipe, ingredient, technique..."
              className="flex-1 bg-transparent text-[14px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[var(--muted)] hover:text-[var(--fg)] font-mono text-[11px]">✕</button>
            )}
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <FilterGroup label="Cuisine" options={CUISINES} value={cuisine} onChange={setCuisine} />
            <FilterGroup label="Dietary" options={DIETARY} value={dietary} onChange={setDietary} />
            <FilterGroup label="Difficulty" options={DIFFICULTY} value={difficulty} onChange={setDiff} />
          </div>
        </div>
      </div>

      {/* ── Content below search ── */}
      <div className="w-full max-w-2xl px-4 pb-16">

        {/* Logged-in: personalised content */}
        {isLoggedIn ? (
          <div className="space-y-8">
            <RecipeSection title="Continue cooking" recipes={sampleRecipes.slice(0, 2)} />
            <RecipeSection title="Saved recipes" recipes={sampleRecipes.slice(0, 3)} />
            <RecipeSection title="Recommended for you" recipes={sampleRecipes} />
          </div>
        ) : (
          /* Logged-out: featured + sign-up prompt */
          <div className="space-y-8">
            <RecipeSection title="Featured recipes" recipes={sampleRecipes} />

            {/* Sign-up prompt */}
            <div className="border border-[var(--border)] p-6 flex items-center justify-between gap-6">
              <div>
                <p className="text-[13px] font-medium text-[var(--fg)] mb-1">Save recipes, track your kitchen</p>
                <p className="text-[12px] text-[var(--muted)]">
                  Create a free account to save recipes, manage your household, register appliances, and get personalised recommendations.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link href="/signup" className="bg-[var(--accent)] text-white px-4 py-2 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors whitespace-nowrap">
                  Sign up free
                </Link>
                <Link href="/login" className="border border-[var(--border)] px-4 py-2 text-[12px] font-mono text-[var(--fg)] hover:border-[var(--accent)] transition-colors">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter group ─────────────────────────────────────────────
function FilterGroup({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] flex-shrink-0">{label}</span>
      <div className="flex gap-1 flex-wrap">
        {options.map(o => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`font-mono text-[10px] px-2 py-0.5 border transition-colors ${
              value === o
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Recipe list section ───────────────────────────────────────
function RecipeSection({ title, recipes }: { title: string; recipes: typeof sampleRecipes }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">{title}</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
        <Link href="/recipes" className="font-mono text-[9px] text-[var(--muted)] hover:text-[var(--accent)] transition-colors uppercase tracking-wider">
          View all →
        </Link>
      </div>
      <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', border: '1px solid var(--border)' }}>
        <thead>
          <tr style={{ background: 'var(--surface-hover)' }}>
            {['Recipe', 'Cuisine', 'Time', 'Difficulty', 'Rating'].map((h, i, arr) => (
              <th key={h} style={{
                padding: '7px 14px', fontFamily: 'var(--font-mono)', fontSize: 9,
                textTransform: 'uppercase', letterSpacing: '0.18em', color: 'var(--muted)',
                textAlign: h === 'Time' || h === 'Rating' ? 'right' : 'left',
                borderRight: i < arr.length - 1 ? '1px solid var(--border)' : undefined,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recipes.map((r, i) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}
              className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
              <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontWeight: 500 }}>
                <Link href={`/recipes/${r.slug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}
                  className="hover:text-[var(--accent)] transition-colors">
                  {r.title}
                </Link>
                {r.tags && (
                  <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    {r.tags.slice(0, 2).join(' · ')}
                  </span>
                )}
              </td>
              <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', color: 'var(--muted)' }}>{r.cuisine ?? '—'}</td>
              <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--muted)' }}>
                {formatDuration(r.totalTimeSeconds)}
              </td>
              <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', color: 'var(--muted)' }}>{r.difficulty}</td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', textAlign: 'right', color: 'var(--muted)' }}>
                {r.ratings ? `${r.ratings.average.toFixed(1)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
