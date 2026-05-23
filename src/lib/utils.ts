import { clsx, type ClassValue } from 'clsx';
import type { Measurement, UnitSystem } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// ── Unit conversion ──────────────────────────
const CONVERSIONS: Record<string, Record<string, number>> = {
  g:   { oz: 0.035274, lb: 0.00220462 },
  ml:  { floz: 0.033814, cup: 0.00422675, tsp: 0.202884, tbsp: 0.067628 },
  celsius: { fahrenheit: 1 }, // handled specially
  mm:  { inch: 0.0393701 },
};

export function convertMeasurement(m: Measurement, system: UnitSystem): Measurement {
  if (system === 'si') return m;

  if (m.unit === 'celsius') {
    const f = (m.value * 9) / 5 + 32;
    return { value: Math.round(f), unit: 'fahrenheit', display: `${Math.round(f)}°F` };
  }

  const conv = CONVERSIONS[m.unit];
  if (!conv) return m;

  const targetUnit = system === 'imperial' || system === 'us'
    ? Object.keys(conv)[0]
    : m.unit;

  const converted = m.value * (conv[targetUnit] ?? 1);
  return {
    value: +converted.toFixed(2),
    unit: targetUnit,
    display: formatMeasurement(+converted.toFixed(2), targetUnit),
  };
}

export function formatMeasurement(value: number, unit: string): string {
  const unitLabels: Record<string, string> = {
    g: 'g', kg: 'kg', ml: 'ml', l: 'L',
    celsius: '°C', fahrenheit: '°F',
    oz: 'oz', lb: 'lb', floz: 'fl oz',
    cup: 'cup', tsp: 'tsp', tbsp: 'tbsp',
    mm: 'mm', inch: '"',
  };
  return `${value} ${unitLabels[unit] ?? unit}`;
}

// ── Time formatting ──────────────────────────
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${m} min`;
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
}

// ── Slug helpers ─────────────────────────────
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
