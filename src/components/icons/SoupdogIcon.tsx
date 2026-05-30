// src/components/icons/SoupdogIcon.tsx
// Custom Soupdog SVG icons — 24x24, currentColor stroke, no fill
// Usage: <SoupdogIcon name="recipes" size={16} className="text-[var(--accent)]" />

import React from 'react';

export type SoupdogIconName =
  | 'recipes'
  | 'ingredients'
  | 'techniques'
  | 'tools'
  | 'cut_prepare'
  | 'move_transfer'
  | 'cook_dry_heat'
  | 'cook_wet_heat'
  | 'cook_appliance'
  | 'mix_combine'
  | 'passive_process'
  | 'measure_clean'
  | 'finish_serve';

const paths: Record<SoupdogIconName, React.ReactNode> = {
  recipes: (
    <>
      <path d="M5 4.5h8.5a3 3 0 0 1 3 3v12H8a3 3 0 0 0-3 3z" />
      <path d="M5 4.5v15" />
      <path d="M8.5 7.5h5" />
      <path d="M8.5 10.5h4" />
    </>
  ),
  ingredients: (
    <>
      <path d="M12 3.5c3.7 2.6 6 5.7 6 9.1a6 6 0 0 1-12 0c0-3.4 2.3-6.5 6-9.1z" />
      <path d="M12 7.2c2.1 1.6 3.4 3.3 3.4 5.2a3.4 3.4 0 0 1-6.8 0c0-1.9 1.3-3.6 3.4-5.2z" />
      <path d="M12 3.5v3.7" />
    </>
  ),
  techniques: (
    <>
      <path d="M4 20l7.2-7.2" />
      <path d="M9.4 9.2l5.4 5.4" />
      <path d="M13.7 4.3l6 6" />
      <path d="M16.1 6.7l-6.7 6.7" />
      <path d="M18.2 15.5l1.8 1.8a1.5 1.5 0 0 1 0 2.1l-.6.6a1.5 1.5 0 0 1-2.1 0l-1.8-1.8" />
      <path d="M4.5 4.5l5.7 5.7" />
    </>
  ),
  tools: (
    <>
      <path d="M6 10h10v6a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" />
      <path d="M16 12h3.2a2 2 0 0 1 0 4H16" />
      <path d="M8 7.5h6" />
      <path d="M9 5.5h4" />
    </>
  ),
  cut_prepare: (
    <>
      <path d="M4 18.5h16" />
      <path d="M6 15.5c1.5-2.1 3.1-3.4 5-4 1.9.6 3.5 1.9 5 4" />
      <path d="M8.2 15.5c.8-1.1 1.7-1.8 2.8-2.2 1.1.4 2 1.1 2.8 2.2" />
      <path d="M14 4.5l5.5 5.5" />
      <path d="M17.1 7.6L9.2 15.5" />
      <path d="M4.5 10.5h5.8" />
    </>
  ),
  move_transfer: (
    <>
      <path d="M4.5 8.5c2.8-1 5.9-.7 8.5.9" />
      <path d="M5.5 9.5a5.5 5.5 0 0 0 7.8 3.2" />
      <path d="M14.2 9.8l3 1.8" />
      <path d="M17.8 12.6c1.4.4 2.4 1.7 2.4 3.2 0 1.9-1.5 3.4-3.4 3.4h-4.5a3.4 3.4 0 0 1-3.4-3.4" />
      <path d="M13.5 16.5h4.2" />
      <path d="M16.2 14.2v4.2" />
    </>
  ),
  cook_dry_heat: (
    <>
      <path d="M4.5 13h9.5a4 4 0 0 1-4 4H8.5a4 4 0 0 1-4-4z" />
      <path d="M14 13h5.5" />
      <path d="M8 20c-.7-1.1-.5-2.1.6-3" />
      <path d="M12 20c.8-1.4.5-2.4-.8-3.4" />
      <path d="M9.7 5.5c1.4 1.4 1.4 2.6 0 4" />
      <path d="M12.8 4c2 2 2 3.8 0 5.8" />
    </>
  ),
  cook_wet_heat: (
    <>
      <path d="M5 11h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <path d="M4 11h14" />
      <path d="M7.5 8c-.9-.9-.9-1.8 0-2.7" />
      <path d="M11 8c-.9-.9-.9-1.8 0-2.7" />
      <path d="M14.5 8c-.9-.9-.9-1.8 0-2.7" />
      <path d="M17 13h2a1.8 1.8 0 0 1 0 3.6h-2" />
    </>
  ),
  cook_appliance: (
    <>
      <rect x="4" y="6" width="16" height="13" rx="2" />
      <rect x="7" y="9" width="8" height="6" rx="1" />
      <path d="M17.5 10h.1" />
      <path d="M17.5 13h.1" />
      <path d="M8 19v1.5" />
      <path d="M16 19v1.5" />
    </>
  ),
  mix_combine: (
    <>
      <path d="M6 20l6.8-6.8" />
      <path d="M12.5 13.5c-2.5-2.5-3.1-5.1-1.5-6.7 1.6-1.6 4.2-1 6.7 1.5 2.5 2.5 3.1 5.1 1.5 6.7-1.6 1.6-4.2 1-6.7-1.5z" />
      <path d="M13 13l5.8-5.8" />
      <path d="M11.5 11.5l5.8-5.8" />
      <path d="M14.5 14.5l5.8-5.8" />
    </>
  ),
  passive_process: (
    <>
      <path d="M5 13h14" />
      <path d="M6.5 13a5.5 5.5 0 0 0 11 0" />
      <path d="M8 10.5c1.8-1.3 6.2-1.3 8 0" />
      <path d="M12 7.5v3" />
      <circle cx="17.5" cy="6.5" r="2.2" />
      <path d="M17.5 5.4v1.1l.8.7" />
    </>
  ),
  measure_clean: (
    <>
      <path d="M6 5h9v13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" />
      <path d="M15 8h2.5a2.5 2.5 0 0 1 0 5H15" />
      <path d="M8.5 9h3" />
      <path d="M8.5 12h2" />
      <path d="M8.5 15h3" />
      <path d="M18.8 16.5c.8.8.8 1.7 0 2.5" />
    </>
  ),
  finish_serve: (
    <>
      <ellipse cx="12" cy="16" rx="7.5" ry="3" />
      <path d="M8.5 14.5c.8-1.7 2-2.5 3.5-2.5s2.7.8 3.5 2.5" />
      <path d="M7 19h10" />
      <path d="M9 9.5c-.8-.8-.8-1.6 0-2.4" />
      <path d="M12 9.5c-.8-.8-.8-1.6 0-2.4" />
      <path d="M15 9.5c-.8-.8-.8-1.6 0-2.4" />
    </>
  ),
};

interface SoupdogIconProps {
  name: SoupdogIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}

export function SoupdogIcon({
  name,
  size = 24,
  className,
  style,
  strokeWidth = 1.6,
}: SoupdogIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
