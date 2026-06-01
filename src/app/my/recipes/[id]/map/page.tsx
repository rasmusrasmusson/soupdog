// src/app/my/recipes/[id]/map/page.tsx
// Read-only Food Model content map for one recipe.
// Ingredients -> components (steps grouped by label) -> finished dish,
// each ingredient coloured by evidence grade. Part of Food Model Stage 1.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Ingredient = {
  name: string; category: string; quantity: string; stepId: string | null;
  roles: string[]; evidence: string; bucket: 'good' | 'inferred' | 'flagged';
};
type Step = { id: string; order: number; type: string; label: string };
type MapData = {
  recipe: { id: string; slug: string; title: string; servings: number };
  ingredients: Ingredient[];
  steps: Step[];
};

const C = {
  bg: '#f7f6f2', fg: '#1a1a1a', accent: '#2e4638', muted: '#6b6860', border: '#dad7d1',
  good: '#1d9e75', goodFill: '#e1f5ee', inferred: '#ba7517', inferredFill: '#faeeda',
  flagged: '#a32d2d', flaggedFill: '#fcebeb', comp: '#534ab7', compFill: '#eeedfe',
  dish: '#5f5e5a', dishFill: '#f1efe8',
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
    if (!id) return;
    fetch(`/api/my/recipes/${id}/map`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error || 'error'))))
      .then(setData)
      .catch((e) => setError(typeof e === 'string' ? e : 'Failed to load map'));
  }, [id]);

  if (error) return <div style={{ padding: 32, fontFamily: 'IBM Plex Sans, sans-serif', color: C.fg }}>Could not load map: {error}</div>;
  if (!data) return <div style={{ padding: 32, color: C.muted }}>Loading map…</div>;

  // --- Build components: group steps by label, in first-appearance order ---
  const stepById: Record<string, Step> = {};
  for (const s of data.steps) stepById[s.id] = s;

  const componentOrder: string[] = [];
  for (const s of [...data.steps].sort((a, b) => a.order - b.order)) {
    if (!componentOrder.includes(s.label)) componentOrder.push(s.label);
  }
  // Map each ingredient to a component label via its stepId; fallback bucket 'Other'.
  const FALLBACK = 'Ingredients';
  const ingredientsByComponent: Record<string, Ingredient[]> = {};
  for (const ing of data.ingredients) {
    const label = (ing.stepId && stepById[ing.stepId]) ? stepById[ing.stepId].label : FALLBACK;
    (ingredientsByComponent[label] ??= []).push(ing);
  }
  // Components that actually have ingredients or steps, in order; include fallback last.
  const components = [...componentOrder];
  if (ingredientsByComponent[FALLBACK] && !components.includes(FALLBACK)) components.push(FALLBACK);

  // --- Layout (robust: integers, no NaN paths) ---
  const W = 760;
  const colIng = 40, colComp = 380, colDish = 600;
  const ingW = 250, compW = 150, dishW = 130;
  const rowH = 52, top = 96, pad = 10;

  // Position ingredients grouped under their component, stacked.
  type Placed = { ing: Ingredient; x: number; y: number };
  const placedIngs: Placed[] = [];
  const compY: Record<string, number> = {};
  let cursor = top;
  for (const comp of components) {
    const list = ingredientsByComponent[comp] ?? [];
    const blockStart = cursor;
    for (const ing of list) {
      placedIngs.push({ ing, x: colIng, y: cursor });
      cursor += rowH;
    }
    if (list.length === 0) cursor += rowH; // reserve a row even if empty
    const blockEnd = cursor;
    compY[comp] = Math.round((blockStart + blockEnd) / 2 - 22); // centre comp node on its block
    cursor += pad;
  }
  const contentBottom = cursor;
  const dishY = Math.round(top + (contentBottom - top) / 2 - 28);
  const height = Math.max(contentBottom, dishY + 56) + 90;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 32, fontFamily: 'IBM Plex Sans, system-ui, sans-serif', color: C.fg }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'IBM Plex Serif, serif', fontSize: 26, color: C.accent, fontWeight: 600, marginBottom: 4 }}>{data.recipe.title}</h1>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 0 }}>Content map · {data.recipe.servings} servings · colour = evidence grade</p>

        <svg width="100%" viewBox={`0 0 ${W} ${height}`} role="img" style={{ marginTop: 16 }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          <text x={colIng} y={72} fontSize="13" fill={C.muted}>Ingredients (evidence)</text>
          <text x={colComp} y={72} fontSize="13" fill={C.muted}>Components</text>
          <text x={colDish} y={72} fontSize="13" fill={C.muted}>Dish</text>

          {/* ingredient -> component edges */}
          {placedIngs.map((p, i) => {
            const comp = (p.ing.stepId && stepById[p.ing.stepId]) ? stepById[p.ing.stepId].label : FALLBACK;
            const cy = (compY[comp] ?? dishY) + 22;
            return <line key={`e${i}`} x1={colIng + ingW} y1={p.y + 22} x2={colComp - 8} y2={cy} stroke={C.border} strokeWidth={0.5} markerEnd="url(#arr)" />;
          })}

          {/* ingredient nodes */}
          {placedIngs.map((p, i) => {
            const col = bucketColor(p.ing.bucket);
            const sub = [p.ing.roles[0], p.ing.evidence.replace('_', ' ')].filter(Boolean).join(' · ');
            return (
              <g key={`n${i}`}>
                <rect x={p.x} y={p.y} width={ingW} height={44} rx={8} fill={col.fill} stroke={col.stroke} strokeWidth={0.5} />
                <text x={p.x + 12} y={p.y + 19} fontSize="14" fontWeight={500} fill={C.fg}>{p.ing.name}</text>
                <text x={p.x + 12} y={p.y + 35} fontSize="12" fill={C.muted}>{sub || p.ing.category}</text>
              </g>
            );
          })}

          {/* component nodes + edge to dish */}
          {components.map((comp) => {
            const y = compY[comp] ?? dishY;
            return (
              <g key={`c${comp}`}>
                <rect x={colComp} y={y} width={compW} height={44} rx={8} fill={C.compFill} stroke={C.comp} strokeWidth={0.5} />
                <text x={colComp + 12} y={y + 26} fontSize="14" fontWeight={500} fill={C.comp}>{comp}</text>
                <line x1={colComp + compW} y1={y + 22} x2={colDish - 8} y2={dishY + 28} stroke={C.border} strokeWidth={0.5} markerEnd="url(#arr)" />
              </g>
            );
          })}

          {/* dish */}
          <g>
            <rect x={colDish} y={dishY} width={dishW} height={56} rx={8} fill={C.dishFill} stroke={C.dish} strokeWidth={0.5} />
            <text x={colDish + dishW / 2} y={dishY + 26} fontSize="14" fontWeight={500} fill={C.fg} textAnchor="middle">Finished dish</text>
            <text x={colDish + dishW / 2} y={dishY + 43} fontSize="12" fill={C.muted} textAnchor="middle">final</text>
          </g>

          {/* legend */}
          <g transform={`translate(${colIng}, ${height - 60})`}>
            <rect x={0} y={0} width={14} height={14} rx={3} fill={C.goodFill} stroke={C.good} strokeWidth={0.5} />
            <text x={20} y={11} fontSize="12" fill={C.muted}>E1+ grounded</text>
            <rect x={130} y={0} width={14} height={14} rx={3} fill={C.inferredFill} stroke={C.inferred} strokeWidth={0.5} />
            <text x={150} y={11} fontSize="12" fill={C.muted}>E0 inferred — gap</text>
            <rect x={300} y={0} width={14} height={14} rx={3} fill={C.compFill} stroke={C.comp} strokeWidth={0.5} />
            <text x={320} y={11} fontSize="12" fill={C.muted}>component</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
