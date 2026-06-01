// src/app/my/recipes/[id]/map/page.tsx
// Read-only visual: the Food Model content map for one recipe.
// Ingredients (with roles) -> transformations -> dish, coloured by evidence grade.
// Part of Food Model Stage 1. No writes.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Ingredient = { name: string; category: string; quantity: string; roles: string[]; evidence: string; bucket: 'good' | 'inferred' | 'flagged' };
type Step = { order: number; type: string; label: string };
type MapData = {
  recipe: { id: string; slug: string; title: string; servings: number };
  ingredients: Ingredient[];
  steps: Step[];
  subRecipes: { canonicalId: string; label: string }[];
};

const C = {
  bg: '#f7f6f2', fg: '#1a1a1a', accent: '#2e4638', muted: '#6b6860', border: '#dad7d1',
  good: '#1d9e75', goodFill: '#e1f5ee', inferred: '#ba7517', inferredFill: '#faeeda',
  flagged: '#a32d2d', flaggedFill: '#fcebeb', step: '#534ab7', stepFill: '#eeedfe', dish: '#5f5e5a', dishFill: '#f1efe8',
};

function bucketColor(b: string) {
  if (b === 'good') return { stroke: C.good, fill: C.goodFill };
  if (b === 'flagged') return { stroke: C.flagged, fill: C.flaggedFill };
  return { stroke: C.inferred, fill: C.inferredFill };
}

export default function RecipeMapPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/my/recipes/${id}/map`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then(setData)
      .catch((e) => setError(typeof e === 'string' ? e : 'Failed to load map'));
  }, [id]);

  if (error) return <div style={{ padding: 32, fontFamily: 'IBM Plex Serif, serif', color: C.fg }}>Could not load map: {error}</div>;
  if (!data) return <div style={{ padding: 32, color: C.muted }}>Loading map…</div>;

  // Layout: three columns — ingredients (left), transformations (mid), dish (right).
  const colX = { ing: 40, step: 320, dish: 540 };
  const rowH = 60, top = 90;
  const ingH = Math.max(data.ingredients.length, 1) * rowH;
  const stepH = Math.max(data.steps.length, 1) * rowH;
  const height = top + Math.max(ingH, stepH, 120) + 160;
  const dishY = top + Math.max(ingH, stepH) / 2 - 28;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 32, fontFamily: 'IBM Plex Sans, system-ui, sans-serif', color: C.fg }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 26, color: C.accent, fontWeight: 600, marginBottom: 4 }}>
          {data.recipe.title}
        </h1>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>
          Content map · {data.recipe.servings} servings · colour = evidence grade
        </p>

        <svg width="100%" viewBox={`0 0 700 ${height}`} role="img" style={{ marginTop: 16 }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          <text x={colX.ing} y={70} fontSize="13" fill={C.muted}>Ingredients (role · evidence)</text>
          <text x={colX.step} y={70} fontSize="13" fill={C.muted}>Transformations</text>
          <text x={colX.dish} y={70} fontSize="13" fill={C.muted}>Dish</text>

          {/* ingredient nodes */}
          {data.ingredients.map((ing, i) => {
            const y = top + i * rowH;
            const col = bucketColor(ing.bucket);
            const sub = [ing.roles[0], ing.evidence.replace('_', ' ')].filter(Boolean).join(' · ');
            return (
              <g key={ing.name}>
                <rect x={colX.ing} y={y} width={240} height={44} rx={8} fill={col.fill} stroke={col.stroke} strokeWidth={0.5} />
                <text x={colX.ing + 12} y={y + 19} fontSize="14" fontWeight={500} fill={C.fg}>{ing.name}</text>
                <text x={colX.ing + 12} y={y + 35} fontSize="12" fill={C.muted}>{sub || ing.category}</text>
                <line x1={colX.ing + 240} y1={y + 22} x2={colX.step - 8} y2={top + (stepH / 2)} stroke={C.border} strokeWidth={0.5} markerEnd="url(#arr)" />
              </g>
            );
          })}

          {/* transformation nodes */}
          {data.steps.map((s, i) => {
            const y = top + i * rowH;
            return (
              <g key={s.order}>
                <rect x={colX.step} y={y} width={180} height={44} rx={8} fill={C.stepFill} stroke={C.step} strokeWidth={0.5} />
                <text x={colX.step + 12} y={y + 19} fontSize="14" fontWeight={500} fill={C.accent}>{s.label}</text>
                <text x={colX.step + 12} y={y + 35} fontSize="12" fill={C.muted}>{s.type}</text>
                <line x1={colX.step + 180} y1={y + 22} x2={colX.dish - 8} y2={dishY + 28} stroke={C.border} strokeWidth={0.5} markerEnd="url(#arr)" />
              </g>
            );
          })}

          {/* dish node */}
          <g>
            <rect x={colX.dish} y={dishY} width={120} height={56} rx={8} fill={C.dishFill} stroke={C.dish} strokeWidth={0.5} />
            <text x={colX.dish + 60} y={dishY + 26} fontSize="14" fontWeight={500} fill={C.fg} textAnchor="middle">Finished dish</text>
            <text x={colX.dish + 60} y={dishY + 43} fontSize="12" fill={C.muted} textAnchor="middle">final</text>
          </g>

          {/* legend */}
          <g transform={`translate(${colX.ing}, ${height - 70})`}>
            <rect x={0} y={0} width={14} height={14} rx={3} fill={C.goodFill} stroke={C.good} strokeWidth={0.5} />
            <text x={20} y={11} fontSize="12" fill={C.muted}>E1+ grounded</text>
            <rect x={140} y={0} width={14} height={14} rx={3} fill={C.inferredFill} stroke={C.inferred} strokeWidth={0.5} />
            <text x={160} y={11} fontSize="12" fill={C.muted}>E0 inferred — gap</text>
            <rect x={320} y={0} width={14} height={14} rx={3} fill={C.stepFill} stroke={C.step} strokeWidth={0.5} />
            <text x={340} y={11} fontSize="12" fill={C.muted}>transformation</text>
          </g>
        </svg>

        {data.subRecipes.length > 0 && (
          <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>
            Sub-recipes: {data.subRecipes.map((s) => s.label).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
