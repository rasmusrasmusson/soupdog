// src/lib/demand/resolve-requirement.ts
// Demand Model (Doc A) · Phase 1 · the cascade resolver.
//
// Resolves a person's DAILY requirement (energy + nutrients + a satiety need),
// field by field, to the best rung available FOR THAT FIELD. This is the heart
// of the model: NOT a ladder you climb and discard, but per-field fallback —
// each value independently takes the best source it can find, and a persona is
// only the FLOOR under whatever is still unknown.
//
// Rungs (Doc A §4), best first:
//   known   — a value the person stated/measured        (high confidence)
//   ...     — ask / stated-habit / learned-pattern come in later phases
//   persona — population-average for the closest inferred persona (low conf)
//
// Phase 1 wires only KNOWN (person_nutrient_targets) and PERSONA (the bottom
// rung, structured by age band + sex). The middle rungs (ask, habit, learned)
// slot in later WITHOUT changing this signature — each field just gains more
// candidate sources between known and persona.
//
// Aggregation rule (settled — Doc A §11, option C):
//   - additive nutrients (energy, protein, fibre): summed across a table, then
//     plated. Carried here as normal daily targets.
//   - satiety: a near-constraint, evaluated PER PERSON (never summed).
//   - constraint nutrients (sodium, future ceilings): carried through but
//     DEFERRED — not optimised in Phase 1 (see `deferred` flag below).
//
// Pure logic: the caller passes the db client. No auth here (routes do auth +
// self-person resolution, exactly like /api/my/health).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Rung = 'known' | 'persona';

export type Confidence = number; // 0..1

/** A single resolved value plus how we got it and how much we trust it. */
export interface ResolvedField {
  value: number | null;
  rung: Rung;
  source: string;        // e.g. 'user_stated', 'persona:adult_female'
  confidence: Confidence;
  /** true = carried but NOT optimised in Phase 1 (constraint nutrient). */
  deferred?: boolean;
}

/** Which way a nutrient behaves under aggregation (option C). */
export type NutrientKind = 'additive' | 'constraint';

export interface PersonRequirement {
  personId: string;
  personaId: PersonaId;         // the floor we landed on
  energy_kcal: ResolvedField;
  protein_g: ResolvedField;
  carbs_g: ResolvedField;
  fat_g: ResolvedField;
  fiber_g: ResolvedField;       // additive
  sodium_mg: ResolvedField;     // constraint — deferred in Phase 1
  satiety_need: ResolvedField;  // per-person near-constraint (0..1 scale)
  /** lowest confidence across the non-deferred fields — for honest UI copy. */
  overallConfidence: Confidence;
}

// ---------------------------------------------------------------------------
// Persona templates — the structured bottom rung (Doc A §11 "Default daily
// template"). PLACEHOLDER values: reasonable population averages, NOT a settled
// clinical spec. Editable in this one place; revisit before goals overlay.
// Age band selects the family; sex selects within it. There is no
// "toddler male" vs "toddler female" split — young bands are sex-agnostic.
// ---------------------------------------------------------------------------

export type PersonaId =
  | 'toddler'
  | 'child'
  | 'adult_female'
  | 'adult_male'
  | 'adult_unspecified';

interface PersonaTemplate {
  energy_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sodium_mg: number;   // a sensible default ceiling-ish value; deferred anyway
  satiety_need: number; // 0..1, how much fullness this occasion-day should aim for
}

const PERSONAS: Record<PersonaId, PersonaTemplate> = {
  toddler:           { energy_kcal: 1200, protein_g: 20, carbs_g: 150, fat_g: 45, fiber_g: 14, sodium_mg: 1200, satiety_need: 0.6 },
  child:             { energy_kcal: 1600, protein_g: 35, carbs_g: 210, fat_g: 55, fiber_g: 22, sodium_mg: 1500, satiety_need: 0.6 },
  adult_female:      { energy_kcal: 2000, protein_g: 50, carbs_g: 250, fat_g: 65, fiber_g: 25, sodium_mg: 2300, satiety_need: 0.6 },
  adult_male:        { energy_kcal: 2500, protein_g: 60, carbs_g: 310, fat_g: 80, fiber_g: 38, sodium_mg: 2300, satiety_need: 0.6 },
  // The true unknown — logged-out visitor reading a recipe. Doc A §5.1: no
  // separate anonymous mode; this is just "every field on the bottom rung."
  adult_unspecified: { energy_kcal: 2000, protein_g: 55, carbs_g: 250, fat_g: 70, fiber_g: 30, sodium_mg: 2300, satiety_need: 0.6 },
};

/** Confidence we assign to a persona-derived value. Deliberately LOW so the UI
 *  softens its language — a persona is a gentle guess, never a verdict. */
const PERSONA_CONFIDENCE = 0.3;
/** Confidence for a value the person stated themselves. */
const KNOWN_CONFIDENCE = 0.9;

// ---------------------------------------------------------------------------
// Persona inference — age band + sex → persona id. Pure.
// ---------------------------------------------------------------------------

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/**
 * Age gates the persona family (a toddler vs adult is the bigger nutritional
 * gap, and there is no "toddler male"); sex narrows within the adult family.
 * Anything unknown lands softer, never harder.
 */
export function inferPersona(
  dob: string | null | undefined,
  sexAtBirth: string | null | undefined, // 'female' | 'male' | 'unspecified' | null
): PersonaId {
  const age = ageFromDob(dob);
  if (age !== null) {
    if (age < 4) return 'toddler';
    if (age < 13) return 'child';
    // adolescents fold into the adult family for Phase 1; refine later
  }
  if (sexAtBirth === 'female') return 'adult_female';
  if (sexAtBirth === 'male') return 'adult_male';
  return 'adult_unspecified';
}

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

const NUTRIENT_KIND: Record<string, NutrientKind> = {
  energy_kcal: 'additive',
  protein_g: 'additive',
  carbs_g: 'additive',
  fat_g: 'additive',
  fiber_g: 'additive',
  sodium_mg: 'constraint',   // deferred in Phase 1
  satiety_need: 'additive',  // not really additive, but non-deferred; aggregated per-person upstream
};

/** Build one ResolvedField: known value wins; else fall to the persona floor. */
function resolveField(
  knownValue: number | null | undefined,
  knownSource: string | null | undefined,
  personaValue: number,
  personaId: PersonaId,
  fieldName: string,
): ResolvedField {
  const deferred = NUTRIENT_KIND[fieldName] === 'constraint';
  if (knownValue !== null && knownValue !== undefined) {
    return {
      value: Number(knownValue),
      rung: 'known',
      source: knownSource || 'user_stated',
      confidence: KNOWN_CONFIDENCE,
      ...(deferred ? { deferred: true } : {}),
    };
  }
  return {
    value: personaValue,
    rung: 'persona',
    source: `persona:${personaId}`,
    confidence: PERSONA_CONFIDENCE,
    ...(deferred ? { deferred: true } : {}),
  };
}

/**
 * Resolve a person's daily requirement, field by field.
 *
 * @param db        a Supabase client (caller has already done auth)
 * @param personId  the person whose requirement to resolve
 *
 * Reads:
 *   - person(date_of_birth)            → persona age band
 *   - health_profile(sex_at_birth)     → persona sex
 *   - person_nutrient_targets(...)     → the KNOWN rung, per field
 *
 * Returns every field resolved, each carrying its rung + confidence, plus an
 * overall confidence (the min across non-deferred fields) for honest UI copy.
 */
export async function resolveRequirement(
  db: any,
  personId: string,
): Promise<PersonRequirement> {
  // --- gather the inputs (best-effort; any may be absent) ---
  const [{ data: person }, { data: health }, { data: targets }] = await Promise.all([
    db.from('person').select('date_of_birth').eq('id', personId).maybeSingle(),
    db.from('health_profile').select('sex_at_birth').eq('person_id', personId).maybeSingle(),
    db.from('person_nutrient_targets')
      .select('daily_calories_kcal, daily_protein_g, daily_carbs_g, daily_fat_g, daily_fiber_g, daily_sodium_mg, source')
      .eq('person_id', personId)
      .maybeSingle(),
  ]);

  const personaId = inferPersona(person?.date_of_birth, health?.sex_at_birth);
  const tpl = PERSONAS[personaId];
  const src = targets?.source ?? null;

  const req: PersonRequirement = {
    personId,
    personaId,
    energy_kcal: resolveField(targets?.daily_calories_kcal, src, tpl.energy_kcal, personaId, 'energy_kcal'),
    protein_g:   resolveField(targets?.daily_protein_g,     src, tpl.protein_g,   personaId, 'protein_g'),
    carbs_g:     resolveField(targets?.daily_carbs_g,       src, tpl.carbs_g,     personaId, 'carbs_g'),
    fat_g:       resolveField(targets?.daily_fat_g,         src, tpl.fat_g,       personaId, 'fat_g'),
    fiber_g:     resolveField(targets?.daily_fiber_g,       src, tpl.fiber_g,     personaId, 'fiber_g'),
    sodium_mg:   resolveField(targets?.daily_sodium_mg,     src, tpl.sodium_mg,   personaId, 'sodium_mg'),
    // satiety has no known-rung source yet (comes in Phase 3); always persona for now.
    satiety_need: resolveField(null, null, tpl.satiety_need, personaId, 'satiety_need'),
    overallConfidence: 0, // set below
  };

  // Overall confidence = the weakest non-deferred field. If any core field is
  // only a persona guess, the whole requirement is a guess — and the UI should
  // say less / nudge softer.
  const coreFields: ResolvedField[] = [
    req.energy_kcal, req.protein_g, req.carbs_g, req.fat_g, req.fiber_g, req.satiety_need,
  ];
  req.overallConfidence = Math.min(...coreFields.map((f) => f.confidence));

  return req;
}

// ---------------------------------------------------------------------------
// Helper for the aggregation layer (next slice): expose nutrient kinds so the
// table-level aggregator knows what to sum vs. what to defer.
// ---------------------------------------------------------------------------
export function nutrientKind(field: string): NutrientKind | null {
  return NUTRIENT_KIND[field] ?? null;
}
