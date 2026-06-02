# Soupdog Development Handover
**Project:** Soupdog (soup.dog) — food execution platform  
**Repo:** github.com/rasmusrasmusson/soupdog  
**Stack:** Next.js 16, React, TypeScript, Tailwind CSS v4, Supabase, Vercel  
**Working directory:** `E:\OneDrive LW personal\LeWorks\Soupdog - site\2026\soupdog`  
**Supabase project ID:** npvajzgciuykugqxedmm  

---

## How to start each session (Windows PowerShell)

```powershell
Remove-Item Env:NODE_EXTRA_CA_CERTS -ErrorAction SilentlyContinue
Remove-Item Env:NODE_TLS_REJECT_UNAUTHORIZED -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
cd "E:\OneDrive LW personal\LeWorks\Soupdog - site\2026\soupdog"
```

**GitHub push:** Use HTTPS not SSH (SSH blocked in China):
```powershell
git remote set-url origin https://github.com/rasmusrasmusson/soupdog.git
git push
```

Clash Verge must have TUN Mode ON. VPN required for Anthropic API and GitHub.

**File delivery pattern:** Claude zips files, user downloads, extracts, and replaces manually in Explorer. Never use PowerShell `Set-Content` or `WriteAllLines` to edit TSX files — corrupts them.

---

## Platform Vision

Soupdog is not a recipe website. It is a **food execution platform** — a structured knowledge graph of food, processes, and tools that AI can reason over.

**The graph is the moat. The AI is the interface.**

Long-term goals: software-defined food preparation, appliance-specific execution profiles, commercial kitchen optimisation, personalised nutrition at household level.

---

## What's Working (as of 2026-05-31)

### Public
- Public recipe browsing at `/recipes`
- Recipe pages at `/recipes/[slug]` — structured tables, ingredient pill toggles per step, nutrition section
- Search at `/search` — full-text, type filters, barcode lookup
- Authentication (email login via Supabase Auth)

### My Recipes (`/my/recipes`)
- Single "Add recipe" button → goes to import page
- Created/Saved tabs, draft/published status, publish toggle
- Delete with inline Cancel/Delete confirm buttons
- Preview (ExternalLink icon) for both draft and published recipes
- Success banners via sessionStorage (saved/published) — show once, clear on return

### Add Recipe (`/my/recipes/import`) — Basic mode
- Paste text OR upload JPG/PNG/WebP/PDF/TXT (up to 20MB)
- Optional recipe name field at top
- Auto-import on file drop (no extra click)
- Claude (Sonnet) parses into atomic steps
- Preview shows WYSIWYG recipe with editable title, description, cuisine, difficulty, tags
- Chat panel (right side) — Haiku for questions, Sonnet for modifications, streaming responses
- "Save recipe" → saves draft → redirects to My Recipes with banner
- "Advanced editor →" link for admins

### Basic Edit (`/my/recipes/[id]`) — WYSIWYG
- Loads recipe in view-mode style (meta grid, ingredients table, steps table)
- Editable: title (inline), cuisine, difficulty, servings directly in meta grid
- Chat panel right sidebar — live updates recipe as AI makes changes
- "Advanced editor →" link in breadcrumb
- Save recipe button (fixed bottom bar, clears sidebar)
- Edit badge: "Draft · editing" or "Published · editing"
- Chat intro: explains fields are directly editable

### Advanced Editor (`/my/recipes/[id]/edit`)
- Full RecipeEditor form (~2600 lines)
- Fixed right sidebar chat panel (300px)
- Save bar stops at sidebar (right: 300px)
- Ingredient pills with expand-to-edit for qty/unit/prep
- Tool badges use SoupdogIcon "tools" (custom SVG, not Lucide)
- Streaming responses, Haiku/Sonnet routing

### Recipe View (`/recipes/[slug]`)
- Authors can view own drafts (amber banner + "Publish recipe" button)
- After publish → redirects to My Recipes with published banner
- Nutrition section shows when ingredients have USDA data

---

## AI Chat System

### Architecture
- Route: `src/app/api/recipes/import/chat/route.ts`
- **Haiku** for questions/answers (fast, cheap)
- **Sonnet** for modifications (accurate)
- Streaming SSE — text streams word-by-word, JSON hidden during modifications
- `requiresConfirmation: true` for large changes → Apply/Cancel buttons
- Scope: food, cooking, nutrition, appliances, Soupdog platform questions only
- `max_tokens: 8000` for modifications

### Chat used on:
- `/my/recipes/import` — import preview chat
- `/my/recipes/[id]` — basic edit chat
- `/my/recipes/[id]/edit` — advanced editor chat

---

## Nutrition System

### Auto-estimation
When a new ingredient is created (POST or PUT recipe save), Claude Haiku estimates USDA nutrition per 100g and saves to `ingredients.nutrition_per_100g`.

Function `estimateNutrition(name)` exists in both:
- `src/app/api/my/recipes/route.ts`
- `src/app/api/my/recipes/[id]/route.ts`

### Backfill endpoint
`POST /api/admin/backfill-nutrition` — processes 30 ingredients per call, single batched Haiku request. Call from browser console while logged in:
```javascript
fetch('/api/admin/backfill-nutrition', { method: 'POST' }).then(r => r.json()).then(console.log)
```
Call repeatedly until `remaining: 0`.

### Known nutrition gaps
- `pasta water` — marked `is_product = true` to exclude from nutrition checks
- Taxonomy category nodes ("Dairy", "Grains & Pasta" etc.) — marked `is_product = true`
- Nutrition only shows in view page when `confidence !== 'insufficient'` and `calories > 0`

---

## Schema (v3/v4/v5 — current)

### Key tables
| Table | Purpose |
|---|---|
| `recipe_canonicals` | Stable identity. Slug, author, published state. |
| `recipe_versions` | Versioned content. `version_number` must increment (unique constraint on canonical_id + version_number, default 1). |
| `version_steps` | Steps with task_id FK, `appliance_settings` JSONB (stores taskId, taskName, taskFamily, stepTools, groupToolInstances). |
| `version_ingredients` | Per-version ingredients with `step_id` FK. Step ingredients linked here, NOT in appliance_settings. |
| `tasks` | Atomic task library. family, task_type, suggested_tool_slugs. |
| `ingredients` | Unified ingredient + product table. `is_product` flag, `nutrition_per_100g` JSONB, barcode, brand. |
| `equipment` | Equipment taxonomy. |

### Important: step ingredients storage
Step ingredients are stored in `version_ingredients` with a `step_id` FK — **NOT** in `appliance_settings`. The GET `/api/my/recipes/[id]` builds `stepIngredients` by joining `version_ingredients` filtered by `step_id`.

### Group labels
`__default__` is an internal sentinel — always strip before saving to DB:
```typescript
group_label: (step.groupLabel?.trim() === '__default__' ? null : step.groupLabel?.trim()) || null
```

### version_number
Must be provided on insert — get next number first:
```typescript
const { data: existing } = await db.from('recipe_versions')
  .select('version_number').eq('canonical_id', id)
  .order('version_number', { ascending: false }).limit(1);
const nextVersion = ((existing?.[0]?.version_number) ?? 0) + 1;
```

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/my/recipes` | GET/POST | List (from recipe_canonicals) + create recipes |
| `/api/my/recipes/[id]` | GET/PUT/DELETE | Load/update/delete recipe |
| `/api/my/recipes/[id]/publish` | PATCH | Toggle published — updates both recipe_canonicals AND recipes by slug |
| `/api/recipes/import` | POST | Claude parsing — accepts `{text}` OR `{file, mediaType}` |
| `/api/recipes/import/chat` | POST | Streaming SSE chat — Haiku/Sonnet routing |
| `/api/admin/backfill-nutrition` | POST | Backfill nutrition for ingredients missing data |
| `/api/ingredients/search` | GET | Ingredient autocomplete |
| `/api/recipes/[id]/nutrition` | GET | Nutrition estimate |
| `/api/tasks` | GET/POST | Task library |
| `/api/ingredients/tree` | GET | Ingredient taxonomy tree |
| `/api/equipment/tree` | GET | Equipment taxonomy tree |

**Anthropic models:**
- Questions/answers: `claude-haiku-4-5-20251001`
- Modifications/parsing: `claude-sonnet-4-6`
- **API key:** Set in Vercel env as `ANTHROPIC_API_KEY`

---

## Delete Flow (important)

Delete must remove from `recipes` table FIRST (FK constraint), then `recipe_canonicals`:
```typescript
await db.from('recipes').delete().eq('slug', canonical.slug);
await db.from('recipe_canonicals').delete().eq('id', id).eq('author_id', user.id);
```

The GET `/api/my/recipes` queries `recipe_canonicals` and returns canonical IDs as `r.id`. These are the correct IDs to use for delete and publish.

---

## Publish Flow

The publish API (`/api/my/recipes/[id]/publish`) updates both tables:
1. `recipe_canonicals` by canonical id
2. `recipes` by slug (legacy mirror)

After publishing from recipe view page → sets `sessionStorage.setItem('soupdog_published', title)` → redirects to `/my/recipes` → banner shows once and clears.

---

## Known Issues / Technical Debt

1. **Stale Supabase types** — `src/lib/supabase/types.ts` is pre-v3. All new queries use `(supabase as any)`. Fix: `npx supabase gen types typescript --project-id npvajzgciuykugqxedmm > src/lib/supabase/types.ts` (run locally with VPN).

2. **Google OAuth in test mode** — Needs publishing in Google Cloud Console for production.

3. **Legacy mirror dependency** — Public recipe pages query `recipes` table first, then fall back to `recipe_canonicals`. New recipes auto-mirror to both.

4. **Async nutrition on save** — Currently `estimateNutrition()` is awaited during recipe save, adding ~1s latency per new ingredient. Should be made async (fire and forget) to keep saves fast.

5. **RLS on recipes table** — Draft recipes not visible to authors via public query due to RLS. Currently handled by querying without `is_published` filter and checking `author_id` in code, but RLS may still block in some cases.

---

## Next Priority Features

### Priority 1 — Usage tracking (Option D)
Log AI calls per user to Supabase `ai_usage_log` table: user_id, timestamp, model, input_tokens, output_tokens, feature. Foundation for membership tiers.

### Priority 2 — DOCX + Excel upload (Batch 2)
Support Word documents and Excel files on import page. Excel needs `xlsx` npm package for conversion to CSV/text before passing to Claude.

### Priority 3 — Edit flow routing
Currently pencil icon on My Recipes → basic edit (`/my/recipes/[id]`). Advanced editor at `/my/recipes/[id]/edit`. This routing is correct. The `new` page (`/my/recipes/new`) is the legacy form-only editor, still accessible via "Advanced editor →" link.

### Priority 4 — Public ingredient browse
`/ingredients` taxonomy tree navigation. Nodes seeded (g- prefix), just needs UI.

### Priority 5 — Servings scaling
Servings stepper → creates `execution_variant` with AI-scaled quantities (non-linear: spices at ~0.7x etc).

### Priority 6 — Entity relations seeding
Seed `entity_relations` with ingredient substitutions, flavour affinities, equipment equivalences.

---

## Design System

| Token | Value |
|---|---|
| Background | `#f7f6f2` warm off-white |
| Accent | `#2e4638` dark olive green |
| Muted | `#6b6860` |
| Border | `#dad7d1` |
| Display font | IBM Plex Serif |
| Mono font | IBM Plex Mono |

CSS vars: `--bg`, `--fg`, `--accent`, `--muted`, `--border`, `--surface`, `--surface-hover`, `--accent-subtle`

Fixed bottom bar pattern:
```tsx
<div style={{ position: 'fixed', bottom: 0, left: 0, right: 300, borderTop: B, background: 'var(--surface)', padding: '10px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 50 }}>
```
Note: `right: 300` accounts for fixed chat sidebar on edit pages.

---

## Key File Map

| File | Purpose |
|---|---|
| `src/app/recipes/[slug]/page.tsx` | Recipe view page — draft preview for authors, publish button |
| `src/app/my/recipes/page.tsx` | My Recipes — single Add recipe button, delete/publish/preview actions |
| `src/app/my/recipes/import/page.tsx` | Add Recipe (basic) — upload/paste, AI parse, WYSIWYG preview, chat |
| `src/app/my/recipes/[id]/page.tsx` | Basic edit — WYSIWYG view + chat panel, editable meta fields |
| `src/app/my/recipes/[id]/edit/page.tsx` | Advanced editor — full RecipeEditor + right sidebar chat |
| `src/app/my/recipes/new/page.tsx` | Legacy form editor (still works, linked as "Advanced editor") |
| `src/app/api/recipes/import/route.ts` | Claude atomic-step parsing — accepts text or base64 file |
| `src/app/api/recipes/import/chat/route.ts` | Streaming SSE chat — Haiku/Sonnet, scope-limited to food/Soupdog |
| `src/app/api/my/recipes/route.ts` | GET list + POST create — includes estimateNutrition, findOrCreateIngredient |
| `src/app/api/my/recipes/[id]/route.ts` | GET/PUT/DELETE — step ingredients from version_ingredients, version_number increment |
| `src/app/api/my/recipes/[id]/publish/route.ts` | PATCH publish — updates canonicals + recipes by slug |
| `src/app/api/admin/backfill-nutrition/route.ts` | One-time backfill — batched Haiku nutrition estimation |
| `src/components/recipe/RecipeEditor.tsx` | Shared editor (~2600 lines) — ingredient pills, SoupdogIcon for tools |
| `src/components/icons/SoupdogIcon.tsx` | Custom SVG icons — use `name="tools"` for tool icons everywhere |
| `src/lib/supabase/types.ts` | **STALE** — needs regeneration |

---

# SESSION UPDATE — 2026-06-01 (Food Model live + People & Groups design)

## Food Model — NOW LIVE (Stage 1 complete)
The "Food Model" (a.k.a. Computational Food Model) is built and running on production Supabase. Design docs: `Soupdog_Food_Model_Design_v0.5.docx`, `Soupdog_Food_Model_Stage1_Plan.docx`. Thesis: food = a graph of states connected by transformations; intelligence captured as reusable structured **data** (graded rules), not spent per-request. The graph is the moat.

### What's live in the DB (Stage 1)
- **Evidence system:** `evidence_grade` enum (e0_inferred, e1_literature, e2_expert, e3_tested, e4_validated, u_user_feedback) + `evidence_rank()`. Higher grade wins.
- **Culinary roles (LOOKUP tables, NOT enum):** `culinary_role_categories` (7) + `culinary_roles` (39). Many-to-many via `ingredient_roles` (intrinsic — what an ingredient CAN do, drives substitution) and `version_ingredient_roles` (contextual per-recipe, drives scaling, has is_primary). `ingredients.culinary_role_id` = primary-capability pointer.
- **Rule library tables:** `food_families`, `food_family_members`, `family_transfer_rules` (red-meat seed: tender/moderate/tough; tender→tough = FORBIDDEN), `target_state_rules` (doneness °C), `method_rules`, `scaling_factor_rules` (FK to culinary_roles), `passive_transform_rules`, `nutrient_transform_rules`, `materialization_policies`, view `target_state_rules_current`.
- **Cycle guard:** trigger `check_no_lineage_cycle()` on `ingredients.transformed_from_id`.
- Build/verify/teardown scripts: `stage1_build.sql`, `stage1_verify.sql`, `stage1_teardown.sql` (idempotent, tested).

### Roles assigned to ingredients (3 batches, all run)
`assign_obvious_roles.sql` + `assign_obvious_roles_batch2.sql` + `assign_obvious_roles_batch3.sql`. Uncontroversial assignments only (salt→salt, goraka→acid, tiger nut flour→starch+bulk, egg→protein+binder, etc.). Batch 2 added a CATEGORY FALLBACK (meat→protein, dairy→fat, etc.). After all 3, essentially every non-product ingredient has a role; only 4 intentional skips remain (Dr. Oetker product, Ice cube=state, drink, pizza). Debatable/multi-role nuances LEFT for chef-vocabulary review.

### Content map feature — LIVE
- Route: `src/app/api/my/recipes/[id]/map/route.ts` (read-only, auth-scoped, nested select).
- Page: `src/app/my/recipes/[id]/map/page.tsx` (SVG graph: ingredients → components grouped by step group_label → finished dish, coloured by evidence; legend at TOP).
- Visit `/my/recipes/<canonical-id>/map`. Working on real recipes (Tiger Nut Pittu, Vindaloo).

## CRITICAL LESSONS FROM THIS SESSION (read before debugging)
1. **Supabase RLS + GRANTS on new tables:** EVERY new table starts with RLS on + NO policy + NO grant to anon/authenticated → INVISIBLE to the app (visible to postgres in SQL editor). Symptom: data exists in SQL editor but API returns []/empty. FIX both halves: `create policy "..." on T for select using(true);` AND `grant select on T to anon, authenticated;`. This bit us TWICE (nutrition backfill, then ingredient_roles). `stage1_grants.sql` applies this to all remaining Stage 1 tables (RUN IT before building any view that reads them).
2. **Supabase nested relations return as ARRAY or object** — handle both: `const x = Array.isArray(r.rel) ? r.rel[0] : r.rel;`. Build id lists from FLAT FK columns (e.g. `version_ingredients.ingredient_id`), not nested (`vi.ingredients?.id`).
3. **Next.js file extensions:** `route` files = `.ts` (API, no JSX); `page`/component files = `.tsx` (JSX). During flat-file extract/rename these got SWAPPED and the contents swapped too — caused build failures. VERIFY first line after placing (route → `import {NextRequest...}`; page → `'use client'`).
4. **PowerShell `[id]` brackets** are globs — `git add ".../[id]/..."` matches nothing. Use `git add -A` (but beware it sweeps stray files) or `git add ':(literal)path'`.
5. **`git rm` of "stray" files:** the real My Recipes list page IS `src/app/my/recipes/page.tsx` — do NOT delete it. (It got wrongly deleted once via "Remove stray empty page.tsx" and 404'd /my/recipes; restored via `git checkout <commit>~1 -- path`.)

## Ingredient dedup — DONE + reusable tooling
`merge_ingredient(survivor, orphan, dry_run)` function installed in DB — re-points ALL 10 FK tables (version_ingredients, version_step_ingredients, recipe_ingredients, step_ingredient_refs, ingredient_roles, ingredient_translations, food_family_members, inventory_items, ingredients.transformed_from_id, ingredients.parent_id) then deletes orphan; skips would-be-dup roles/translations/family rows. Files: `dedup_merge.sql` (function), `dedup_run.sql` (dry-run + commented real run). Merged: Turmeric (was misspelled "Turemic", 24 refs), arugula, mango, ice cube, Dr. Oetker. No duplicates remain.
- **ROOT CAUSE flagged (not yet fixed):** recipe-save find-or-create ingredient matches case-sensitively → regenerates dupes ("Turmeric" vs "turmeric"). Make it `ilike`+trim to stop dupe regeneration.

## My Profile page — BUILT (slice 1 of People & Groups)
Files: `src/app/api/my/profile/route.ts` (GET/PUT upsert, auth-scoped, assumes `user_profiles.id = auth user id`) + `src/app/my/profile/page.tsx` (view/edit form: name, units, skill, language, chip inputs for allergies/restrictions/cuisines). Visit `/my/profile`. **NOTE:** user wants this REFRAMED per the People & Groups design (sections, dropdowns, wizards) — it's the eventual "Basic section". May or may not be pushed as-is.

## People & Groups — DESIGN v0.1 (NOT built; next big effort)
Doc: `People_And_Groups_Design_v0.1.docx`. CORE DECISION: **person ≠ account**. Three-concept spine:
- `person` = an eater (holds all profile data; may have no login)
- `account` = a login (existing auth user)
- `person_access` = (account, person, access_level [owner/read_write/read_only/scoped], role [self/parent/caregiver/nurse/trainer/friend/restaurant/delivery], granted_by, granted_at, revoked_at, scope)
This one mechanism delivers: sharing, managed minors (parent owns child, later "breaks out"), delegated professional access (nurse/trainer/nutritionist), restaurant/delivery adapting to needs.
Profile = SECTIONS (each own table, own input style): Account, Basic (language=DROPDOWN), Cooking ability, Nutrition (store BIRTHDAY not age), Taste (wizard later), Lifestyle/meal-context (NEW table, gathered at meal-plan activation), Health log (NEW append-only time-series: weight/blood glucose etc).
CROSS-CUTTING: (a) hard boundary between SHARED catalog data (recipes/ingredients/Food Model = global) and PERSONAL data (person/profiles/health = residency-scoped) so China hosting follows the seam; (b) consent + audit on every access grant (GDPR/CCPA/PIPL).
Existing tables to reuse/re-point: `user_profiles`, `household_members`, `nutrition_profiles` (has both user_id AND household_member_id), `flavor_preferences`, `sensory_profiles` (note: sensory_profiles is for INGREDIENTS/recipes — entity_type+entity_id — NOT people; part of Food Model).
PHASED PLAN: Phase 0 = person + person_access spine (careful MIGRATION, re-point existing profile tables; dry-run discipline like dedup) → 1 sectioned shell+Basic → 2 household as persons → 3 nutrition+cooking → 4 taste → 5 sharing/delegation → 6 lifestyle → 7 health log.

## Enums confirmed this session
- `unit_system`: si, imperial, us
- `user_profiles.skill_level` uses `difficulty_level`: trivial, easy, medium, hard, expert
- `user_profiles` columns: id, display_name, unit_system, language, skill_level, allergies[], dietary_restrictions[], preferred_cuisines[], created_at, updated_at (NO user_id → id = auth user id)
- 10 tables FK to `ingredients` (see dedup section)

## OPEN THREADS / NEXT
- Chef-vocabulary review BEFORE scaling role content (settle the 39 roles; spice-blend decomposition; context-dependent veg roles).
- Fix miscategorized `other` ingredients (real fix behind batch-3 band-aid) → then category fallback handles them.
- Fix case-sensitive ingredient find-or-create (stops dupe regeneration).
- Reclassify "Ice cube" as state not ingredient.
- Red-meat `food_family_members` still empty (cut names don't match real ingredient rows yet).
- Decide & build People & Groups Phase 0 (person/person_access spine) — the next big foundational step.


# SESSION UPDATE — 2026-06-02 (People & Groups BUILT; Sharing designed; RLS lessons)

## People & Groups — NOW BUILT & LIVE (Phases 0–2 + household + avatars)
The `person ≠ account` spine is built, on production, and working. What's live:

- **Spine:** `person` (eater), `account` (auth.users), `person_access` (the grant). Auto-provision of a self-person on signup via `handle_new_user` trigger. Helpers `accessible_person_ids(acc)`, `owned_person_ids(acc)`, `provision_self_person(acc)` — all SECURITY DEFINER.
- **Sectioned profile** at `/my/profile`: Overview + summary panels (Google-style). Sections: Personal info, Cooking skills, Health profile, Taste profile, Eating habits, Account. Left-rail desktop / top-tab-strip mobile.
- **Tables built this arc:** `health_profile` (per-person: height/weight/sex_at_birth/activity/allergies[]/medical_conditions[]/notes), `cooking_competency` (per-person, area + level 0–3, unique(person_id,area)). Added `person.full_name`, `person.country`, `person.date_of_birth` (store DOB not age), `person.avatar_color`.
- **Health** = single source of truth for allergies (Taste shows them read-only). BMI computed. Allergies = EU-14 toggle buttons + other; conditions = curated buttons.
- **Taste** backed by existing `flavor_preferences` (keyed to user_id): 4 single-dimension 4-point scales (spice/sweet/sour/bitter).
- **Household / People** at `/my/people` + `/api/my/people`: a "household member" is just a person you OWN (access_level=owner, role=parent, full scope). Add/edit/remove managed persons (name, full name, DOB, allergies, conditions, avatar colour). Old `household_members` table had 0 rows → no migration; left unused.
- **Avatars (Build C):** shared `<Avatar id name colorKey size muted />` + `<AvatarColorPicker>` at `src/components/people/Avatar.tsx`. Monogram on coloured disc; colour resolves explicit palette key → deterministic-from-id. `avatar_color` stores the palette KEY (e.g. 'olive'), NOT hex — retune palette values in Avatar.tsx once and all avatars update. `muted` prop for header (deferred); picker only in edit forms.
- **API routes:** `/api/my/profile`, `/api/my/health`, `/api/my/cooking`, `/api/my/taste`, `/api/my/people` (GET/POST/PUT/DELETE).
- **User must still** add a `/my/people` nav link to live Sidebar.tsx/MobileNav.tsx manually (Claude's Sidebar snapshot is stale; not shipped to avoid clobbering live nav).

## ⚠️ RLS LESSONS — READ BEFORE TOUCHING POLICIES (cost ~2h this session)
The People tables sit behind RLS + GRANTS + column-level grants + function-execute. A misconfig in ANY of these reports as the SAME misleading error: `42501 / "new row violates row-level security policy"`. Hard-won rules:

1. **Scope app-facing policies to `public`, NOT `to authenticated`.** On this DB the `authenticated` role does NOT resolve in policies — a `to authenticated` policy silently never matches. All working policies are `to public` with `auth.uid()` conditions doing the enforcement. (SELECT/UPDATE worked early because they were public; every new-row INSERT failed because its policy was authenticated-scoped.)
2. **`INSERT ... RETURNING` + a SELECT policy that depends on a separate grant table = 42501.** After insert, RETURNING applies the SELECT policy to the new row; a brand-new `person` has no `person_access` grant yet → fails SELECT-back → 42501 (looks like an INSERT failure but isn't). FIX: bootstrap clause on the SELECT policy: `OR NOT EXISTS (SELECT 1 FROM person_access WHERE person_id = <table>.id)`. Applied to `person_select` and `hp_write` with-check. (`cc_write` lacks it — fine today since cooking is only written for already-granted persons, but add it if that changes.)
3. **Column-level grants:** these tables have per-column grants, so a plain `grant insert on T` is ignored unless EVERY column is granted. Re-run `grant all on <table> to authenticated` after ANY `alter table ... add column`. (This is why avatar_color's migration re-grants.)
4. **`uuid_generate_v4()` default needs EXECUTE for `authenticated`.** Missing it = 42501 at insert (the id default can't run). Granted now. For NEW tables prefer `gen_random_uuid()` (built-in, no grant) to avoid this.
5. **DELETE needs its own policy.** We initially had only insert/select/update; delete silently failed until `person_delete`/`pa_delete`/`hp_delete` were added (all public-scoped, owner-gated).
6. Debugging technique that finally cracked it: a temp `/api/my/debug` route + `debug_whoami()` returning `current_user` / `auth.uid()` / raw insert error code, plus testing `insert WITHOUT returning` vs `WITH returning` to isolate that it was the SELECT-back, not the insert. (Both since removed.)

## Live DB changes made this session that are NOW in schema.sql
Reconciled into the canonical People & Groups block (see `schema_people_and_groups.sql`):
`person.avatar_color` column; `person_select` bootstrap clause; all policies re-scoped to `public`; `person_delete`/`pa_delete`/`hp_delete` policies; `hp_write` bootstrap clause; execute grants on uuid_generate_v4 + the 3 helpers; `grant all` on the 4 tables. **schema.sql now matches production for these tables.**

## Sharing & Delegation — DESIGN v0.2 (NOT built; the next big effort)
Doc: `Soupdog_Sharing_And_Delegation_Design_v0.2.docx`. Builds on the person/person_access spine. Key content:
- **One mechanism, four scenarios:** dinner guest / aging parent / nutritionist-trainer / restaurant-airline = one `person_access` grant with different role+access_level+scope presets.
- **Two new concepts:** `connection` (contacts layer so a grant can name a real counterparty) and `visibility tiers` (per-section standing defaults: private/connections/public, composed with explicit grants via a 3-step resolution rule: owner → grant → tier).
- **Transports (§3.6):** ONE invitation token, four renderers (link / QR / email / short code). Two directions: show-my-code (user→user) vs scan-their-code (venue→user, reversed grant). **Scan always confirms (WeChat pattern)**; venue auto-accept only skips the venue's own staff tap, never the guest's. Token lifetime differs by direction (access-granting = short/single-use; venue-request = durable/public).
- **Events / e-card RSVP (§4):** host creates event, guests RSVP + share profile OR fill a form; host sees AGGREGATED dietary view. This is the **onboarding funnel** (guest fills allergies once → lightweight person → claim account) and the **consumer→commercial seam** (catering/weddings/conferences = same feature bigger). Sits ON TOP of sharing; built after the foundation.
- **New objects (design):** `connection`, `invitation_token`, `event`, `section_visibility`, append-only `access_audit`, and `person_access.expires_at` (recommended for time-boxed shares).
- **Phased plan:** 0 contacts → 1 friend read-only shares (+transports) → 2 visibility tiers → 3 delegation → 4 events → 5 consent/audit hardening → 6 org/venue → 7 minor-breakout. (Cross-residency deferred.)
- **§8 has 12 OPEN DECISIONS** to settle before building (connection model, per-section vs per-field, expiry mechanism, scan-confirm rule, token lifetime, event first-class, host-sees-aggregate, commercial boundary, minor-breakout trigger, org accounts, cross-residency). **Settle these before Phase 0.**
- **When building:** bake in the §6 RLS patterns from line one (public-scoped policies, bootstrap SELECT clause, delete policies, gen_random_uuid, re-grant on new columns).

## OPEN THREADS / NEXT (updated)
- **Next big build:** Sharing & Delegation Phase 0 (contacts) — but FIRST settle the §8 open decisions.
- **Usage tracking (original Priority 1):** still untouched; foundation for membership tiers/billing; gets harder to retrofit with each feature. Strong candidate if commercialization nears.
- Carried over from prior session: case-sensitive ingredient find-or-create (dupe regeneration); chef-vocabulary role review; "Ice cube" reclassify; red-meat food_family_members empty.
- Optional polish: muted self-avatar in header (needs live Sidebar); add avatar+picker to /my/profile so self-avatar is editable.


# SESSION UPDATE — 2026-06-02 (Usage tracking BUILT; meter + pricing; monetization designed)

## Usage tracking — NOW BUILT, LIVE & VERIFIED (original Priority 1, done)
Every AI call in the app is now logged. This is the foundation for tiers/billing.

- **Table `ai_usage_log`** (live, verified): id (gen_random_uuid), account_id (nullable — null for system/cron calls), person_id, created_at, model, feature, input_tokens, output_tokens, success, error. Append-only. Public-scoped RLS: users SELECT their own rows (`account_id = auth.uid()`); INSERT allowed when `account_id is null OR = auth.uid()`. Indexes on (account_id, created_at desc) and (feature, created_at desc). SQL: `usage_01_table.sql`.
- **Single wrapper `src/lib/ai/anthropic.ts`** — ALL Anthropic calls route through this; it's the enforcement point for quota limits later. Calls use raw `fetch` (not the SDK). Exposes:
  - `aiMessage({model,feature,accountId,personId?,system?,messages,max_tokens})` — non-streaming; returns `{ok,status,data?,errorText?}`; logs usage from `data.usage`.
  - `aiStreamStart({...})` + `makeUsageCollector({model,feature,accountId,personId?})` — streaming; caller pipes `res` as before and feeds each parsed SSE event to `collector.observe(event)` (pulls usage from `message_start` + `message_delta`), then `collector.finish(success, error?)` once at stream end. Logs exactly once.
  - `logAiUsage({accountId, db?, ...})` — fire-and-forget insert; swallows its own errors so logging can NEVER break an AI response. Accepts an OPTIONAL `db` client for background/service contexts (see nutrition note).
  - `AiFeature` type + feature labels in use: `import_parse | chat_question | chat_modify | nutrition_estimate | nutrition_backfill`.
- **Instrumented & verified live (token counts confirmed in ai_usage_log):**
  - `src/app/api/recipes/import/route.ts` → `aiMessage`, feature `import_parse` (verified: Sonnet, ~1240 in / 2240 out).
  - `src/app/api/recipes/import/chat/route.ts` → `aiStreamStart` + collector; `chat_question` (Haiku) / `chat_modify` (Sonnet) by the existing `looksLikeQuestion` routing. Streaming UX to client UNCHANGED — collector just observes alongside the existing parse loop.
  - `src/app/api/my/recipes/route.ts` and `src/app/api/my/recipes/[id]/route.ts` → `estimateNutrition(name, accountId, db)` now logs `nutrition_estimate` per new ingredient (verified: 5 rows, Haiku ~89 in / 47–81 out). Runs in BACKGROUND `after()` context, so it logs via the `db` client it's handed (a fresh server client there wouldn't carry the session) — this is why `logAiUsage` takes optional `db`. Call sites: `after(() => backfillNutrition(db, user.id, createdIngredients))`.
  - `src/app/api/admin/backfill-nutrition/route.ts` → logs ONE `nutrition_backfill` row per batch, `account_id: null` (service-role/BYPASSRLS client; the insert policy allows null). Verified: Haiku 124 in / 51 out.

### KEY LESSON — logging is independent of the route's own success
The backfill threw a 500 ("Failed to parse nutrition JSON") during testing — but a `nutrition_backfill` row STILL landed, because usage is logged right after `res.json()`, BEFORE the route's own parse step. Good: instrumentation captures the call regardless of downstream route logic. (The 500 itself was pre-existing parse fragility, triggered by gibberish test ingredients — see backlog.)

### Testing notes
- `nutrition_estimate` fires on saving a recipe with a NEW (not-yet-in-DB) ingredient; logs a moment AFTER the save returns (background). Test recipe = nonsense ingredient names (e.g. "purple moon carrot") to force new rows.
- `nutrition_backfill` only calls the API (and logs) if there are ingredients with null nutrition; otherwise returns "all done" and logs nothing.
- In the Supabase SQL editor you are role `postgres`, so `auth.uid()` is null there — a `where account_id = auth.uid()` query returns 0 rows even when data exists. Verify via the app, or query without the auth.uid() filter.

## Usage meter — `/my/usage` BUILT & LIVE (read-only)
- Route `src/app/api/my/usage/route.ts` (GET): sums this CALENDAR MONTH's successful calls per feature for `auth.uid()`, converts to placeholder credits, returns `{plan, allowance, used, remaining, percentUsed, daysUntilReset, resetDate, breakdown[], isPlaceholder}`.
- Page `src/app/my/usage/page.tsx`: `'use client'`, uses `useAuth()`. Shows current plan (placeholder "Plus"), a meter bar (olive accent), plain-language fill ("about a third"), per-feature breakdown in OUTCOME words ("Recipe imports — 1 time", "Nutrition lookups — 5 times"), and Change plan / Get more buttons → `/pricing`. Verified live showing real test usage.
- **Placeholder credit costs (in the route, `CREDITS_PER_FEATURE`):** import_parse 2 · chat_modify 3 · chat_question 1 · nutrition_estimate 1 · nutrition_backfill 1. **Placeholder allowance:** 400 credits/mo (`PLACEHOLDER_ALLOWANCE`). 1 credit ≈ $0.02 cost (rough). NO plan column yet — allowance hardcoded. NO enforcement.
- **User must still** add a `/my/usage` nav link to the live Sidebar manually (stale snapshot; not shipped).

## Pricing page — `/pricing` BUILT & LIVE
- `src/app/pricing/page.tsx`, `'use client'`. Works in BOTH layouts via RootShell (logged-out = marketing shell, logged-in = app shell).
- Three tiers framed by OUTCOME — **AI is NEVER mentioned** (deliberate: AI is invisible plumbing, "like bragging about electric lights 100 years ago"). Free / **Plus £8/mo** (most-popular, accented) / **Family £20/mo**. Monthly/annual toggle (annual ≈ 2 months free: Plus £7, Family £17 effective). Prices in `PRICES` constant — PLACEHOLDERS.
- Current-plan awareness built in (shows "Your current plan" instead of upgrade once a `plan` column exists; everyone reads Free now).
- **Ad-free intentionally NOT listed** — ads aren't live; add that feature line only when ads ship (advertising the absence of non-existent ads is confusing).
- Button destinations: logged-out → `/signup?plan=...` (exists); logged-in → `/checkout?plan=...` (DOES NOT EXIST yet — Stripe step; will 404 until built — expected interim state).
- **User must still** add a "Pricing" nav link to MarketingHeader/sidebar (not shipped — stale snapshot).

## MONETIZATION DESIGN DECISIONS (this session — settle/honour before building billing)
- **AI is invisible plumbing, NOT a selling point.** Never say "AI"/"credits"/"tokens" in user-facing copy. Frame everything by outcome (meal planning, cooking help). The meter shows plain-language counts; credit math stays server-side.
- **Display unit internally = CREDITS** (not tokens to users; not "actions" since per-call cost varies). Placeholder 1 credit ≈ $0.02 cost.
- **Real AI costs (searched May 2026):** Sonnet 4.6 $3/$15 per M (in/out); Haiku 4.5 $1/$5. Measured import ≈ $0.037. Levers: prompt caching (90% off cached input — your big system prompts are prime candidates), batch API (50% off — for backfill). Meal planning is the BIG UNKNOWN cost (~$0.10–0.30/session est.), measure once built.
- **Tier principle:** price each paid tier ≈ its worst-case AI cost; profit = gap between worst-case and typical use. Free ≈ 30 credits/mo (no meal planning); Plus £8 ≈ 400 credits (meal planning — the core paid tier); Family £20 ≈ 1200 credits (multi-person — ties top tier to the person-model moat). ALL PLACEHOLDER — set from real meter data before charging.
- **Enforcement model (when built):** check balance BEFORE the AI call (in the wrapper — the single gate), never fail mid-action; pre-flight estimate then post-flight settle; degrade gracefully (non-AI product keeps working); 3 exits (wait for reset / top-up / upgrade). Balance starts DERIVED (allowance − period usage), moves to explicit `credit_ledger` when top-ups are added.
- **ADS:** free tier ad-supported, paid ad-free — BUT sell paid membership from day one on real value (meal planning), and do NOT mention "ad-free" until ads actually ship. Ads come LATER (no audience yet = monetizes zero). Plan: start with a small-site network (AdSense) once free traffic justifies, scale to higher-paying networks later. RESTRAINT principle: small bounded labeled slots only — never wreck the calm cookbook aesthetic (no interstitials, no mid-recipe injection). The spec explicitly avoids "ad-heavy recipe-blog" look — honour that.
- **Stripe** = the payment processor to integrate when actually charging (handles cards + recurring subs + tells the app who's paid). Alternatives Paddle/Lemon Squeezy also handle international VAT (simpler for a solo founder). Separate integration project; needs a `plan` column + webhooks + the credit-ledger migration for top-ups.

## Mockups shown this session (design feel, not built)
Pricing page, contextual upgrade prompt (appears at the moment of value, e.g. tapping meal planning — sells the feature, not a subscription), and plan & billing settings (ambient usage meter, 3 exits). The real `/pricing` page above is the pricing mock turned into a route.

## OPEN THREADS / NEXT (updated)
- **#2 Watch real numbers (not a build):** use the `/my/usage` meter over time; replace placeholder credit costs + allowance + prices with real figures BEFORE charging. Especially meal planning's cost once it exists.
- **#3 Enforcement + Stripe (the real next billing build, when closer to charging):** `plan` column; Stripe (or Paddle/Lemon Squeezy) checkout + webhooks; `credit_ledger` migration; balance check in the wrapper (`src/lib/ai/anthropic.ts` — the single gate); build `/checkout` (pricing's logged-in buttons 404 until then). Big, multi-session, launch-time work.
- **HIGHEST-LEVERAGE PRODUCT BUILD: meal planning.** It's the headline paid feature in pricing but DOESN'T EXIST. Building it (a) makes the paid tier real, (b) finally lets the meter measure its AI cost — the biggest gap in the pricing math. Strong candidate for next real feature work.
- **Sharing & Delegation Phase 0 (contacts)** — still pending; FIRST settle the v0.2 §8 open decisions.
- **Nav links the user must add manually** (stale Sidebar snapshots, not shipped): `/my/people`, `/my/usage`, and a "Pricing" link.
- **Backlog carried over:** backfill route JSON-parse fragility (one bad/gibberish item sinks the whole batch — harden to parse per-item & skip failures); case-sensitive ingredient find-or-create dupe regeneration (now uses `ilike` in recipe routes — partially addressed); chef-vocabulary role review; "Ice cube" reclassify; red-meat food_family_members empty; muted self-avatar in header; add avatar+picker to /my/profile.
- **Test cleanup:** if not already done, delete the 5 nonsense test ingredients (purple moon carrot, blarffle root, snorgle leaf, quibbling broth, zindle spice) + the "Xyzzy Test Stew" recipe, so they stop tripping the backfill batch. Delete version_ingredients refs first (FK), then ingredients.
