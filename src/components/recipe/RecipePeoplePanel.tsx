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

import { useState, useEffect } from 'react';
import { Participants, type ParticipantPerson } from '@/components/people/Participants';
import { useRecipePeople } from '@/components/recipe/RecipePeopleContext';

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };
const SERIF: React.CSSProperties = { fontFamily: 'IBM Plex Serif, serif' };


function confidenceBand(c: number): { color: string; label: string } {
  if (c >= 0.7) return { color: '#5f7a4f', label: 'Good estimate' };
  if (c >= 0.45) return { color: '#c08a3e', label: 'Rough estimate' };
  return { color: '#9a978f', label: 'Best guess' };
}


// Explains what the confidence dot means + the full scale. Matches the
// NutrientDetailModal pattern (overlay, click-out / Escape to close).
function ConfidenceModal({ activeColor, onClose }: { activeColor: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = [
    { color: '#5f7a4f', label: 'Good estimate', note: 'We know enough about who’s eating and what’s in the dish to suggest portions with reasonable confidence.' },
    { color: '#c08a3e', label: 'Rough estimate', note: 'We’re working partly from typical figures. Add more about the people eating to sharpen it.' },
    { color: '#9a978f', label: 'Best guess', note: 'We don’t know much about who’s eating yet, so this is a gentle guess from population averages.' },
  ];

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(20,18,14,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border)', maxWidth: 460, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '24px 26px', position: 'relative' }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 12, right: 14, background: 'transparent', border: 'none', fontSize: 22, lineHeight: 1, color: 'var(--muted)', cursor: 'pointer' }}>×</button>

        <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>How sure is this?</div>
        <h2 style={{ ...SERIF, fontSize: 22, fontWeight: 600, margin: '0 0 12px', color: 'var(--fg)' }}>Estimate confidence</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg)', margin: '0 0 18px' }}>
          The portions and nutrition shown here are estimates. How confident they are depends on how much we know about the people eating — their ages, sizes and needs — and how completely the dish’s ingredients are described. The more you tell us about who’s eating, the sharper it gets.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(r => (
            <div key={r.label} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', opacity: r.color === activeColor ? 1 : 0.6 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: r.color, flex: '0 0 auto', marginTop: 3 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>
                  {r.label}{r.color === activeColor ? <span style={{ ...MONO, fontSize: 9, color: 'var(--muted)', marginLeft: 8, letterSpacing: '0.1em' }}>THIS DISH</span> : null}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{r.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// Reads off the plating split; degrades gracefully for one person.
function platingSummary(plating: { name: string; share: number; phrase: string }[]): string {
  if (plating.length === 0) return '';
  if (plating.length === 1) return `Cooking for ${plating[0].name}.`;
  const sorted = plating.slice().sort((a, b) => b.share - a.share);
  const parts = sorted.map(p => `${p.name} — ${p.phrase}`);
  if (parts.length === 2) return `${parts[0]}; ${parts[1]}.`;
  return parts.slice(0, -1).join('; ') + '; and ' + parts[parts.length - 1] + '.';
}

export default function RecipePeoplePanel({ versionId }: { versionId?: string }) {
  void versionId; // people/match now come from context (provider owns versionId)
  const ctx = useRecipePeople();
  const [showConfModal, setShowConfModal] = useState(false);
  const [expanded, setExpanded] = useState(true); // detail open when data exists

  if (!ctx) return null;
  const { people, addable, match, dirty, savedMsg, addPerson, removePerson, saveDefault } = ctx;
  const band = match ? confidenceBand(match.table.confidence) : null;
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
        {(dirty || savedMsg) && (
          <button type="button" onClick={dirty ? saveDefault : undefined}
            title={dirty ? 'Save as who I usually cook for' : 'Saved as your usual'}
            aria-label={dirty ? 'Save as who I usually cook for' : 'Saved'}
            style={{ background: 'none', border: 'none', cursor: dirty ? 'pointer' : 'default', padding: 2, lineHeight: 0, color: dirty ? 'var(--accent)' : '#9a978f' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill={dirty ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
        {band && (
          <button type="button" onClick={() => setShowConfModal(true)} title="What does this mean?"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: band.color, display: 'inline-block' }} />
            <span style={{ ...MONO, fontSize: 10, color: 'var(--muted)' }}>{band.label}</span>
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

      {showConfModal && band && (
        <ConfidenceModal activeColor={band.color} onClose={() => setShowConfModal(false)} />
      )}

      {/* expandable detail: summary + satiety + plating + per-person nutrition */}
      {expanded && match && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {match.plating.length > 0 && (
            <div style={{ ...SERIF, fontSize: 14.5, color: 'var(--fg)', lineHeight: 1.5, marginBottom: 14 }}>
              {platingSummary(match.plating)}
            </div>
          )}
          <div style={{ ...SERIF, fontSize: 14.5, color: 'var(--fg)', lineHeight: 1.5 }}>
            {match.score.satietyOk ? 'This should leave everyone comfortably full.' : 'This may be a little light — some at the table might still be peckish.'}
          </div>
        </div>
      )}
    </div>
  );
}
