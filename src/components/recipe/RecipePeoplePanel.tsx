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

import { useState } from 'react';
import { Participants, type ParticipantPerson } from '@/components/people/Participants';
import { useRecipePeople } from '@/components/recipe/RecipePeopleContext';

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono, monospace)' };
const SERIF: React.CSSProperties = { fontFamily: 'IBM Plex Serif, serif' };


function confidenceBand(c: number): { color: string; label: string; note: string } {
  if (c >= 0.7) return { color: '#5f7a4f', label: 'Good estimate', note: 'We have enough about who\u2019s eating and what\u2019s in this dish to suggest portions with reasonable confidence.' };
  if (c >= 0.45) return { color: '#c08a3e', label: 'Rough estimate', note: 'We\u2019re working partly from typical figures. Add more about the people eating to sharpen this.' };
  return { color: '#9a978f', label: 'Best guess', note: 'We don\u2019t know much about who\u2019s eating yet, so this is a gentle guess from population averages.' };
}


// Plain-language summary of the plating — "what we're cooking for each person".
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
  const [showConfNote, setShowConfNote] = useState(false);
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

      {showConfNote && band && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: '12px 0 0', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {band.note}
        </div>
      )}

      {/* expandable detail: summary + satiety + plating + per-person nutrition */}
      {expanded && match && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {match.plating.length > 0 && (
            <div style={{ ...SERIF, fontSize: 14.5, color: 'var(--fg)', lineHeight: 1.5, marginBottom: 14 }}>
              {platingSummary(match.plating)}
            </div>
          )}
          <div style={{ fontSize: 14, color: 'var(--fg)' }}>
            {match.score.satietyOk ? 'This should leave everyone comfortably full.' : 'This may be a little light — some at the table might still be peckish.'}
          </div>
        </div>
      )}
    </div>
  );
}
