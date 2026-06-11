// src/lib/ai/access.ts
//
// The single seam for "does this user have AI access?". TODAY: any logged-in
// user has access (placeholder). LATER: this reads the `plan` column / credit
// balance — Stripe enforcement hardens HERE, and only here. Keep all callers
// going through this function so the upgrade is one place.

import type { User } from '@supabase/supabase-js';

export type AiAccess = {
  hasAccess: boolean;
  reason: 'ok' | 'logged_out';
};

// Server-side check from a Supabase user (or null).
export function hasAiAccess(user: User | null): AiAccess {
  if (!user) return { hasAccess: false, reason: 'logged_out' };
  // Placeholder: every logged-in user has access. When billing lands, replace
  // with a plan/credit check (e.g. read user_profiles.plan, compare balance).
  return { hasAccess: true, reason: 'ok' };
}

// Client-side mirror (the panel uses this to decide panel vs upsell). Kept in
// sync with the server check deliberately — both are placeholders today.
export function clientHasAiAccess(isLoggedIn: boolean): boolean {
  return isLoggedIn;
}
