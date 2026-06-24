// src/components/people/Participants.tsx
'use client';

// Shared participants control: an avatar stack + a dashed "+" to add people +
// per-person popover (name + remove). Purely PRESENTATIONAL — it renders the
// list and emits onAdd(personId) / onRemove(personId); the PARENT decides what
// those mean:
//   • meals  → persist via /api/my/meal-plan/participant (meal_participant rows)
//   • recipes → mutate transient local state (a what-if "for these people" view)
// Same component, two persistence modes (Participants design v0.1 §4).
//
// Colour + monogram logic is carried VERBATIM from PlanView so existing meal
// avatars are pixel-identical after the extraction (PlanView's palette/hash
// differ from Avatar.tsx's; switching would silently recolour everyone).

import { useEffect, useRef, useState } from 'react';

export type ParticipantPerson = {
  /** stable person id — drives the deterministic colour. */
  personId: string;
  name: string;
  avatarColor: string | null;
  avatarInitials: string | null;
};

export type AddablePerson = {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarInitials: string | null;
};

const B = '1px solid var(--border)';
const MONO = 'var(--font-mono, monospace)';

// ── colour + monogram (verbatim from PlanView, so avatars don't shift) ──
const PALETTE: Record<string, string> = {
  olive: '#5a6b52', sage: '#7d8c6a', clay: '#a8634a', slate: '#5c6b72',
  plum: '#6d5168', teal: '#3f6b63', ochre: '#9c7a3c', rose: '#9c5f6b',
};
const PALETTE_KEYS = Object.keys(PALETTE);
function colorFor(id: string, key: string | null): string {
  if (key && PALETTE[key]) return PALETTE[key];
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[PALETTE_KEYS[Math.abs(h) % PALETTE_KEYS.length]];
}
function monogram(name: string, override?: string | null): string {
  const o = override?.trim();
  if (o) return o.slice(0, 3).toUpperCase();
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const popover: React.CSSProperties = {
  position: 'absolute', right: 0, top: 38, background: 'var(--surface)', border: B,
  borderRadius: 10, padding: 8, zIndex: 20, minWidth: 200,
  boxShadow: '0 6px 22px rgba(0,0,0,0.10)',
};

export function Participants({
  participants,
  addable,
  onAdd,
  onRemove,
  size = 30,
  emptyHint,
}: {
  participants: ParticipantPerson[];
  /** people who CAN be added (already-present ones filtered out by the parent or here). */
  addable: AddablePerson[];
  onAdd: (personId: string) => void;
  onRemove: (personId: string) => void;
  size?: number;
  /** optional faint hint shown when there are no participants yet (e.g. recipe view). */
  emptyHint?: string;
}) {
  const [openAdd, setOpenAdd] = useState(false);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // dismiss popovers on outside-click / Escape (matches PlanView's later fix)
  useEffect(() => {
    if (!openAdd && !openPerson) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenAdd(false); setOpenPerson(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpenAdd(false); setOpenPerson(null); }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [openAdd, openPerson]);

  const present = new Set(participants.map(p => p.personId));
  const addableFiltered = addable.filter(a => !present.has(a.id));

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {participants.length === 0 && emptyHint && (
          <span style={{ fontSize: 12.5, color: 'var(--muted)', marginRight: 8 }}>{emptyHint}</span>
        )}
        {participants.map((p, i) => (
          <span key={p.personId} title={p.name}
            onClick={() => { setOpenPerson(v => v === p.personId ? null : p.personId); setOpenAdd(false); }}
            style={{ width: size, height: size, borderRadius: '50%', background: colorFor(p.personId, p.avatarColor), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, border: '2px solid var(--bg)', marginLeft: i === 0 ? 0 : -6, cursor: 'pointer' }}>
            {monogram(p.name, p.avatarInitials)}
          </span>
        ))}
        {addableFiltered.length > 0 && (
          <span title="Add someone" onClick={() => { setOpenAdd(v => !v); setOpenPerson(null); }}
            style={{ width: size, height: size, borderRadius: '50%', border: '1px dashed var(--border)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, marginLeft: participants.length ? 4 : 0, cursor: 'pointer' }}>+</span>
        )}
      </div>

      {/* person popover: name + remove */}
      {openPerson && (() => {
        const p = participants.find(x => x.personId === openPerson);
        if (!p) return null;
        return (
          <div style={popover}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 6px 10px' }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: colorFor(p.personId, p.avatarColor), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{monogram(p.name, p.avatarInitials)}</span>
              <span style={{ fontSize: 13.5, color: 'var(--fg)' }}>{p.name}</span>
            </div>
            <div onClick={() => { onRemove(p.personId); setOpenPerson(null); }}
              style={{ borderTop: B, padding: '9px 8px 2px', fontSize: 13, color: '#9c5f4a', cursor: 'pointer' }}>
              Remove from this meal
            </div>
          </div>
        );
      })()}

      {/* add-person picker */}
      {openAdd && addableFiltered.length > 0 && (
        <div style={popover}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 8px 8px' }}>Add</div>
          {addableFiltered.map(h => (
            <div key={h.id} onClick={() => { onAdd(h.id); setOpenAdd(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', cursor: 'pointer', fontSize: 13.5, borderRadius: 6 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: colorFor(h.id, h.avatarColor), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>{monogram(h.name, h.avatarInitials)}</span>
              <span style={{ whiteSpace: 'nowrap' }}>{h.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
