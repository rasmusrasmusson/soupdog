
# SESSION UPDATE — 2026-06-04 (Demand Model Doc A · Phase 0 SHIPPED & VERIFIED)

## SHIPPED THIS ARC (on prod + live DB)
Doc A (Demand Model v0.4) **Phase 0** is done — the one confirmed schema gap is closed: daily nutrient targets now live on the `person` spine instead of the legacy `nutrition_profiles`.

### What was built
- **New table `person_nutrient_targets`** (person-keyed, PK = person_id → person(id) ON DELETE CASCADE). Columns: daily_calories_kcal, daily_protein_g, daily_carbs_g, daily_fat_g, daily_fiber_g, daily_sodium_mg + cascade metadata `source` (text) + `confidence` (numeric) + created_at/updated_at. Modelled on `person_meal_prefs` (one row per person). Chosen OVER widening health_profile so opt-in goal/target data stays separate from physiological facts and each target carries its own cascade source/confidence.
- **Migration file:** `supabase/migrations/migration_v6_person_nutrient_targets.sql`. Idempotent. Structure: STEP 0 create table → STEP 0b table GRANT → STEP 0c RLS → STEP 1/2 dry-run SELECTs → STEP 3 commit-wrapped backfill → STEP 4 (commented, retire legacy later, DON'T drop in P0).
- **New API route:** `src/app/api/my/nutrient-targets/route.ts`. GET → targets or population-average DEFAULTS with `isDefault` flag; PUT → upsert, marks `source='user_stated'`, `confidence=0.9`. Mirrors `/api/my/health/route.ts` self-person resolution (person_access role='self', revoked_at null).

### Backfill result
`nutrition_profiles` was **EMPTY** — dry-run STEP 1 returned 0 rows. Backfill was a clean no-op; nothing migrated, nothing lost. Table + route is all Phase 0 needed.

### Two gotchas hit & fixed (both now folded into the migration)
1. **`permission denied for table person_nutrient_targets` (500 on GET+PUT).** A freshly CREATE'd table grants nothing to PostgREST roles, so `authenticated` is blocked BEFORE RLS evaluates. Fix = `grant select, insert, update, delete on table public.person_nutrient_targets to authenticated;` (now STEP 0b). RLS scopes rows; the GRANT lets the role touch the table at all — two different layers.
2. Verified live: GET → `isDefault:true` + defaults (empty table); PUT {fiber 38, protein 90} → `{ok:true}`; GET again → `isDefault:false`, source='user_stated', confidence=0.9. Round-trip confirmed.

## MIGRATIONS FOLDER — decided this arc
`supabase/` is **NOT a Supabase CLI project** (no config.toml/.branches/.temp). It's a hand-maintained SQL changelog; every migration header says "Run this in Supabase SQL Editor." So: the live DB is the source of truth, SQL is applied by hand in the editor with dry-run discipline, and these files are the human-readable record. Convention = ascending `migration_vN_*.sql` in `supabase/migrations/` (now up to v6). The stray top-level files (schema.sql [STALE], mealcomp_00_schema.sql, rule_*_v0.3.sql, seed*.sql) are one-off builds/seeds, not part of the ordered series. The earlier loose `db/migrations/` folder was deleted/consolidated into `supabase/migrations/`.

## OPEN / NEXT
- **`[OPEN]` carried:** the population-average DEFAULTS in nutrient-targets/route.ts (2000 kcal, 60 protein, 250 carbs, 70 fat, 30 fibre, 2300 sodium) are a PLACEHOLDER filling Doc A §11 "Default daily template," not a settled spec. Trivially editable in one place. Settle the real template before Phase 1 leans on it.
- **Natural next steps (both small, foundational):**
  - Doc A **Phase 1** — aggregate the requirement across participants; closeness-score candidate meals; output a whole-portion per-person recommendation. (Reads person_nutrient_targets + meal_component/meal_participant, all live.)
  - Doc B **Phase 0** — when an algorithmic fallback is served, write a `content_request` row (what/why/demand signal). Near-zero cost; starts accruing demand data. (Note: no `content_request` table exists yet — would be the first build.)
- Still settle the rest of Doc A §11 / Doc B §11 `[OPEN]`s before building beyond these.
