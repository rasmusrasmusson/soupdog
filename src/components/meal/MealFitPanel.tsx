'use client';

// Demand Model · Phase 1 surfacing · "For your table" panel.
// Shows THREE honest signals, in priority order:
//   1. Confidence — a subtle dot (green/amber/grey) + tap for a plain note.
//      It frames everything; grey = "we don't know enough yet" (an invitation,
//      not an error).
//   2. Plating — per-person portioning guidance + a simple share bar.
//      Multi-person meals only.
//   3. Satiety — per person, plain words ("should leave full").
// Longitudinal nutrition-fit is DEFERRED to Phase 2 (judging one meal in
// isolation gives wrong-in-isolation advice — e.g. a dessert flagged "too much
// sugar" for someone who otherwise eats well). So we don't show a nutrition
// verdict here yet.

import { useEffect, useState } from 'react';

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };
const SERIF: React.CSSProperties = { fontFamily: 'IBM Plex Serif, serif' };

type PlatingPortion = { personId: string; name: string; share: number; phrase: string };
type Participant = { personId: string; name: string; personaId: string; confidence: number; satietyNeed: number };
type DailyTargets = { calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null; fiber: number | null };
type PerParticipant = {
  personId: string; name: string; confidence: number; share: number;
  dailyTargets: DailyTargets;
};
type MatchData = {
  slot: string;
  meal: { id: string; title: string; baseServings: number; versionId: string | null };
  table: { participants: Participant[]; confidence: number; satietyFloor: number };
  score: { recommendedServings: number; satietyOk: boolean; notes: string[] };
  plating: PlatingPortion[];
  perParticipant: PerParticipant[];
  recommendedServings: number;
};

// per-serving nutrition from the canonical recipe-nutrition route (same source
// as the recipe page — single source of truth).
type PerServing = Record<string, number>;

// Confidence → presentation. Grey for low (unknown, not bad).
function confidenceBand(c: number): { color: string; label: string; note: string } {
  if (c >= 0.7) return {
    color: '#5f7a4f', label: 'Good estimate',
    note: 'We have enough about who\u2019s eating and what\u2019s in this meal to suggest portions with reasonable confidence.',
  };
  if (c >= 0.45) return {
    color: '#c08a3e', label: 'Rough estimate',
    note: 'We\u2019re working partly from typical figures. Fill in more about the people eating, or add nutrition to the dishes, and this gets sharper.',
  };
  return {
    color: '#9a978f', label: 'Best guess',
    note: 'We don\u2019t know much about this table yet, so this is a gentle guess from population averages. Add people\u2019s details and dish nutrition to make it real.',
  };
}

export default function MealFitPanel({ mealId, slot = 'dinner' }: { mealId: string; slot?: string }) {
  const [data, setData] = useState<MatchData | null>(null);
  const [perServing, setPerServing] = useState<PerServing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfNote, setShowConfNote] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/my/meals/${mealId}/match?slot=${encodeURIComponent(slot)}`)
      .then(r => r.json())
      .then(d => { if (!active) return; if (d.error) setError(d.error); else setData(d); })
      .catch(() => active && setError('Could not work out portions just now.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [mealId, slot]);

  // Nutrition comes from the SAME route the recipe page uses (single source of
  // truth — numbers always match the recipe page). Fetched once we know the
  // recipe's current version id from match.
  const versionId = data?.meal.versionId ?? null;
  useEffect(() => {
    if (!versionId) { setPerServing(null); return; }
    let active = true;
    fetch(`/api/recipes/${versionId}/nutrition`)
      .then(r => r.json())
      .then(d => { if (active) setPerServing((d?.perServing as PerServing) ?? null); })
      .catch(() => { if (active) setPerServing(null); });
    return () => { active = false; };
  }, [versionId]);

  if (loading) return (
    <div style={{ ...MONO, fontSize: 12, color: 'var(--muted)', padding: '14px 0' }}>Working out portions…</div>
  );
  if (error || !data) return null; // fail quiet — this is an enhancement, not core

  const band = confidenceBand(data.table.confidence);
  const multi = data.plating.length > 1;
  const everyoneFull = data.score.satietyOk;
  const hasNutrition = !!perServing && Object.keys(perServing).length > 0;

  return (
    <div style={{ marginTop: 30, marginBottom: 26, border: '1px solid var(--border)', borderRadius: 12, padding: '18px 18px 20px', background: 'var(--surface)' }}>
      {/* header + confidence dot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f', flex: 1 }}>
          For your table
        </div>
        <button
          type="button"
          onClick={() => setShowConfNote(v => !v)}
          title={band.label}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: band.color, display: 'inline-block' }} />
          <span style={{ ...MONO, fontSize: 10, color: 'var(--muted)' }}>{band.label}</span>
        </button>
      </div>
      {showConfNote && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          {band.note}
        </div>
      )}

      {/* Satiety — plain words, per the demand model's near-constraint */}
      <div style={{ fontSize: 14, color: 'var(--fg)', marginTop: 10, marginBottom: multi ? 16 : 2 }}>
        {everyoneFull
          ? 'This should leave everyone comfortably full.'
          : 'This may be a little light \u2014 some at the table might still be peckish.'}
      </div>

      {/* Plating — multi-person only */}
      {multi && (
        <>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 8 }}>
            How to share it
          </div>

          {/* share bar */}
          <div style={{ display: 'flex', width: '100%', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
            {data.plating.map((p, i) => (
              <div key={p.personId}
                title={`${p.name}: ${Math.round(p.share * 100)}%`}
                style={{ width: `${p.share * 100}%`, background: shareColor(i), height: '100%' }} />
            ))}
          </div>

          {/* per-person guidance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.plating
              .slice()
              .sort((a, b) => b.share - a.share)
              .map((p, i) => (
                <div key={p.personId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: shareColor(data.plating.findIndex(x => x.personId === p.personId)), flex: '0 0 auto' }} />
                  <span style={{ ...SERIF, fontSize: 15, color: 'var(--fg)' }}>{p.name}</span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{p.phrase}</span>
                </div>
              ))}
          </div>
          <div style={{ fontSize: 11.5, color: '#9a978f', marginTop: 12, lineHeight: 1.5 }}>
            Portions are guidance based on each person’s needs — adjust to appetite.
          </div>
        </>
      )}

      {/* Per-person nutrition summary — the 5 headline macros + "% of daily".
          Nutrition from the canonical recipe-nutrition route (same as recipe
          page); portion = share × recommendedServings × perServing. "% of day"
          is against a DAILY target, so one meal reads low by design (§10a). */}
      {hasNutrition && (
        <div style={{ marginTop: multi ? 22 : 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 10 }}>
            What each portion gives
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {data.perParticipant
              .slice()
              .sort((a, b) => b.share - a.share)
              .map(p => {
                const factor = p.share * (data.recommendedServings || 0);
                return (
                  <div key={p.personId}>
                    <div style={{ ...SERIF, fontSize: 15, color: 'var(--fg)', marginBottom: 5 }}>{p.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                      {MACRO_ORDER.map(k => {
                        const perSv = perServing![k];
                        if (perSv == null) return null;
                        const amount = perSv * factor;
                        const target = p.dailyTargets[k as keyof DailyTargets];
                        const pct = (target && target > 0) ? (amount / target) * 100 : null;
                        return (
                          <span key={k} style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                            <span style={{ color: 'var(--fg)' }}>{fmtAmount(k, amount)}</span>
                            {' '}{MACRO_LABEL[k]}
                            {pct != null && <span style={{ color: '#9a978f' }}> · {Math.round(pct)}% of day</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
          <div style={{ fontSize: 11.5, color: '#9a978f', marginTop: 12, lineHeight: 1.5 }}>
            Shown as a share of each person’s estimated daily needs — one meal is only part of a day.
          </div>
        </div>
      )}
    </div>
  );
}

// 5 headline macros: order, labels, and amount formatting.
const MACRO_ORDER = ['calories', 'protein', 'fat', 'carbohydrates', 'fiber'] as const;
const MACRO_LABEL: Record<string, string> = {
  calories: 'kcal', protein: 'protein', fat: 'fat', carbohydrates: 'carbs', fiber: 'fibre',
};
function fmtAmount(key: string, v: number): string {
  if (key === 'calories') return String(Math.round(v));
  return `${Math.round(v)} g`;
}

// A calm, food-friendly palette for the share segments (not alarming reds).
const SHARE_COLORS = ['#5f7a4f', '#8a9a6b', '#b5a468', '#c08a3e', '#7a8b9a', '#9a7a6b'];
function shareColor(i: number): string {
  return SHARE_COLORS[i % SHARE_COLORS.length];
}
