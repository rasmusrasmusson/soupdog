'use client';

// src/components/recipe/RecipePeopleContext.tsx
// ONE source of truth for "the recipe's people" + the per-person match, shared
// by the Cook-for panel (top) and the nutrition section (bottom) so they never
// drift. The page wraps both in <RecipePeopleProvider versionId=...>.
//
// Phase 1: adding/removing people changes who's shown, the plating split, and
// per-person nutrition — it does NOT switch the recipe to a different variation
// (that's Phase 2, the scaling-as-variation work). Ingredient quantities stay
// at base; only nutrition/plating reflect the people.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type RPPerson = { personId: string; name: string; avatarColor: string | null; avatarInitials: string | null };
export type RPAddable = { id: string; name: string; avatarColor: string | null; avatarInitials: string | null };

type DailyTargets = { calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null; fiber: number | null };
export type RPPerParticipant = { personId: string; name: string; confidence: number; share: number; dailyTargets: DailyTargets };
export type RPMatch = {
  plating: { personId: string; name: string; share: number; phrase: string }[];
  score: { satietyOk: boolean };
  table: { confidence: number };
  perParticipant: RPPerParticipant[];
  recommendedServings: number;
};

type Ctx = {
  versionId?: string;
  people: RPPerson[];
  addable: RPAddable[];
  match: RPMatch | null;
  perServing: Record<string, number> | null;
  dirty: boolean;
  savedMsg: boolean;
  addPerson: (personId: string) => void;
  removePerson: (personId: string) => void;
  saveDefault: () => Promise<void>;
};

const RecipePeopleCtx = createContext<Ctx | null>(null);

export function RecipePeopleProvider({ versionId, slot = 'dinner', children }: { versionId?: string; slot?: string; children: React.ReactNode }) {
  const [people, setPeople] = useState<RPPerson[]>([]);
  const [addable, setAddable] = useState<RPAddable[]>([]);
  const [match, setMatch] = useState<RPMatch | null>(null);
  const [perServing, setPerServing] = useState<Record<string, number> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // prefill from the default set + load addable household
  useEffect(() => {
    let active = true;
    fetch('/api/my/cooking-defaults').then(r => r.json()).then(d => { if (active) setPeople(d.people ?? []); }).catch(() => {});
    fetch('/api/my/meal-plan/group').then(r => r.json()).then(d => { if (active) setAddable(d.people ?? []); }).catch(() => {});
    return () => { active = false; };
  }, []);

  // recipe what-if match whenever the people list changes
  const runMatch = useCallback(async (ids: string[]) => {
    if (!versionId) { setMatch(null); return; }
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
      .then(d => { if (active) setPerServing((d?.perServing as Record<string, number>) ?? null); })
      .catch(() => { if (active) setPerServing(null); });
    return () => { active = false; };
  }, [versionId]);

  const addPerson = useCallback((personId: string) => {
    const a = addable.find(x => x.id === personId);
    if (!a) return;
    setPeople(prev => prev.some(p => p.personId === personId) ? prev
      : [...prev, { personId: a.id, name: a.name, avatarColor: a.avatarColor, avatarInitials: a.avatarInitials }]);
    setDirty(true); setSavedMsg(false);
  }, [addable]);

  const removePerson = useCallback((personId: string) => {
    setPeople(prev => prev.filter(p => p.personId !== personId));
    setDirty(true); setSavedMsg(false);
  }, []);

  const saveDefault = useCallback(async () => {
    await fetch('/api/my/cooking-defaults', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personIds: people.map(p => p.personId) }),
    });
    setDirty(false); setSavedMsg(true);
  }, [people]);

  const value: Ctx = {
    versionId, people, addable, match, perServing, dirty, savedMsg,
    addPerson, removePerson, saveDefault,
  };

  return <RecipePeopleCtx.Provider value={value}>{children}</RecipePeopleCtx.Provider>;
}

export function useRecipePeople(): Ctx | null {
  return useContext(RecipePeopleCtx);
}
