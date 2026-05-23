'use client';
import type { Recipe } from '@/types';
import { useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

const CUISINES   = ['All', 'Indian', 'European', 'Asian', 'American', 'Middle Eastern'];
const DIETARY    = ['All', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal'];
const DIFFICULTY = ['All', 'Easy', 'Medium', 'Hard'];

export function LoggedOutHome({ recipes }: { recipes: Recipe[] }) {
  const [query, setQuery]     = useState('');
  const [cuisine, setCuisine] = useState('All');
  const [dietary, setDietary] = useState('All');
  const [diff, setDiff]       = useState('All');

  return (
    <div className="min-h-screen bg-[var(--bg)]">

      {/* ── Hero ── */}
      <div className="flex flex-col items-center pt-20 pb-12 px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--muted)] mb-4">
          Precise cooking programs
        </p>
        <h1 className="font-display text-[48px] font-light text-[var(--fg)] leading-tight mb-3 max-w-xl">
          What are you cooking?
        </h1>
        <p className="text-[13px] text-[var(--muted)] max-w-md mb-10 leading-relaxed">
          Structured recipes, precise execution, connected appliances. A food platform built for serious cooks.
        </p>

        {/* Search */}
        <div className="w-full max-w-xl mb-4">
          <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 focus-within:border-[var(--accent)] transition-colors shadow-sm">
            <Search size={16} strokeWidth={1.5} className="text-[var(--muted)] flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Recipe, ingredient, technique..."
              className="flex-1 bg-transparent text-[15px] text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
            />
          </div>

          {/* Filters */}
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2">
            <FilterGroup label="Cuisine"    options={CUISINES}   value={cuisine} onChange={setCuisine} />
            <FilterGroup label="Dietary"    options={DIETARY}    value={dietary} onChange={setDietary} />
            <FilterGroup label="Difficulty" options={DIFFICULTY} value={diff}    onChange={setDiff} />
          </div>
        </div>
      </div>

      {/* ── Featured recipes ── */}
      <div className="max-w-2xl mx-auto px-6 pb-16 space-y-10">
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Featured Recipes</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
            <Link href="/recipes" className="font-mono text-[9px] text-[var(--muted)] hover:text-[var(--accent)] transition-colors uppercase tracking-wider">
              View all →
            </Link>
          </div>
          <RecipeTable recipes={recipes} />
        </section>

        {/* ── Value props ── */}
        <section className="grid grid-cols-3 gap-px bg-[var(--border)] border border-[var(--border)]">
          {[
            ['Food process graph',    'Every ingredient is a transformed state. Every recipe is a structured execution graph.'],
            ['Versioned recipes',     'Any change creates a new version. Track lineage, derive variants, roll back.'],
            ['Connected appliances',  'Recipes become machine-readable programs for smart ovens and connected kitchens.'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-[var(--surface)] px-5 py-5">
              <p className="text-[12px] font-medium text-[var(--fg)] mb-1.5">{title}</p>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">{desc}</p>
            </div>
          ))}
        </section>

        {/* ── Sign up CTA ── */}
        <section className="border border-[var(--border)] p-8 text-center">
          <h2 className="font-display text-[24px] font-light text-[var(--fg)] mb-2">
            Save recipes, track your kitchen
          </h2>
          <p className="text-[12px] text-[var(--muted)] mb-6 max-w-sm mx-auto leading-relaxed">
            Free account. Save recipes, manage your household, register appliances, get personalised recommendations.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/signup"
              className="inline-flex items-center gap-2 bg-[var(--accent)] text-white px-6 py-2.5 text-[12px] font-mono hover:bg-[var(--accent-mid)] transition-colors tracking-wide">
              Create free account <ArrowRight size={13} />
            </Link>
            <Link href="/login"
              className="text-[12px] font-mono text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
              Sign in →
            </Link>
          </div>
        </section>
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

function RecipeTable({ recipes }: { recipes: Recipe[] }) {
  return (
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
  );
}
