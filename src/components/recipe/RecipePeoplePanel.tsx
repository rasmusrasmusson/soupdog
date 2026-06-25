'use client';

// src/components/recipe/RecipePeoplePanel.tsx
// The people + per-person nutrition panel for an (unscheduled) recipe — the
// "what-if" surface. Mirrors the meal MealFitPanel, but:
//   • participants are a TRANSIENT local list (nothing scheduled here), and
//   • the list is prefilled from the caller's default set ("who I usually cook
//     for"; first default = self), editable here, with "save as default".
// Math/shape is identical to the meal panel — it POSTs the recipe-match route
// (/api/recipes/[versionId]/match) and fetches nutrition from the canonical
// nutrition route (single source of truth). No instance is created.
//
// Start / cooking is NOT here yet — it belongs to the instance-model session
// (Dish·Schedule·Start v0.2 §8): Start relocates from the meal once meals are
// the thin instance layer. This panel is the people + nutrition view only.

import { useCallback, useEffect, useState } from 'react';
import { Participants, type ParticipantPerson, type AddablePerson } from '@/components/people/Participants';

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };
const SERIF: React.CSSProperties = { fontFamily: 'IBM Plex Serif, serif' };

type DailyTargets = { calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null; fiber: number | null };
type PerParticipant = { personId: string; name: string; confidence: number; share: number; dailyTargets: DailyTargets };
type MatchData = {
  plating: { personId: string; name: string; share: number; phrase: string }[];
  score: { satietyOk: boolean };
  table: { confidence: number };
  perParticipant: PerParticipant[];
  recommendedServings: number;
};
type PerServing = Record<string, number>;
type Person = { personId: string; name: string; avatarColor: string | null; avatarInitials: string | null };

function confidenceBand(c: number): { color: string; label: string; note: string } {
  if (c >= 0.7) return { color: '#5f7a4f', label: 'Good estimate', note: 'We have enough about who\u2019s eating and what\u2019s in this dish to suggest portions with reasonable confidence.' };
  if (c >= 0.45) return { color: '#c08a3e', label: 'Rough estimate', note: 'We\u2019re working partly from typical figures. Add more about the people eating to sharpen this.' };
  return { color: '#9a978f', label: 'Best guess', note: 'We don\u2019t know much about who\u2019s eating yet, so this is a gentle guess from population averages.' };
}

const MACRO_ORDER = ['calories', 'protein', 'fat', 'carbohydrates', 'fiber'] as const;
const MACRO_LABEL: Record<string, string> = { calories: 'kcal', protein: 'protein', fat: 'fat', carbohydrates: 'carbs', fiber: 'fibre' };
function fmtAmount(key: string, v: number): string { return key === 'calories' ? String(Math.round(v)) : `${Math.round(v)} g`; }
const SHARE_COLORS = ['#5f7a4f', '#8a9a6b', '#b5a468', '#c08a3e', '#7a8b9a', '#9a7a6b'];

export default function RecipePeoplePanel({ versionId, slot = 'dinner' }: { versionId?: string; slot?: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [addable, setAddable] = useState<AddablePerson[]>([]);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [perServing, setPerServing] = useState<PerServing | null>(null);
  const [showConfNote, setShowConfNote] = useState(false);
  const [dirty, setDirty] = useState(false);   // changed from saved default?
  const [savedMsg, setSavedMsg] = useState(false);
  const [expanded, setExpanded] = useState(true); // detail open when data exists

  // prefill from the default set + load addable household
  useEffect(() => {
    let active = true;
    fetch('/api/my/cooking-defaults').then(r => r.json()).then(d => { if (active) setPeople(d.people ?? []); }).catch(() => {});
    fetch('/api/my/meal-plan/group').then(r => r.json()).then(d => { if (active) setAddable(d.people ?? []); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // recipe what-if match whenever the people list changes
  const runMatch = useCallback(async (ids: string[]) => {
    if (!versionId || ids.length === 0) { setMatch(null); return; }
    try {
      const d = await fetch(`/api/recipes/${versionId}/match`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personIds: ids, slot }),
      }).then(r => r.json());
      if (!d.error) setMatch(d);
    } catch { /* enhancement — fail quiet */ }
  }, [versionId, slot]);

  useEffect(() => { runMatch(people.map(p => p.personId)); }, [people, runMatch]);

  // nutrition from the canonical route (single source of truth)
  useEffect(() => {
    if (!versionId) { setPerServing(null); return; }
    let active = true;
    fetch(`/api/recipes/${versionId}/nutrition`).then(r => r.json())
      .then(d => { if (active) setPerServing((d?.perServing as PerServing) ?? null); })
      .catch(() => { if (active) setPerServing(null); });
    return () => { active = false; };
  }, [versionId]);

  function addPerson(personId: string) {
    const a = addable.find(x => x.id === personId);
    if (!a) return;
    setPeople(prev => prev.some(p => p.personId === personId) ? prev
      : [...prev, { personId: a.id, name: a.name, avatarColor: a.avatarColor, avatarInitials: a.avatarInitials }]);
    setDirty(true); setSavedMsg(false);
  }
  function removePerson(personId: string) {
    setPeople(prev => prev.filter(p => p.personId !== personId));
    setDirty(true); setSavedMsg(false);
  }
  async function saveDefault() {
    await fetch('/api/my/cooking-defaults', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personIds: people.map(p => p.personId) }),
    });
    setDirty(false); setSavedMsg(true);
  }

  const band = match ? confidenceBand(match.table.confidence) : null;
  const multi = (match?.plating.length ?? 0) > 1;
  const hasNutrition = !!perServing && Object.keys(perServing).length > 0;
  const hasDetail = !!match; // something to expand into

  const participants: ParticipantPerson[] = people.map(p => ({
    personId: p.personId, name: p.name, avatarColor: p.avatarColor, avatarInitials: p.avatarInitials,
  }));

  return (
    <div style={{ marginTop: 22, marginBottom: 22, border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', background: 'var(--surface)' }}>
      {/* compact one-line header: label · avatars+add · confidence · expand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f' }}>
          Who&rsquo;s eating
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Participants
            participants={participants}
            addable={addable}
            onAdd={addPerson}
            onRemove={removePerson}
            size={26}
            emptyHint="Add who this is for"
          />
        </div>
        {band && (
          <button type="button" onClick={() => setShowConfNote(v => !v)} title={band.label}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: band.color, display: 'inline-block' }} />
          </button>
        )}
        {hasDetail && (
          <button type="button" onClick={() => setExpanded(v => !v)} aria-label={expanded ? 'Collapse' : 'Expand'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', lineHeight: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* save-as-default affordance (compact, only when changed) */}
      {(dirty || savedMsg) && (
        <div style={{ marginTop: 8 }}>
          {dirty ? (
            <span onClick={saveDefault} style={{ ...MONO, fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}>
              Save as who I usually cook for
            </span>
          ) : (
            <span style={{ ...MONO, fontSize: 11, color: '#9a978f' }}>Saved</span>
          )}
        </div>
      )}

      {showConfNote && band && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: '12px 0 0', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {band.note}
        </div>
      )}

      {/* expandable detail: satiety + plating + per-person nutrition */}
      {expanded && match && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, color: 'var(--fg)', marginBottom: multi ? 16 : 0 }}>
            {match.score.satietyOk ? 'This should leave everyone comfortably full.' : 'This may be a little light \u2014 some at the table might still be peckish.'}
          </div>

          {multi && (
            <>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 8 }}>How to share it</div>
              <div style={{ display: 'flex', width: '100%', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
                {match.plating.map((p, i) => (
                  <div key={p.personId} title={`${p.name}: ${Math.round(p.share * 100)}%`}
                    style={{ width: `${p.share * 100}%`, background: SHARE_COLORS[i % SHARE_COLORS.length], height: '100%' }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {match.plating.slice().sort((a, b) => b.share - a.share).map((p) => (
                  <div key={p.personId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: SHARE_COLORS[match.plating.findIndex(x => x.personId === p.personId) % SHARE_COLORS.length], flex: '0 0 auto' }} />
                    <span style={{ ...SERIF, fontSize: 15, color: 'var(--fg)' }}>{p.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{p.phrase}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {hasNutrition && (
            <div style={{ marginTop: multi ? 22 : 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9a978f', marginBottom: 10 }}>What each portion gives</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {match.perParticipant.slice().sort((a, b) => b.share - a.share).map(p => {
                  const factor = p.share * (match.recommendedServings || 0);
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
                              <span style={{ color: 'var(--fg)' }}>{fmtAmount(k, amount)}</span>{' '}{MACRO_LABEL[k]}
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
                Shown as a share of each person&rsquo;s estimated daily needs — one meal is only part of a day.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
