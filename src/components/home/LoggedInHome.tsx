'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { sampleRecipes } from '@/data/sample-recipes';
import { formatDuration } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

const CUISINES   = ['All', 'Indian', 'European', 'Asian', 'American', 'Middle Eastern'];
const DIETARY    = ['All', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal'];
const DIFFICULTY = ['All', 'Easy', 'Medium', 'Hard'];

export function LoggedInHome() {
  const { user } = useAuth();
  const [query, setQuery]     = useState('');
  const [cuisine, setCuisine] = useState('All');
  const [dietary, setDietary] = useState('All');
  const [diff, setDiff]       = useState('All');

  const firstName = user?.email?.split('@')[0] ?? 'there';

  return (
    <div className="flex flex-col items-center min-h-full bg-[var(--bg)]">

      {/* Search hero — compact for logged-in */}
      <div className="w-full flex flex-col items-center pt-12 pb-8 px-4">
        <div className="mb-6 text-center">
          <h1 className="font-display text-[28px] font-light text-[var(--fg)] leading-tight">
            Welcome back.
          </h1>
        </div>

        <div className="w-full max-w-2xl">
          <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--accent)] transition-colors">
            <Search size={15} strokeWidth={1.5} className="text-[var(--muted)] flex-shrink-0" />
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
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <FilterGroup label="Cuisine"    options={CUISINES}   value={cuisine} onChange={setCuisine} />
            <FilterGroup label="Dietary"    options={DIETARY}    value={dietary} onChange={setDietary} />
            <FilterGroup label="Difficulty" options={DIFFICULTY} value={diff}    onChange={setDiff} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full max-w-2xl px-4 pb-16 space-y-8">
        {/* Placeholder for personalized sections — Phase 3+ */}
        <RecipeSection title="Featured recipes" recipes={sampleRecipes} />

        {/* Placeholder cards for future features */}
        <div className="grid grid-cols-2 gap-4">
          <PlaceholderCard
            title="My Recipes"
            description="Your saved and created recipes will appear here."
            href="/my/recipes"
          />
          <PlaceholderCard
            title="Meal Planner"
            description="Plan your week. Coming in Phase 3."
            href="/my/planner"
            comingSoon
          />
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted)] flex-shrink-0">{label}</span>
      <div className="flex gap-1">
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`font-mono text-[10px] px-2 py-0.5 border transition-colors ${
              value === o
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--fg)] hover:text-[var(--fg)]'
            }`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

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
          {recipes.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}
              className="hover:bg-[var(--surface-hover)] transition-colors">
              <td style={{ padding: '10px 14px', borderRight: '1px solid var(--border)', fontWeight: 500 }}>
                <Link href={`/recipes/${r.slug}`} style={{ color: 'var(--fg)', textDecoration: 'none' }}
                  className="hover:text-[var(--accent)] transition-colors">{r.title}</Link>
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
                {r.ratings ? r.ratings.average.toFixed(1) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PlaceholderCard({ title, description, href, comingSoon }: {
  title: string; description: string; href: string; comingSoon?: boolean;
}) {
  return (
    <Link href={href} className={`block border border-[var(--border)] p-5 hover:border-[var(--accent)] transition-colors ${comingSoon ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[12px] font-medium text-[var(--fg)]">{title}</span>
        {comingSoon && (
          <span className="font-mono text-[9px] uppercase tracking-wider border border-[var(--border)] px-1.5 py-0.5 text-[var(--muted)]">
            Soon
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">{description}</p>
    </Link>
  );
}
