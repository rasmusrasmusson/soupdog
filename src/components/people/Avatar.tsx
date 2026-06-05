// src/components/people/Avatar.tsx
// Shared avatar: monogram on a coloured disc. One component, two contexts —
// pass `muted` for non-functional placement (e.g. the header) and full strength
// where the avatar is useful (people lists, meal views).
//
// Colour resolution: explicit palette key (person.avatar_color) → deterministic
// key from the person id → monogram from the display-name initial.
// (Uploaded photos are a later addition; the component is shaped for it.)

'use client';

import React from 'react';

// Curated, on-brand muted palette (keys are stable; tune values here later and
// every avatar updates automatically). White monogram is legible on all of them.
export const AVATAR_PALETTE: { key: string; value: string }[] = [
  { key: 'olive', value: '#2e4638' },
  { key: 'sage', value: '#5a6e52' },
  { key: 'clay', value: '#7a5c3e' },
  { key: 'slate', value: '#4a5a66' },
  { key: 'plum', value: '#6b4a52' },
  { key: 'teal', value: '#3e6660' },
  { key: 'ochre', value: '#7a6a3e' },
  { key: 'rose', value: '#8a5a5a' },
];

export function colorForKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return AVATAR_PALETTE.find((p) => p.key === key)?.value ?? null;
}

// Deterministic fallback colour from a stable id.
export function deterministicColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length].value;
}

// Default monogram: initials of the first and last words of the name
// (e.g. "Nils Rasmus Rasmusson" -> "NR"). Single-word names fall back to the
// first two letters ("Rasmus" -> "RA"). An explicit `initials` override wins.
export function deriveInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({ id, name, colorKey, initials, size = 40, muted = false }: {
  id: string;
  name: string | null | undefined;
  colorKey?: string | null;
  /** explicit monogram override; when set, wins over the name-derived default. */
  initials?: string | null;
  size?: number;
  muted?: boolean;
}) {
  const bg = colorForKey(colorKey) ?? deterministicColor(id);
  const mono = (initials && initials.trim()) ? initials.trim().toUpperCase() : deriveInitials(name);
  return (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: size,
        background: bg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * (mono.length > 1 ? 0.36 : 0.42), fontFamily: 'IBM Plex Serif, serif',
        flex: '0 0 auto',
        opacity: muted ? 0.55 : 1,
        filter: muted ? 'saturate(0.8)' : 'none',
        transition: 'opacity 0.15s ease, filter 0.15s ease',
      }}
    >
      {mono}
    </div>
  );
}

// A small swatch picker, shown only where colour is functional (people/profile
// edit forms) — never in the header.
export function AvatarColorPicker({ value, onChange }: {
  value: string | null | undefined;
  onChange: (key: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {AVATAR_PALETTE.map((p) => {
        const on = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(on ? null : p.key)}
            aria-label={p.key}
            title={p.key}
            style={{
              width: 30, height: 30, borderRadius: 30, background: p.value,
              cursor: 'pointer',
              border: on ? '2px solid #1a1a1a' : '2px solid transparent',
              outline: on ? '2px solid #fff' : 'none',
              outlineOffset: on ? '-4px' : 0,
            }}
          />
        );
      })}
    </div>
  );
}
