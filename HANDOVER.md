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


# SESSION UPDATE — 2026-06-02 (Meal Planning BUILT end-to-end; Time model; Home flipped to the plan; Plan Architecture design)

## MEAL PLANNING — NOW BUILT, LIVE & ON THE HOME (was the #1 highest-leverage gap)
The headline paid feature now exists, works end-to-end, and is the logged-in home page. Built on the person/person_access spine — meal planning is "the person model applied to food."

### Core model decisions (LOCKED)
- **Plan is PER-PERSON**, not per-household. Each person has their own plan (their intention of what to eat).
- **A meal/event is a SHARED object** referenced by many plans. **Participation is a per-person link with `status`** (accepted/proposed/invited/declined) + who-placed-it/when.
- **Access drives participation status** via the existing `person_access` spine: owner/delegated → meal `accepted`; suggest → `proposed`; none → `invited` (guest). v1 ONLY exercises the **owner-placed → accepted** path (you plan for yourself + people you own). Proposals/delegation/guests are schema-ready, NOT built.
- **Actuals** (what was really eaten) is a separate per-person timeline — NOT built yet, but the design separates intention (plan) from reality (actuals).
- **Co-owner removal governance** (e.g. both parents own a child): DEFERRED. Lean = you can remove yourself, removing another owner needs consent. `person_access` already records granted_by/granted_at/revoked_at to support whatever's built later.

### Schema (mealplan_01_schema.sql + later migrations, all LIVE)
- **meal** — the shared event: id (gen_random_uuid), created_by, owner_person_id→person, meal_date, slot (enum), source (enum), recipe_id→recipe_canonicals, dish_name, note, **scheduled_time (time)**, timestamps.
- **meal_participant** — meal_id, person_id, status (participation_status enum), placed_by, placed_at; unique(meal_id,person_id).
- **person_meal_prefs** — person_id PK, plan_active, active_slots (meal_slot[]), horizon_days (default 5), activated_at, **slot_times (jsonb)** for habitual meal times.
- **media** — recipe_id XOR step_id, type/role/url. Future-proof (dish-page images later); EMPTY in v1.
- Enums: `meal_slot` (breakfast/lunch/dinner/snack/**meal**), `participation_status`, `meal_source`, `media_type`, `media_role`.
- RLS: ALL public-scoped using `accessible_person_ids(auth.uid())`/`owned_person_ids(auth.uid())` — both confirmed **SETOF uuid**, so policies use `X in (select fn(auth.uid()))` (matches existing People policies). gen_random_uuid defaults; re-grant after adding columns.

### API routes (all under src/app/api/my/meal-plan/)
- `route.ts` — **GET** the plan (meals + participants + recipe title/cuisine/time/servings + scheduledTime) for ?from&to. **THIS IS THE READ ROUTE — has GET only.**
- `prefs/route.ts` — GET/PUT activation (plan_active, active_slots, horizon).
- `generate/route.ts` — POST: fills empty (date,slot) cells in the horizon by SELECTING & ARRANGING existing recipes (variety, avoids household allergens, slot-appropriate), stamps scheduled_time from habits, owner-placed accepted participation. Logs feature `meal_plan`. Robust JSON parse (raw→fence-stripped→first {...}); max_tokens 4000.
- `meal/route.ts` — POST add / PATCH swap / DELETE remove a meal. Stamps scheduled_time on add. **Has POST/PATCH/DELETE, NO GET.**
- `participant/route.ts` — POST/DELETE add/remove a person you OWN on a meal.
- `options/route.ts` — GET recipe list for the swap/add picker (?q filter).
- `household/route.ts` — GET people you own (for the avatar "+" picker).
- `habits/route.ts` — GET/PUT habitual meal times (slot_times). Override-capable shape (see Time model).
- ⚠️ **FILE-PLACEMENT HAZARD:** these are many `route.ts` files differing only by folder. Mis-placing the meal-mutation route OVER the read route caused a 405 (GET missing) once. ALWAYS verify each route file's first-line path comment matches its folder.

### UI — the menu (src/components/plan/PlanView.tsx)
- **PlanView** is the shared menu component (extracted from the old /plan page). Rendered by BOTH `/plan` (thin wrapper `src/app/plan/page.tsx`) AND the logged-in home.
- Three states: **no-plan** (activation card → pick meals → optional "Adjust meal times" fine-tune → Start) / **active day view** (today's meals, serif dish-name link, cuisine·time·serves, participant avatars, Swap/Remove) / **active week view** (rolling horizon, compact, dish-name links + swap icon + × remove).
- **Avatars = the who's-eating control:** tap an avatar → popover (name + "Remove from this meal"); dashed "+" → add a household member you own. NOT tap-to-instantly-remove.
- **"+ Add a meal"** always available → pick slot (incl. generic "Meal") → recipe picker.
- Both day & week views **sort by scheduled_time** (byTime comparator): timed meals in time order, snack/generic (no habitual time) last, slot order as tiebreaker. Day-view slot SECTIONS also order by time.
- Activation fine-tune: optional, collapsed by default (fast path = defaults 07:30/12:30/19:00); only offers time inputs for the named meals the user selected; saves via habits API before first generate.

### TIME MODEL (LOCKED + LIVE) — "help people cook on time"
- Each meal has `scheduled_time`; **time drives ordering**, not slot or an order-number.
- Times **derived from habits**, NOT shown in the menu and NOT asked at activation by default (fast path). Defaults 07:30/12:30/19:00.
- `src/lib/meal-times.ts` — `timeForSlot(slot, isoDate, slotTimes)` resolver. Named slots get a time; **snack/generic 'meal' get null → sort after the last meal**.
- **slot_times shape is OVERRIDE-CAPABLE (built, only `default` populated):**
  `{ default:{breakfast,lunch,dinner}, rest_days:[...], overrides:{...} }`. Rest-day variation is honoured by the resolver but NO UI sets it. **rest_days is USER-DEFINED — never hard-code Sat/Sun** (Friday-Sabbath, 6-day weeks, shift work, etc.).
- **Labels are DESCRIPTIVE not prescriptive:** a lunch at 06:00 sorts before a 09:00 breakfast — allowed (timezone travel/shift work). VERIFIED live (Spaghetti Carbonara lunch @06:00 rendered above breakfast).
- **Times are FROZEN at meal creation.** Editing habits later only affects NEW meals, not existing ones. (Open question for Profile habits editing: should editing a habit re-time existing planned meals? Currently no.)
- Generic "Meal" slot: for multi-meal-a-day eaters (bodybuilder 6×/day). Available on manual add; generator NEVER defaults to it. Sorts by its time (default 15:00 if none).

### HOME FLIPPED TO THE PLAN (Piece B) — src/components/home/LoggedInHome.tsx
- Logged-in home now = search box (plain, kept) → **PlanView (the meal plan IS the home)** → **"Improve your plan"** section (4 benefit-led cards, NO % meter): Set your tastes→/my/profile, Add health details→/my/profile, Add your household→/my/people, Set your meal times→/plan.
- REMOVED the old "Featured recipes" table and the dead "Meal Planner — Phase 3" placeholder (it pointed at non-existent /my/planner).
- HomeClient.tsx already split LoggedInHome/LoggedOutHome by auth — LoggedOutHome UNTOUCHED.
- NOTE: health & taste are SECTIONS inside the sectioned `/my/profile`, NOT standalone pages (`/my/health`,`/my/taste` do NOT exist) — cards link to /my/profile.

### NAV LINKS ADDED (finally) — src/components/layout/Sidebar.tsx + MobileNav.tsx
- Sidebar "My Kitchen": **Plan** (top, CalendarDays icon) · My Recipes · Ingredients · **People** (/my/people) · **Usage** (/my/usage). "About": **Pricing** (/pricing) · About · Help.
- MobileNav: replaced the "Favorites" tab with **Plan** (still 5 tabs).
- Labels use `t('nav.X')` WITH English fallback (t() returns the key path when missing; we detect that and show the English word). **TODO: add nav keys to messages/{locale}.json** (en/sv/zh/ar): plan, people, usage, pricing. Until then labels are English-only.

## USAGE TRACKING — meal_plan now logged
`meal_plan` added to `AiFeature` in `src/lib/ai/anthropic.ts`. Generation logs it. **Cost-measurement loop still OPEN:** real `meal_plan` rows now exist in ai_usage_log — analysing them (the biggest unknown in the pricing math) is a pending non-build task.

## NEW DESIGN DOC (this session)
`Soupdog_Plan_Architecture_Groups_And_Schedule_Types_v0.1.docx` — how the consumer plan generalises to commercial (canteen/airline/restaurant/room-service/fast-food/nutritionist/elderly-care). Key concepts: **Offering vs Plan** two layers; recombinable **axes** (who/grouping/when/what/how-much); **Group** generalises the unit-of-planning (household = one group type; table/flight/route/client are others); **Schedule type** generalises "when" (calendar/service/sitting-course/journey/on-demand — the time model is the *calendar* type). DISCIPLINE: don't build the abstraction yet; name seams so it isn't precluded (plan belongs to a person OR eventually a group; meal is a set of *components*).

## OPEN THREADS / NEXT (updated — supersedes earlier "meal planning doesn't exist")
- **#3 Meals = composed DISHES + DRINKS (+ a MEAL EDITOR).** SHARPEST next feature: today it's a *dish* planner (one recipe per meal). Evolve `meal` to hold multiple **components** (main/side/drink; each optionally a recipe; type field). Build a **meal editor** (user-composes, like the dish editor) — AI assists, not the only path. Design the "components" shape generally so it serves commercial later. Drinks ride on this (a drink = a component, type=drink, recipe optional).
- **#2 Plan-switcher (manage others' plans).** Mostly UI on the existing spine: pick whose plan you're viewing/editing (kids, the dog, eventually nutritionist clients); pin favourites to home. Consumer-scale stepping stone to Groups. Lower effort.
- **Conversational/"smarter" search box (PARKED, well-specified).** The central home search box becomes a box you can TALK to: free = plain search, paying members = conversational ("a quick veg dinner for tonight"), NEVER labelled "AI" (outcome-framed), COST-GATED (needs the quota gate — chat invites many calls), and it doubles as an entry point to the planner (propose a dish → add to plan). Its own slice; ideally after enforcement gate.
- **Drag-to-reorder** meals (rewrites scheduled_time; dinner-before-breakfast allowed). UNBLOCKED now that meals have times. Needs DnD (touch-friendly for kitchen/tablet). Own slice.
- **Profile habits editing** — change habitual times AFTER activation (the "home" of that data; activation only sets it once). Decide: should editing re-time existing meals?
- **Rest-day overrides UI** — data model ready (slot_times.rest_days/overrides); no UI. User-defined rest days, never hard-coded.
- **#5 Groups / B2B** — see the new design doc. Build when a real B2B need is concrete; validate consumer first.
- **Cost measurement** — analyse real `meal_plan` usage in ai_usage_log; replace placeholder credit costs before charging.
- **i18n nav keys** — add plan/people/usage/pricing to messages/{locale}.json (currently English fallback only).
- **Enforcement + Stripe** — unchanged; launch-time billing work.
- **Test-data hygiene:** test meals accumulated on "today" during debugging; `cleanup_test_meals.sql` pattern (keep one per slot, or delete today's & regenerate) clears them.

## KEY LESSONS REINFORCED THIS SESSION
- **Verify the foundation before building on it** caught: the read-route 405 (file misplacement), the "added meal invisible" bug (day view only rendered active slots — fixed to union of active + present slots), the generate 500 (truncated JSON — raised tokens + robust parse).
- **Flat-file `--`-to-folder delivery keeps biting on multi-`route.ts` drops.** Standard check: every delivered route/page file's FIRST-LINE path comment must match the folder it's placed in. Big-vs-tiny file swap (PlanView 28KB vs plan/page.tsx 6 lines) is an easy tell.
- **SETOF uuid helpers** → policies use `X in (select fn(auth.uid()))`. Confirmed via probe before writing meal RLS — no 42501 this time.



# SESSION UPDATE — 2026-06-04 (Demand Model Doc A · Phase 1 SHIPPED & VERIFIED)

## SHIPPED THIS ARC (on prod, verified in console)
Doc A (Demand Model v0.4) **Phase 1** is functionally complete: a real person's
needs now drive a real meal recommendation, with honest confidence throughout.
Builds directly on Phase 0 (person_nutrient_targets, shipped earlier same day).

Pipeline: **resolve → aggregate → score → plate.** Two pure lib modules + one
inspection route. NOTHING existing was modified — all new files.

### Files (all new)
- `src/lib/demand/resolve-requirement.ts` — the per-field CASCADE resolver.
  `resolveRequirement(db, personId)` reads person(date_of_birth),
  health_profile(sex_at_birth), person_nutrient_targets → returns each daily
  field (energy/protein/carbs/fat/fiber/sodium/satiety) as a ResolvedField
  {value, rung, source, confidence, deferred?}. KNOWN value wins (conf 0.9);
  else falls to the PERSONA floor (conf 0.3). overallConfidence = weakest
  non-deferred field. Exports inferPersona() + nutrientKind().
- `src/lib/demand/aggregate-and-match.ts` — occasion shares, table aggregation,
  scoring, plating. Key exports: occasionFraction, participantOccasionNeed,
  aggregateTable, scoreMeal, rankMeals, platingSplit.
- `src/app/api/my/meals/[id]/match/route.ts` — runs the whole pipeline for one
  meal. `GET /api/my/meals/{id}/match?slot=dinner`. Reads meal_participant
  (active only), falls back to caller's self-person if none. Returns
  { slot, meal, table, score, plating }. Read-only inspection route.

### Model = per-field fallback, NOT a persona ladder (important mental model)
Each field independently takes the best source it can find; the persona is the
FLOOR under whatever is still unknown — never "climbed and discarded." A user
with known fibre but unknown sodium gets known fibre (0.9) + persona sodium
(0.3) SIMULTANEOUSLY. The logged-out visitor is just "every field on the bottom
rung" — no separate anonymous path. Personas: toddler / child / adult_female /
adult_male / adult_unspecified. Age band selects the family (no "toddler male"),
sex narrows within adult. inferPersona(dob, sex).

### Decisions settled this arc
- **Aggregation = option C** (Doc A §11 "participant aggregation"):
  - ADDITIVE nutrients (energy, protein, carbs, fat, fibre) → SUMMED across the
    table into tableTotals, then plated. (NUTRIENT_KIND map encodes this.)
  - SATIETY → per-person near-constraint (satietyFloor = max individual need),
    never summed.
  - CONSTRAINT nutrients (sodium, future ceilings) → carried but DEFERRED
    (deferred:true flag); NOT optimised in P1. Needs goals overlay (P5) +
    per-component plating (P4).
- **Occasion share = fixed per-slot fractions** (stand-in until day-tracking in
  P2): breakfast .25, lunch .35, dinner .40, snack .10, meal .33. Doc A §11
  "how occasion shares are set before we know the day."
- **Scoring** = scale dish to table's energy need → measure coverage per field
  (capped at 1, energy×2 / protein·fibre×1.5 weighting) → satiety as near-hard
  gate (energy coverage ≥0.85 or 0.5× penalty) → variant confidence nudges ties.
  A legible heuristic, NOT an optimiser; weights are [OPEN], tune with real data.
- **Plating** = whole-portion only (§7). Split by share of dominant need
  (default energy). Cook-friendly phrasing ("the larger, more generous helping"
  / "a neater, smaller portion") — encourage, never shame. Per-component
  ("more lentils") is Phase 4.

### Verified (console, logged in)
- `GET /api/my/requirement` → mixed result: fiber_g/protein_g rung:'known'
  conf 0.9 (set earlier), rest rung:'persona' conf 0.3. Per-field model proven.
- `GET /api/my/meals/{id}/match?slot=dinner` → returned
  { slot, meal, table, score, plating } correctly. Standalone math check (§7
  worked example, Rasmus 2500 / Natasha 2000) gave table totals summing right,
  3-serving scale of a 600kcal dish, plating 0.56/0.44 (Rasmus larger). Correct.
- NOTE: a meal with one resolved participant yields plating Array(1) (share 1.0)
  — multi-person split needs ≥2 active meal_participant rows.
- Gotcha (user-side, not a bug): first match call failed with "invalid input
  syntax for type uuid: YOUR_MEAL_ID" — placeholder not replaced. Get a real id
  from `GET /api/my/meal-plan` (returns { personId, from, to, meals[] }).

## [OPEN] PLACEHOLDERS CARRIED (settle before later phases lean on them)
- **Persona daily templates** in resolve-requirement.ts (PERSONAS map) — the
  kcal/protein/etc per persona are reasonable averages, NOT a clinical spec.
  Doc A §11 "Default daily template." Editable in one place.
- **Slot fractions** in aggregate-and-match.ts (SLOT_FRACTION) — provisional.
- **Scoring weights** — energy×2, protein/fibre×1.5, satiety gate at 0.85,
  quality blend 0.9/0.1. All heuristic; Doc A §11 "satiety/nutrition weighting."

## NEXT STEPS (pick one)
- **Surface the score in the meal UI** so users (not just the console) see the
  recommendation + plating. The match route is the data source; needs a
  component on the meal page. (Highest user-visible value.)
- **Multi-participant testing** — add a 2nd person to a meal to exercise the
  two-way plating split live.
- **Phase 2** — the ASK rung (host-opened popover, Doc A §4) + stated-habit
  segments + daily running balance. Raises confidence where it changes the
  answer; replaces the fixed-fraction occasion-share stand-in.
- Variant-level quality (execution_variants.confidence) into scoreMeal — the
  match route currently passes variantConfidence:null.

## STILL PARKED (unchanged)
Meal editor (basic+advanced); server-rendered PDF (Puppeteer); Doc B Phase 0
(content_request row on algorithmic fallback — note: no content_request table
exists yet, would be a first build). Settle remaining Doc A §11 / Doc B §11
[OPEN]s before building beyond Phase 1.


# BACKLOG ITEM — Editor: accept Excel (.xlsx/.xls) and Word (.docx) recipe uploads

**Why:** Some commercial kitchens keep recipes in Excel and Word, not PDF/images.
Currently the import page accepts PDF + images (JPG/PNG/WebP/GIF) + pasted text;
TXT is half-wired (UI allows it, route does not — see gotcha below).

**Scope:** add .docx and .xlsx (and .xls) to the recipe import flow.

**Key constraint — these are NOT native-document types for Claude.** PDF goes to
the API as a `document` block and images as `image` blocks. DOCX/XLSX cannot;
they must be TEXT-EXTRACTED server-side first, then sent through the existing
TEXT path of the import route. So this is an extraction step, not a new media
branch in the AI call.
- .docx → `mammoth` (npm) → plain text / lightweight HTML.
- .xlsx/.xls → SheetJS (`xlsx` npm) → CSV/text per sheet (recipes often live as
  rows: ingredient | qty | unit, plus a method block). May need a small
  heuristic or just hand the whole sheet text to Sonnet and let it parse.

**Files to touch:**
- `src/app/api/recipes/import/route.ts` — current logic only accepts
  `application/pdf` + `image/*` and REJECTS everything else (line ~104). Add a
  pre-step: if the incoming file is docx/xlsx, decode base64 → extract text →
  feed the existing `text` path (the route already parses pasted text well).
  Probably cleaner to extract in the route than the browser (keeps deps server-side).
- `src/app/my/recipes/import/page.tsx` — extend `allowed` (line ~156) and the
  input `accept` (line ~384) and the helper caption (line ~406, "JPG, PNG, WebP,
  PDF, TXT") to include Word/Excel. Keep the 20MB cap.

**Gotcha to fix while here:** TXT is inconsistent today — `accept` + `allowed`
include text/plain, but the route's `file && mediaType` branch rejects anything
non-PDF/image, so a dropped .txt file would 400. Pasted text works because it
uses the text path. Folding docx/xlsx through text extraction is a chance to
make the route handle "extractable file → text path" cleanly, TXT included.

**Deps:** `mammoth`, `xlsx` (SheetJS). Both pure-JS, Vercel-safe.

**Note:** UX language — user-facing copy says "Add recipe" not "import",
"upload your recipe file" not "parse". Keep that.

**Effort:** medium. The AI parsing is unchanged (reuses the text path); the work
is extraction + wiring + the accept-list/caption update + per-format testing.


# SESSION UPDATE — 2026-06-04/05 (Backlog clear-out: i18n, avatars, data-cleanup; two design notes)

A long session that cleared essentially the entire SMALL backlog and surfaced
two foundational design notes. Everything below is SHIPPED & verified unless
marked otherwise. What remains after this is all large/design-led (see end).

## SHIPPED — code (pushed to prod, builds green)
- **i18n nav keys** — added plan/people/usage/pricing (+ all referenced nav keys)
  to messages/{en,sv,zh,ar}.json. NOTE: messages/*.json are at REPO ROOT, not in
  src; layout.tsx imports en.json directly, so a malformed/missing one breaks the
  BUILD. (We hit this — a botched merge left a stray 2nd JSON object; fixed by
  restoring from commit 4787435.) zh/ar translations are reasonable but unverified
  by a native speaker.
- **Profile avatar editor** — /my/profile Personal info: live <Avatar> + colour
  picker (reuses AvatarColorPicker). avatar_color stores palette KEY not hex.
- **Header avatar** — Header.tsx now uses the shared <Avatar muted>, fetching the
  user's avatar_color/full_name/avatar_initials via /api/my/profile (was a local
  email-initial disc that ignored the chosen colour).
- **Two-letter initials + override** — shared Avatar now derives "NR" from full
  name (first+last word; single word → first 2 chars) via deriveInitials(); an
  optional `initials` prop overrides. New column person.avatar_initials (text,
  nullable; NULL = derive). Editable in the profile avatar modal. Header + profile
  use it; PlanView participant discs already show 2-letter via their own inline
  monogram() but do NOT yet read the override (small follow-up — thread
  avatar_initials through plan participants).
- **PlanView popover dismiss** — participant/add popovers now close on
  click-outside and Escape (ref + document listener, attached only while open).

## SHIPPED — data cleanup (live DB, all dry-run-first)
- **Backfill route hardened** — per-item JSON salvage so one bad Haiku item can't
  sink the whole batch; unrecoverable items get the UNESTIMABLE sentinel so the
  queue always drains. (admin/backfill-nutrition/route.ts)
- **Case-dupe audit → RESOLVED** — only one find-or-create path exists and it
  already uses ilike; zero existing case/whitespace dupes in data. (ilike doesn't
  catch whitespace/punctuation variants — deeper, out of scope.)
- **Red-meat family** — was empty. Marked generic Beef/Lamb/Pork is_category=true
  (they're groupings, not cuts); linked the 2 real cuts to bands (ground beef →
  redmeat_tender, lamb shoulder → redmeat_tough). NEW BACKLOG: build the cut
  taxonomy (tenderloin/brisket/chuck… as children, banded).
- **Ice cube** — backlog said "reclassify as food_state" = a CATEGORY ERROR. It's
  an ingredient (frozen water). Fixed correctly: transformed_from_id → Water.
- **Roles** — assigned single primary roles to 46 no-role ingredients (e2_expert).
  Role distribution is healthy (not lopsided). drink/pizza handled separately.
- **drink / pizza** — drink parents a real product (Coke Original Taste) → marked
  is_category=true (NOT deleted). pizza was an unused stub → deleted.
- **Test data** — quibbling broth + Xyzzy Test Stew removed (the other 4 nonsense
  ingredients were already gone). Also removed the liquid_base role that leaked
  onto quibbling broth during the role assignment.

## NEW DESIGN NOTES (separate docs in docs/, NOT in this file)
- **Soupdog_Ingredient_Process_Model_v0.1** — one invariant: every ingredient is
  the single output of a process (≥1 tasks human/machine/passive-time, ≥0 tools,
  ≥1 input ingredients, EXACTLY 1 output). One node type (ingredient), one edge
  type (process). transformed_from_id = trivial process; a meal = a high-
  composition ingredient (explains the meal-merge layer). food_state is an
  ADJECTIVE, not a substitute for being an ingredient. composition_level = a
  descriptor, not a type. Deferred cleanup it predicts: cold/hot water are
  probably water+food_state wrongly promoted to nouns.
- **Soupdog_Role_Strength_Design_Note_v0.1** — substitution needs MAGNITUDE not
  just role presence. Macro roles (protein/fat/fiber/starch) derive magnitude
  from nutrition_per_100g (don't duplicate); flavor/texture roles (acid/umami/
  aromatic…) need a stored `intensity` (new column, deferred), distinct from
  is_typical_primary (identity) and confidence (sure it applies). Build with the
  substitution feature.

## ARCHITECTURE NOTE surfaced this session
- **`recipes` flattened-mirror table** exists ALONGSIDE recipe_canonicals/
  recipe_versions and carries live FKs (recipes.recipe_version_id, .canonical_id).
  It's a denormalized snapshot of a recipe. ANY recipe delete/migration must keep
  it in sync — it caused an FK error during test-data cleanup. Likely a partial-
  migration artifact (schema.sql is stale). Worth auditing whether it's still
  written/read by current code or is legacy.

## SMALL FOLLOW-UPS that surfaced (genuinely small)
- Thread avatar_initials through PlanView participants (so the override shows on
  plan discs too, not just header/profile).
- Audit the `recipes` mirror table — legacy or live? keep-in-sync or retire?
- Participant name → audience-scoped shareable profile (QR; family sees X,
  restaurant sees Y). This is the Sharing & Delegation visibility-tiers phase —
  file it there, the plan popover is the natural entry point. NOT a standalone build.

## STATE: small backlog is now essentially CLEARED.
What remains is all large/design-led, each its own focused session:
- **Meal-planning enforcement + Stripe** (the real billing build; plan column,
  checkout, credit_ledger, balance gate in src/lib/ai/anthropic.ts).
- **Surface the Phase 1 score in the meal UI** (match route is the data source;
  highest user-visible value; needs a component on the meal page).
- **Demand Model Phase 2** (ask/habits rungs + daily running balance; settle the
  Doc A §11 [OPEN]s first — persona templates, slot fractions, scoring weights).
- **Sharing & Delegation Phase 0** (settle v0.2 §8 opens first).
- **Red-meat cut taxonomy** (content task, from the family cleanup above).


# SESSION UPDATE — 2026-06-05 (Phase 1 surfaced in UI; Plan & End-Product Model note)

## SHIPPED — code (pushed, builds green)
- **"For your table" panel** (Demand Model Phase 1 surfacing) on the meal EDIT
  view (`/my/meals/[id]/page.tsx`). New component
  `src/components/meal/MealFitPanel.tsx`. Shows THREE honest signals:
  1. **Confidence** — subtle dot (green ≥0.7 "Good estimate" / amber ≥0.45
     "Rough estimate" / grey "Best guess"), tap for a plain note. Grey = "we
     don't know enough yet" (an invitation, not an error).
  2. **Plating** — multi-person meals only: a share bar + per-person guidance
     ("Rasmus — the larger, more generous helping"), sorted largest-first.
  3. **Satiety** — plain words ("should leave everyone full" / "may be a little
     light"). Per the demand model's near-constraint.
  - **Nutrition-fit verdict is DEFERRED to Phase 2** — judging one meal in
    isolation gives wrong-in-isolation advice (a dessert flagged "too much
    sugar" for someone who otherwise eats well). The real fit is longitudinal
    (fits what you've eaten lately) and needs Phase 2's running balance.
  - Match route (`/api/my/meals/[id]/match`) now also returns participant
    **names** (joins person.display_name/full_name; was bare uuids) and a
    `hasNutrition` flag.
  - Panel placed on EDIT view BY DESIGN: the meal READ view is temporary
    (pending the dish-recipe-view rebuild for meals — "stabilize meals first").
    Revisit panel placement when that rebuild happens.
  - Expect mostly GREY "Best guess" today (persona-level participants + dishes
    lacking nutrition_per_serving). That's the system being honest, not broken.

## NEW DESIGN NOTE (in docs/, standalone — NOT pasted here)
- **docs/Soupdog_Plan_And_End_Product_Model_v0.1.md** — sequel to the
  Ingredient–Process Model. Core: **a plan entry is one desired end-product, and
  that end-product is an INGREDIENT; a recipe is the METHOD OF OBTAINING it**
  (cooking is just one kind). One entry = one item. Test set (any plan/recipe
  change must hold for all five): apple, bowl of oatmeal, 5-course dinner+wines,
  wedding banquet for 200, order-a-pizza — each is ONE ingredient; the recipe is
  how to get it. Recipe kinds: composed / simple / acquire / delivery / none.
  Implies: the plan should reference the end-ingredient (today it FKs
  recipe_id → recipe_canonicals); and recipe_canonicals + ingredients want to
  unify (a meal IS an end-product ingredient). [OPEN]: merge-vs-bridge those
  tables; how recipe-kind is stored; provenance edge for media/edit propagation.

  ### >>> GATES the meal-plan rework <<<
  The plan currently holds DISHES (recipe_id → recipe_canonicals). The intent is
  for it to hold end-product ingredients ("only meals, but a meal can be a single
  dish — actually it's all ingredients"). DO NOT repoint the plan schema until
  this note's §3 (recipe kinds) and §4 (merge-vs-bridge) opens are settled AND
  meals are stable. This is spine-level; settle the design first.

## DESIGN-DOC SET now in docs/ (all standalone; this file only points at them)
- Ingredient–Process Model v0.1 (every ingredient = single output of a process)
- Role Strength v0.1 (substitution needs magnitude; macro from nutrition,
  flavor/texture needs stored `intensity`)
- Plan & End-Product Model v0.1 (this session)

## BACKLOG items surfaced
- Thread avatar_initials through PlanView participants (override only shows on
  header/profile today).
- Audit the `recipes` flattened-mirror table (legacy vs live).
- Plating on RECIPES (the "add people to a recipe" idea), and plating-for-beauty
  (generative plate/equipment selection — its own project).
- Participant name → audience-scoped shareable profile (Sharing & Delegation
  visibility-tiers phase; plan popover is the entry point).

## NEXT (all large/design-led)
- Settle the Plan & End-Product Model opens → then the meal-plan-as-ingredients
  rework (the buildable consequence of this session's design work).
- Demand Model Phase 2 (ask/habits + running balance) — turns the grey "Best
  guess" real and unlocks the deferred nutrition-fit signal.
- Meal-planning enforcement + Stripe; Sharing & Delegation Phase 0.


# SESSION UPDATE — 2026-06-06 (Small-items batch: header, i18n, Word/Excel import, save/unsave fix)

A long session clearing genuinely-small backlog items. Several turned out to be
deceptively deep — notably save/unsave, which excavated real architecture debt.
All SHIPPED & verified on live unless noted.

## SHIPPED — code (pushed, builds green, tested on live)

- **Header: removed the units/metrics menu** entirely (was always-on, overkill;
  units belong in profile / later a recipe-view control). Cleaned up its state.

- **Header: language switcher made discoverable.** Was `hidden sm:flex` with a
  "LANG" text label — invisible on mobile, and unreadable to someone who landed
  in a language they don't speak. Now: always visible, led by a **globe icon**
  (no text to misread), options shown as **endonyms** (English / Svenska / 中文 /
  العربية — each in its own script), aria-labelled. So a lost user can always
  find their way back. (Both header changes in one Header.tsx commit.)

- **Recipe import now accepts Word (.docx) and Excel (.xlsx/.xls).** The model
  can't read those natively (unlike PDF/image), so they're **extracted to text
  server-side** (mammoth for Word, SheetJS `sheet_to_csv` for Excel) and fed
  into the existing text-parse path — reuses the whole downstream pipeline.
  Added deps: `mammoth`, `xlsx` (npm install committed via package.json/lock).
  - **NPM AUDIT NOTE:** install flagged 3 vulns (2 moderate, 1 high), likely
    transitive in xlsx/SheetJS. Did NOT run `npm audit fix --force` (breaks
    builds). Backlog: review `npm audit` calmly, check if a patched xlsx exists.
  - **Hardened parsing** (a long Swedish recipe initially failed with "Could not
    parse AI response as JSON"): now extracts the outermost `{ … }` from the
    model response (survives stray preamble), raised max_tokens 6000→8000,
    logs rawLen+tail on failure. Returns `retryable: true`.
  - **"Try again" button** on import errors (re-runs the last file) — these
    failures are often transient.

- **Save/unsave recipe — FIXED (was silently broken).** Root cause: the recipe
  page passed the **`recipes`-mirror-table id** as `canonicalId`, but
  `saved_recipes.canonical_id` FKs to `recipe_canonicals(id)`. The mirror's own
  `canonical_id` column is **NULL for all 40 rows** (only `recipe_version_id` is
  populated), so the insert failed the FK and nothing persisted (button flipped
  optimistically, reverted on reload, never appeared in Saved). DB schema for
  saved_recipes is fully correct (grants, RLS policy "Users manage own saves"
  ALL, unique(user_id,canonical_id), FKs).
  - **Fix (defense in depth):**
    1. ROUTE (POST + DELETE): a `resolveCanonicalId()` resolves ANY id it
       receives — canonical / recipe_version / recipes-mirror — to the true
       recipe_canonicals.id before touching saved_recipes (chain:
       recipes.recipe_version_id → recipe_versions.canonical_id →
       recipe_canonicals.id; verified intact for all 40). POST now `.select()`s
       the row back + logs failures (no more silent `{ok:true}`).
    2. PAGE: hoisted the existing slug→canonical lookup out of the author-only
       block so ALL viewers resolve it; threaded `canonicalId` through
       RecipeView → BookmarkButton. So save/unsave/load-check all use the true
       canonical (fixes the "reverts to Save on reload" display bug).
  - Verified live: saves persist, show under My Recipes > Saved, survive reload.

## ARCHITECTURE DEBT — elevate to NEAR-TERM (caused 3 issues this session)
- **The `recipes` flattened-mirror table** (alongside recipe_canonicals/
  recipe_versions). All 40 rows have a **dead/NULL `canonical_id`** column; the
  recipe page READS from this mirror and hands its id to features that expect
  canonicals. Caused: (a) the test-data FK teardown earlier, (b) the save/unsave
  break, (c) the null-canonical data finding. The save fix makes the app
  *resilient* to it (resolve-any-id) but does NOT resolve the debt.
  **Audit needed:** is the mirror authoritative or derived? why does the page
  read it? should `canonical_id` be populated or the column dropped? should the
  page read recipe_canonicals directly? Until resolved, expect more bugs of
  this shape (page hands a mirror id to something FK'd to canonicals).

## BACKLOG (deferred from this session's note list)
- **Saved-recipe folders / sub-folders / move** — its own feature (tree table +
  move/reorder UI). Save/unsave itself is now done; this is the org layer.
- **AI chat fills the make-recipe form** ("make me a croissant recipe" → fills
  fields) — a real feature, paying-users only; gate behind the quota/enforcement
  work (else it's an ungated cost center).
- **household → groups rename** (internal label; users don't see it). Cosmetic
  but wide-touching (many files/columns) — fold into the future Groups build
  rather than churning standalone.
- **npm audit** review for the xlsx transitive vulns (don't force-fix).

## NEXT (all large/design-led — unchanged from prior entries)
- Plan & End-Product rework (design settled v0.2: bridge + kind enum; build
  sequence written; confirm meals stable first).
- Demand Model Phase 2; Meal-planning enforcement + Stripe; Sharing & Delegation.
- Cook Mode / Live Cooking Sessions (backlog design note in docs/).

# SESSION UPDATE — 2026-06-06 (cont.) — Barcode search + create-recipe link

Continuation of the same long session. After the small-items batch (header/i18n/
Word-Excel import/save-unsave), this stretch built barcode search end-to-end and
fixed a recipe-creation link. All SHIPPED & verified on live.

## SHIPPED — code

- **Barcode search (Slice 1)** — one file: `src/app/search/page.tsx`.
  When the search query is 8–14 digits (`isBarcode` = `/^\d{8,14}$/`), it:
  1. **Matches own products** by stored `ingredients.barcode` (is_product=true) →
     shown at top, no headline, each with a single **"View product & recipes"**
     button → `/ingredients/[slug]` (that page shows product info + recipes
     inline; we deliberately kept ONE button, not two — Rasmus agreed, since the
     page shows both anyway).
  2. **Looks up Open Food Facts** via the existing `GET /api/products/lookup?
     barcode=` (flat response: name/brand/net_weight_g/nutrition_per_100g/
     image_url/off_id). Products found there but not in our DB are listed under a
     **"Not in the system"** heading (dashed cards, image+name+brand), with:
       - **"Add"** for logged-in users → `POST /api/my/products` (creates the
         is_product ingredient; endpoint already enforces auth = the eligibility
         gate) → on success promotes the item into the found results.
       - **"Log in to add"** for logged-out users.
  3. **Not-found message** when a barcode matches neither source: "No product
     found for this barcode" + a plain-language line (sets up the future
     manual-add path).
  - Reused existing infra: `isBarcode`, `products/lookup` (OFF), `my/products`
    POST. So this was mostly wiring + segmented UI, no new endpoints.
  - **AUTH-GATE BUG fixed during testing:** first version checked login via a
    direct browser `createClient().auth.getUser()`, which returned null even when
    signed in (client session can race/empty) → showed "Log in to add" to a
    logged-in user. Fixed by using the shared **`useAuth()` from
    `@/lib/auth-context`** — the same source the header uses. Reliable now.

- **Create-a-recipe link fixed** — one file: `src/app/ingredients/[slug]/page.tsx`.
  The "Create a recipe using this product →" button (shown when a product has no
  recipes yet) linked to `/my/recipes/new` (the ADVANCED structured editor).
  Changed to `/my/recipes/import` (the friendly "Add recipe" upload/paste page).
  NOTE: `/my/recipes/[id]` is the BASIC WYSIWYG editor but it's EDIT-ONLY (needs
  an existing recipe id); there is no basic *create* route. `/my/recipes/import`
  is the intended approachable entry point.

## OFF COVERAGE — context for the barcode feature (researched this session)
Open Food Facts is GLOBAL (4M+ products, 150 countries, contributor-built) but
VERY uneven. Strong: France ~1.21M, US ~862K, Germany 389K, Spain 362K, Italy
264K, UK 178K. Thin for our likely markets: Japan ~35K, Singapore ~9.6K, Thailand
~10K, Malaysia ~5K, **China only ~1,554**. Implication: high hit-rate in EU/US,
LOW in China (where Rasmus is), thin in SE Asia. So the "Not in the system / Add"
path carries the feature locally, and each Add populates `ingredients.barcode` so
the own-DB match path self-improves toward the actual user base.

## BACKLOG — added this session
- **Manual-add fallback:** when OFF returns nothing (frequent for China/SE-Asia),
  let eligible users add a product BY HAND, not only when OFF has a match. The
  not-found message is the natural hook for this.
- **Pre-attach product to create-recipe flow:** the "Create a recipe using this
  product" button currently opens the Add-recipe page BLANK — it doesn't carry
  the product over. The wording implies it should. Nice "smooth UX" follow-up
  (pre-seed the ingredient into the new recipe).
- **Barcode feature later slices:** tier/quota gating (currently logged-in only),
  camera/scanner input, pre-save editing of OFF data, smoother barcode→recipe UX.

## ARCHITECTURE DEBT — NEAR-TERM (unchanged, restated: caused 3 bugs this session)
- **The `recipes` flattened-mirror table.** All 40 rows have a dead/NULL
  `canonical_id`; the recipe page reads this mirror and hands its id to features
  FK'd to `recipe_canonicals`. Audit: authoritative or derived? why read it?
  populate or drop `canonical_id`? should the page read canonicals directly?
  Best done as a focused fresh session.

## NEXT (large/design-led — pick fresh)
- `recipes`-mirror audit (above) — highest-leverage cleanup.
- Plan & End-Product rework (design settled v0.2: bridge + kind enum).
- Demand Model Phase 2; meal-planning enforcement + Stripe; Sharing & Delegation
  Phase 0; Cook Mode (design note in docs/).


# SESSION UPDATE — 2026-06-06 (cont. 2) — Mirror audit + recipe-model design

Final stretch of a long session. After barcode search, this part was mostly
INVESTIGATION + DESIGN, not shipping code. Pattern of the session: each "small"
item bounced off an upstream dependency, and the chain terminated at the recipe
model itself — which we then designed substantially.

## SHIPPED — code (earlier in session, recap)
Header units removed + language switcher discoverable; Word/Excel recipe import
(+ hardened JSON parse + Try-again); save/unsave fix (resolve-any-id route + page
passes true canonical); barcode search (own-DB match + OFF "Not in the system" +
Add for logged-in, not-found message, auth via useAuth); create-recipe button →
/my/recipes/import.

## RESOLVED — `recipes` mirror-table audit (NO migration needed)
**Outcome: there was no data bug.** Doc written: `docs/
Soupdog_Recipes_Mirror_Table_Note_v0_1.md`.
- `recipes` is a deliberate flat mirror, written in parallel with canonicals/
  versions on create/edit. Its link to the canonical model works via
  `recipe_version_id → recipe_versions.canonical_id` (all 40 rows resolve).
- **`recipes.canonical_id` is a TRAP:** it's a self-FK (`REFERENCES recipes(id)`),
  an abandoned intra-mirror idea, NULL on all rows, read by NO code. Its name
  lured us (and the original save/unsave author) into assuming it held a
  recipe_canonicals.id. The dry-run + constraint inspection caught that a backfill
  would have FK-failed — do NOT backfill it.
- **DOWNGRADE** the "recipes-mirror debt" item from near-term to "resolved — see
  doc; optional rename/drop of canonical_id only, during a hygiene pass." The
  save/unsave resolve-any-id fix already shipped is the correct handling.

## DESIGN NOTES PRODUCED (no code)
1. `docs/Soupdog_Add_Recipe_From_Ingredient_Design_v0_1.md` — "add recipe from an
   ingredient" is TWO intents: (1) use ingredient AS INPUT ("I have pizza/potatoes
   — cook with it"; really meal-plan/inventory-shaped; surfaces as `linkedRecipes`)
   vs (2) make ingredient AS RESULT ("I want that mousse"; how people actually
   shop for cooking; links via `ingredients.transformation_recipe_id`). Subtle
   point: precise-ingredient model means a user's mousse recipe yields a VARIANT
   ingredient, but we still link the clicked ingredient → new recipe (honor mental
   model). "Can't make a banana" → depends on `recipe.kind`. So this feature is
   downstream of kind + a two-intents UX decision; button left at blank import for
   now.

2. `docs/Soupdog_Recipe_Model_Concept_Fork_Design_v0_2.md` — **THE FOUNDATIONAL
   ONE.** Resolves how recipes relate. Four levels:
   - **Concept** — curated (humans now, AI later), GLOBAL, MANY-TO-MANY grouping of
     ingredients perceived as "the same thing." Perception-variance across a global
     audience handled by OVERLAPPING concepts referencing shared ingredients
     (e-commerce multi-category pattern), NOT per-user concepts. Own m2m membership,
     NOT the existing `parent_id` (which stays for product↔category).
   - **Recipe (canonical)** = a sibling under a concept. siblings == variations
     (settled; a tweak makes a new sibling).
   - **Version** = replace-history within a recipe (exists).
   - **Fork** = shared content + a divergence. Content reuse is PULL-BY-REFERENCE
     declared by the CONSUMER (recipe references the ingredient's picture; fork
     references another fork's steps) — NO inheritance. "One edit covers both"
     works because referencers point at the shared source. Who may declare reuse =
     ADMIN RIGHTS (rides on Sharing & Delegation access model, no new concept).
   - Graduation: a fork can graduate to a full sibling (user choice; AI suggests
     when divergence high). No technical fork limit — "too many forks" is a
     modeling smell → graduate or parameterise.
   - Three orthogonal axes the old model conflated: History (versions) / Catalog
     (concept→siblings) / Execution-branching (forks → ties to Cook Mode).

## OPEN (recipe model) — for a FRESH design+diagram pass
- Fork representation: in-recipe branch (step with options) vs recipe referencing
  another's components? (v0.2 leans the latter.)
- Graduation lineage: how a fork re-homes as a sibling without losing forked-from
  link.
- Parameterised recipe (doneness param) vs discrete forks — when each.

## NEXT (clear opening for next session)
1. **Diagram the recipe model (v0.2) + settle the two open structural questions**
   (fork representation, graduation lineage). Prose is at its limit; this wants
   boxes + FK arrows. THEN the schema writes itself.
2. **THEN `recipe.kind` enum** (composed/simple/acquire/delivery/none) — now
   clearly DOWNSTREAM of the recipe-model levels. Likely on the canonical/recipe
   level (intrinsic, stable). Gates the two-intents feature's "can't make it" and
   feeds the Plan & End-Product bridge.
3. Then Plan & End-Product rework proper; Demand Phase 2; enforcement + Stripe;
   Sharing & Delegation Phase 0; Cook Mode.

## Backlog carried (unchanged)
Manual-add fallback when OFF returns nothing; pre-attach product to create-recipe
(now folded into the two-intents design); npm audit for xlsx vulns; saved-recipe
folders; household→groups rename; thread avatar_initials through PlanView.


# SESSION CLOSE — 2026-06-06 — Features shipped + recipe-model design/reconciliation

A long session. Two halves: (1) a batch of shipped fixes/features, (2) an extended
recipe-model design that — at the very end — turned out to largely RE-DERIVE a
schema that ALREADY EXISTS. Read the reconciliation section; it's the headline.

## SHIPPED & VERIFIED (code, pushed, live)
- Header: removed units/metrics menu; language switcher made discoverable (globe +
  endonyms, always visible).
- Recipe import: Word (.docx via mammoth) + Excel (.xlsx via SheetJS) → text →
  existing parse path. Hardened JSON extraction (outermost {…}, max_tokens 8000),
  "Try again" on error. .txt confirmed working (no real bug). NPM AUDIT: 3 vulns
  (xlsx, "no fix available" — it's the unmaintained npm dist). Do NOT `--force`.
  Backlog: migrate to SheetJS CDN dist.
- Save/unsave: FIXED. Was passing the `recipes`-mirror id where saved_recipes.canonical_id
  FKs to recipe_canonicals. Fix = resolve-any-id in route (POST+DELETE) + page passes
  true canonical. Verified persists + shows in My Recipes>Saved.
- Barcode search: 8–14 digit detection → match own ingredients.barcode (shown, no
  headline, "View product & recipes") + Open Food Facts lookup → "Not in the system"
  + Add (logged-in, via /api/my/products) / "Log in to add". Not-found message added.
  Auth gate uses useAuth() (a direct client getUser() raced → false negative; fixed).
- Create-recipe button (ingredient page) → /my/recipes/import (was /new advanced).
- PlanView reads avatar_initials override (threaded through both meal-plan routes +
  monogram()).
- household → group rename: DB table `household_members`→`group_members` (empty, no
  deps — safe), policy renamed, route `/meal-plan/household`→`/group`, types updated,
  PlanView fetch updated. Old household route folder deleted.
- Logotype + favicon: pushed (had been left unstaged on a prior commit).

## RESOLVED (not deferred)
- `recipes` flat-mirror table: AUDITED — no data bug. `recipes.canonical_id` is an
  inert self-FK (REFERENCES recipes(id)), NULL on all rows, read by no code; the
  real mirror→canonical link is via recipe_version_id. Doc:
  Soupdog_Recipes_Mirror_Table_Note_v0_1.md. DOWNGRADED from "near-term debt" to
  "resolved; optional rename/drop of canonical_id only."

## DESIGN DOCS PRODUCED (in docs/)
- Soupdog_Add_Recipe_From_Ingredient_Design_v0_1.md — two intents (use-as-input vs
  make-as-result); downstream of kind + a UX decision.
- Soupdog_Recipe_Model_Concept_Fork_Design_v0_1 … v0_6.md — the recipe model,
  reasoned end to end: concept (curated, global, m2m) / recipe-as-sibling / version /
  fork-by-reference / graduation-as-naming / author guardrails+fork-vs-new keystone /
  fork-as-interactive-choice / portion-aware Cook Mode / per-participant defaulting /
  demand front door (free→queue, paid→AI-gen-contributes) / composition schema
  (recipes reference atomic ingredient/tool/task entities) / final ERD.
  Guiding principle: system MEASURES & SUGGESTS, human NAMES & DECIDES.

## *** HEADLINE FINDING — read this first next session ***
The recipe model designed in v0.1–v0.6 LARGELY ALREADY EXISTS in the live DB, often
MORE mature than the design. Discovered via a schema audit run one query BEFORE
writing DDL (which would have created a massive duplicate — `recipes`-mirror mistake
at scale). Full mapping in: **Soupdog_Recipe_Model_Reconciliation_v0_1.md**.

Key mappings (design → reality):
- fork → `execution_variants` (43 rows; has `derived_from_variant_id`, `is_user_fork`,
  **`divergence_score`** = our "unity", `variant_axes`, `method_changes`). Divergence
  expressed via `variant_step_overrides` / `variant_ingredient_scaling` /
  `variant_equipment_overrides` — i.e. reference-with-override (our copy-on-write),
  already built.
- atomic task → `tasks` (91 rows; `parameter_schema`, `is_passive`, `is_parallelisable`,
  in/out states, `completion_criterion`, `task_family`/`category` taxonomy started,
  `is_verified`/`content_reviewed`). The v0.5 "tasks first-class" insight = already done.
- composition (recipe_element) → `version_steps` (755 rows; `task_id`→tasks,
  `task_parameters`, parallel/blocking flags). Steps already reference catalogued tasks.
- tool → `equipment` (61 rows, richer). ingredient link → version_step_ingredients /
  version_ingredients (typed FK — the "minimal hybrid" is already reality).
- concept → `food_families` + `food_family_members` (m2m) but only 3/2 rows — underused.
- `recipe_canonicals.composition_level` is almost certainly the intended `kind` enum.
- `entity_relations` (0 rows) — a designed generic relation table, sitting empty.

DO NOT build v0.6's 8 tables. The design notes are now the THEORY of the existing
system, not a build spec.

## PROCESS LESSON (recorded)
Audit the live schema BEFORE designing. Tonight's design happened in a vacuum because
the handover/context presented the schema as "recipe_canonicals→recipe_versions + 40
recipes" when in fact ~70 tables exist implementing much of it. Future sessions: start
from the schema.

## GENUINE GAPS (the REAL, small build backlog — things that don't exist yet)
- Demand-capture front door: a "requested-but-not-made recipe" entity + free→queue /
  paid→AI-generate routing. NEW.
- Curation-gate workflow for recipe additions going live (flags exist on tasks/
  equipment; no recipe-level queue/state machine). Partial.
- Author modification guardrails (permitted-variation envelope). NEW.
- Concept layer activation: decide if `food_families` IS the concept layer (likely
  repurpose) and populate it.

## NEXT SESSION — recommended opening (small, grounded, NOT "build the model")
1. Read how a recipe is ASSEMBLED in code (which tables the read path joins) — confirm
   the reconciliation mapping against actual usage.
2. Confirm `composition_level` = intended `kind`; do NOT add a duplicate enum.
3. Decide `food_families` vs a new concept layer.
4. Scope the 4 genuine gaps above as the build backlog.

## OTHER BACKLOG (carried)
- Header avatar stale-until-hard-refresh (profile save doesn't refresh auth/profile
  context). Minor, pre-existing.
- Manual-add fallback when OFF returns nothing (China/SE-Asia coverage thin: China
  ~1,554 products; OFF is global but uneven).
- Pre-attach product to create-recipe flow (folded into two-intents design).
- npm audit → migrate xlsx to SheetJS CDN dist (don't --force).
- saved-recipe folders; technique-section browsing taxonomy (tasks have
  family/category started).
- Plan & End-Product bridge; Demand Phase 2; enforcement + Stripe; Sharing &
  Delegation; Cook Mode (much already scaffolded in tasks/execution_variants).

# Soupdog — Session Handover · 2026-06-07

Read this first, then HANDOVER.md (the big standing doc) for full project context.
This records only what changed THIS session and what to do next.

## Standing context (unchanged — see HANDOVER.md for detail)
Solo founder Rasmus; soup.dog; Next.js 16 / Supabase (project npvajzgciuykugqxedmm) /
Vercel (auto-deploy on push) / TypeScript. Works from China via Clash Verge TUN VPN.
No real users yet (safe to change/delete live data). File delivery: Claude zips/creates
whole files with `--` path separators; Rasmus places manually. SQL run manually in
Supabase SQL editor. Rasmus person id b6a30271-7992-406e-8578-da6e2ccf9f19.

## SHIPPED + VERIFIED LIVE this session
- **Legacy recipe read-path REMOVED** from src/app/recipes/[slug]/page.tsx. The page
  used to dual-read (rich `recipe_canonicals→recipe_versions→version_steps/...` AND
  legacy `recipe_steps/recipe_ingredients/recipe_equipment` via `mapLegacyRecipe`,
  choosing via a `hasNewData` ternary). Investigation proved ALL 41 recipes have rich
  data — the legacy branch served nothing live. Removed the 3 legacy joins, the
  `hasNewData` ternary (now always `mapNewSchemaRecipe`), the `mapLegacyRecipe`
  function, and fixed a resulting trailing-comma. Verified live: chicken-tikka-masala
  renders fully (11 ings, 4 tools, 8 grouped steps, PDF export + QR work).
- **Logotype + favicons** updated (new dog wordmark showing in header).
- Both pushed.

## DATA CLEANUP — DONE (committed)
Deleted 7 test/draft recipes (verified canon_left=0; keepers intact). Deleted:
Meal 2: tiger and Tagine · Roasted almonds and walnuts · Fried almonds · Indian curry
· Hazelnut Cream · Salad · Oatmeal (the unpublished 3/3 one — kept the published one).
All real recipes intact (Carbonara, Tagine, Dhal, Mango Lassi, Tomato soup, croissant,
crème brûlée, chocolate bavarois, apple pie, etc.). recipe_canonicals now ~34.

### ⚠️ KEY LESSON — Supabase SQL editor & transactions
A bare `begin; ... <deletes> ...` with NO `commit;` in the same execution gets ROLLED
BACK by the editor — the dry-run-then-commit pattern does NOT persist unless `commit;`
is in the SAME run/batch. Two patterns that DO work:
  (a) autocommit: no BEGIN, no temp tables (temp tables need a txn), inline the target
      IDs in every statement — each delete auto-commits. (This is what finally worked;
      file: delete_test_recipes_autocommit.sql.)
  (b) transactional: include `commit;` as the final line of the SAME execution.
Also re-confirmed (recurring trap): the `recipes` mirror links via **recipe_version_id**
(the REAL link), NOT canonical_id (an inert self-FK). Delete mirror rows by
recipe_version_id BEFORE deleting recipe_versions, or you hit
`recipes_recipe_version_id_fkey`.

## DOCS produced this session (all in docs/ — confirm pushed)
- **Soupdog_Recipe_Architecture_AS_BUILT_v0_1.md** — CORRECTED: the 2 ex-"seeds"
  (Chicken Tikka Masala, Sourdough Loaf) always had rich data; legacy branch marked
  REMOVED; canonical_id-tidy dead-end recorded; cleanup marked DONE.
- **Soupdog_Atomic_Recipe_Decomposition_Design_v0_1 → v0_2 → v0_3.md** — the big design
  arc this session (see below).
- **Soupdog_Intermediate_Catalogue_Commercial_v0_1.md** — strategic forward-pointer.
- (Local one-off SQL not needed in repo: diag_*.sql, delete_test_recipes*.sql.)

## MAJOR DESIGN: Atomic recipe decomposition (editorial → executable graph)
Fully designed this session (v0.3 is current). Soupdog recipes are EXECUTABLE (a
structured graph for the IoT age), vs old EDITORIAL prose. An AI decomposition pass
converts editorial→executable. FOUR decisions locked:
1. **Maximally atomic** — one ingredient per add-step, always. Stop at the culinary
   verb (no micro-motions). Verbosity absorbed by display layer.
2. **Task matching = match on the underlying TRANSFORMATION**; parameters absorb
   intensity/duration/medium (stir/stir-gently = one task + param; sauté≠sear≠boil).
   Bias to reuse, NEVER collapse distinct transformations. New tasks enter
   unverified/AI-sourced; curation blesses; periodic merge.
3. **When it runs = INLINE**, two internal steps (parse→decompose) in one import call.
   User sees ONLY the atomic result. PERSIST the bundled step-1 extraction hidden as
   the re-decomposition source; if wrong, re-run ONLY step 2 (no re-import). [NOTE:
   import is ALWAYS an AI/cost path — there is no AI-free import. Membership free/paid
   tiering belongs to the DEMAND feature, not decomposition.]
4. **Structure = FULL DEPENDENCY DAG** (the big reframe). A recipe is a directed
   acyclic graph: nodes=atomic steps, edges=dependencies. GROUPS = intermediate-
   producing SUB-GRAPHS = sub-recipes (backed by `version_sub_recipes`); a group
   yields a result-ingredient (`ingredients.transformation_recipe_id`). Intermediates
   FAN OUT (chop 200g onion → Sauce uses 100g + Salad uses 100g). Parallelism /
   division-of-labour read off the graph. Derive groups bottom-up from the final
   product (convergence points incl. plating = group boundaries); explicit labels
   override. Recursion: Meal = ONE recipe → ONE end product, composed of dish
   sub-recipes → group sub-recipes → atomic steps (same pattern every level).
   Display: section by group, collapse contiguous same-task+same-tool steps into one
   readable line. Store atomic, display grouped.

**v0.3 additions:** find-or-create applies at ALL THREE levels — ingredient / task /
sub-recipe-intermediate. AI searches for matching sub-recipes/intermediates before
writing new (much prep is shared, esp. Indian: ginger-garlic paste, birista, tarka).
Compounds quality/saturation over time. Sub-recipe matching is fuzzier → dedup-by-
parameterisation discipline matters more.

**Commercial forward-pointer (capture, not build):** once intermediates are
catalogued + usage-counted, three things fall out free — (1) consumer upsell ("you chop
a lot of onion → buy pre-chopped", respecting no-injected-ads), (2) B2B prepared-food
DEMAND SIGNAL (which intermediates are most made-from-scratch = product-dev
opportunities for food-company customers), (3) catalogue compounding.

**Recurring theme:** the schema ALREADY supports all of this (version_steps.task_id,
task_parameters, tasks.completion_criterion/suggested_tool_slugs/is_verified,
version_sub_recipes, meal_component, parallel_group_id). Decomposition POPULATES
existing structure; it is not new schema. (This echoes the earlier-session finding that
the recipe model was already built — audit schema BEFORE designing.)

## NEXT SESSION — recommended starting point
The decomposition feature is now fully DESIGNED (v0.3) and ready to BUILD. The build is
meaty and best started fresh. Remaining work (all build / prompt-engineering, none
designed yet):
- The DAG-emitting decomposition prompt (emit nodes + dependency edges + intermediates
  + group/sub-recipe boundaries; find-or-create task matching; tool inference anchored
  to suggested_tool_slugs; map "until X" → completion_criterion).
- **Dependency-inference quality + an eval set** — the HARD part; needs examples.
- Mapping sub-recipe boundaries → version_sub_recipes rows at insert time.
- The display collapse rule (section from DAG; merge contiguous same-task steps).
- Storage of the persisted step-1 bundled extraction (column vs small table).
Before any `kind`/enum work: confirm `recipe_canonicals.composition_level` is the
intended kind enum; decide whether food_families is the concept layer.

## Loose ends / backlog (unchanged or minor)
- Confirm the docs/ commits above are pushed (git status; git add docs/; commit; push).
- Optional future tidy: DROP now-unread legacy TABLES (recipe_steps/recipe_ingredients/
  recipe_equipment) + stale recipes.canonical_id self-FK column. Not urgent.
- Header avatar stale-until-hard-refresh (pre-existing, minor).
- Manual-add fallback when barcode OFF returns nothing (China/SE-Asia thin coverage).
- npm: xlsx vulns "no fix available" — migrate to SheetJS CDN dist (don't --force).
- Saved-recipe folders.
- Genuine unbuilt gaps: demand front door, curation-gate workflow, surfacing forks in
  the read path (execution_variants exist but 0 user forks, not rendered).

# SESSION UPDATE — 2026-06-07 (cont.) — Decomposition wired into import · Shared RecipeDisplay · Guide-layer designed

Continuation of the 2026-06-07 session. The atomic-decomposition backend (built &
validated earlier same day: `/api/recipes/decompose`, `/api/recipes/decompose-save`,
`version_step_dependencies`, eval 6/6, live Carbonara 19 steps/19 edges) is now
USER-FACING, the preview/saved-view divergence is GONE, and the next quality problem
(consistency) is designed. All SHIPPED & verified live unless marked.

## SHIPPED — code (pushed, builds green, tested live)

### Decomposition wired into the import flow (Increments 2 + 3)
The Add-recipe page (`src/app/my/recipes/import/page.tsx`) now runs the full pipeline:
- **handleImportFile**: parse (`/api/recipes/import`) → keep the parse HIDDEN as
  `sourceExtraction` (revert / cheap re-decompose source) → decompose
  (`/api/recipes/decompose`) → preview shows the ATOMIC result. New `'decomposing'`
  status ("Breaking into steps…" / "Structuring…").
- **handleSave** → POSTs `{ meta, dag, sourceExtraction }` to
  `/api/recipes/decompose-save` (NOT the old `/api/my/recipes`). Old
  `importToRecipePayload` path retired (function left in file, unused).
- Chat-modify panel + "Advanced editor" GATED OFF on the DAG path (`{false && …}`;
  code intact) — they return DAG-native in a LATER increment. The user edits via the
  meta fields now; chat-to-refine-DAG is a pending build.
- **Migration RAN LIVE:** `recipe_versions.source_extraction jsonb`
  (`decomposition_02_source_extraction.sql`) + `grant all on recipe_versions`.
  GOTCHA HIT: it had NOT been run when first delivered (Increment 1) → the
  decompose-save insert failed with `column source_extraction does not exist` until
  the migration was applied. (Lesson restated: run the migration before testing the
  save.) decompose-save now reads `body.sourceExtraction` and writes it into the
  version insert.
- VERIFIED live: Spaghetti Carbonara created through the UI →
  `has_extraction=true`, 19 steps, 19 edges.

### Shared `RecipeDisplay` component — preview and saved view now render identically
**The headline of this arc.** Rasmus flagged the preview looked different from the
saved recipe page — two renderers, two looks, for the same recipe. Root cause:
`RecipeView` (saved page) reads `version_steps` sorted by order_index and renders the
cookbook layout; the Increment-2 preview rendered a technical DAG (n1 / ← needs /
→ produces). Fix = ONE shared presentation component used by BOTH (Rasmus chose the
full consolidation, "Option B", since no users = safe to refactor the live page).

- **NEW `src/components/recipe/RecipeDisplay.tsx`** — the single source of truth for
  how a recipe LOOKS (title-less central column: Ingredients table, Tools chips,
  Procedure table; mobile + desktop variants; faithful copy of the old RecipeView
  presentation). Interactivity is OPTIONAL via an `interactive` prop
  ({ ingChecks, stepChecks, servings }): present on the saved page (cooking
  checkboxes), absent in the preview. `linkIngredients` prop (on for public view, off
  in preview). Helpers `Th/Checkbox/SectionHeader/ToolCell` MOVED here from the view
  page.
- **NEW `src/lib/dag-to-recipe.ts`** — `dagToRecipe(dag, meta)` maps an in-memory
  decomposition DAG into the `Recipe` shape RecipeDisplay renders (mirrors how
  decompose-save persists: node→step, single ingredient→stepId link, tool→
  appliance_settings.stepTools). This is the bridge that lets the PREVIEW feed the
  same component the saved page uses.
- **`src/app/recipes/[slug]/page.tsx` REFACTORED:** `RecipeView` shrank to a shell
  (bookmark, print, right sidebar, mobile sticky bar, nutrition, owns checklist/
  servings state) and delegates its central column to
  `<RecipeDisplay recipe linkIngredients interactive={{ingChecks,stepChecks,servings}}/>`.
  Removed now-dead local computations (stepIngMap, displayIngredients, derivedTools,
  groups) and dead helpers (Th/Checkbox/SectionHeader/ToolCell/ApplianceBadge/
  ApplianceCell) + their now-unused imports (Zap, APPLIANCES, ApplianceStepSettings).
- **Import page** preview now renders `<RecipeDisplay recipe={dagToRecipe(...)} />`
  (non-interactive) with the editable meta fields above it; removed the technical
  nodeGroups/nodeLabel render and the SoupdogIcon import.
- VERIFIED live: existing Carbonara + its preview both render through RecipeDisplay;
  cooking checkboxes / servings still work on the saved page (regression-checked).
- KNOWN COSMETIC: the right-sidebar "Tools" progress bar reads `toolChecks` but
  RecipeDisplay shows tools as plain chips (no checkboxes) → that bar sits at 0/N.
  Minor; address later.

### Decomposition prompt hardened — completion capture + faithfulness (partial win)
Rasmus flagged lost timings/criteria + a bogus step. Strengthened
`/api/recipes/decompose` SYSTEM prompt:
- **Rule 7 rewritten:** completion criteria MANDATORY when the source states them, on
  ACTIVE steps too (not just passive). Range "8-10 min" → completion "PT9M" + notes
  "about 8-10 minutes"; observable "until crispy" → completion verbatim; never invent
  a number.
- **Rule 8 (faithfulness):** never invent steps absent from the source (targets the
  bogus "ladle"). **Rule 9:** the `task` is the VERB, never a tool name
  ("drain into a colander" → task `drain`, tool `colander`).
- **RecipeDisplay now renders step `notes`** (the "until crispy" / human time text) as
  a muted suffix on the instruction; `mapNewSchemaRecipe` now MAPS `version_steps.notes`
  and both `version_steps` selects now FETCH the `notes` column (were omitted).
- RESULT (Carbonara re-test): PARTIAL. It now captures "8 min" and renders notes —
  but inconsistently: the 8-min landed on the bring-water-to-boil node instead of the
  pasta-cook node; the pasta step came out as a second bare "Cook"; "fry until crispy"
  still dropped on that run. → This plateau is WHY the guide layer (below) is the real
  fix. More prompt-tightening = diminishing returns.

## DESIGN — Guide Layer (Retrieval-Augmented Decomposition) — the next big build
**Doc:** `docs/Soupdog_Decomposition_Guide_Layer_Design_v0_1.md` (written this arc).
Rasmus's insight: stop letting the AI decompose from scratch each time (inconsistent —
see the boil/cook misplacement). Instead, show the AI the relevant slice of the
VERIFIED task library — each task with its expected parameters + completion behaviour —
DURING decomposition, so it MATCHES rather than invents. This moves find-or-create
UPSTREAM (today it runs only downstream, code-side, in decompose-save).
- Fixes the exact bugs: the expectation travels WITH the task (a `boil`/cook task that
  "expects a duration/until-al-dente" makes the time land on the right node; a `fry`
  task that "expects an observable end-state" stops "until crispy" being dropped) —
  not just in a weak global prompt rule.
- Bones already exist on `tasks` (parameter_schema, completion_criterion,
  suggested_tool_slugs, is_verified). Mostly POPULATE + CURATE + feed a subset into the
  prompt. Small additions at most: `expects_completion` enum, task synonyms (retrieval).
- **Curation is the other half:** all ~91 tasks are `is_verified=false` today → guide
  is empty until a verified CORE (~20-30 common transformations) is seeded/blessed.
  Guide layer ⇄ curation are two sides of one thing.
- Likely cheaper/faster too (match a candidate set vs derive the whole ontology) —
  measure against the eval set.
- §8 has 8 open decisions (retrieval strategy [lean verb-keyed + always-on core];
  completion representation; synonyms storage; curation-surface scope; verified-core
  seed list; explicit new_task signalling; token budget; cost measurement). §9 has the
  build sequence. SETTLE §8 before building.

## DEFERRED (designed/noted, not built) — feed off the guide layer's canonical names
- **Instruction composition:** stop baking ingredient+qty into stored
  `version_steps.instruction` ("Add 3 l water"); compose the readable line at DISPLAY
  time from task verb + structured columns + (sometimes) the tool. Makes task content
  truly reusable (translations/images/video attach to the bare task, not a baked
  sentence). Open: use `task.name` directly vs a `display_template` ("Add {ingredient}");
  the tool-inclusion rule (when "to the pan" disambiguates). The clunky
  Transfer/Toss/Add/Plate lines are this problem.
- **Concept tier for TOOLS (and tasks):** "large-pan" should resolve to a tool CONCEPT
  "Pan" (a family). Discussed for ingredients in the recipe-model docs, NOT for tools/
  tasks, and not implemented. Likely mirrors the ingredient concept design (overlapping
  m2m, not per-user). Plugs into the guide layer (match the concept, instance is a
  param). Own design doc.

## BACKLOG — now load-bearing / carried
- **Curation admin view** (bless/edit/merge AI-created tasks) — was a low-priority
  backlog item; the guide layer makes it LOAD-BEARING (no verified tasks = no guide).
  AI-created unverified tasks keep accumulating (combine, toss, transfer, reserve,
  crack, melt, ladle, … all `is_verified=false`, `source=ai_generated`). The bogus
  `ladle` task created in earlier testing sits unverified — harmless, the hardened
  prompt won't reuse it for Carbonara; curation can delete/merge it later.
- Chat-modify + advanced-editor go DAG-native (gated off on the import DAG path now).
- Chat-to-GENERATE a recipe ("give me a croissant recipe") — the 3rd import entry path
  Rasmus described; still pending (NEW generation prompt, distinct from parse + modify).
- Option B sub-recipe materialization (groups → child canonicals + version_sub_recipes).
- Re-import the existing ~34 recipes through the new decompose path to convert them to
  executable DAGs (today only the test Carbonara has edges).
- Delete the 2nd test Carbonara + any leftover decompose-test recipes (FK order:
  recipes mirror by recipe_version_id → version_step_dependencies → version_ingredients
  → version_steps → execution_variants → null current_version_id → recipe_versions →
  recipe_canonicals).
- (carried) npm xlsx vulns "no fix available"; saved-recipe folders; header avatar
  stale-until-refresh; manual-add when OFF barcode returns nothing.

## NEXT SESSION — recommended opening
Build the **guide layer**, per `docs/Soupdog_Decomposition_Guide_Layer_Design_v0_1.md`:
1. Confirm live `tasks` columns; settle §8 opens (retrieval strategy, completion
   representation, verified-core list).
2. Seed + verify a small CORE task set with guide metadata.
3. Retrieve verb-keyed candidates + always-on core → inject a "known tasks" guide block
   into the decompose prompt with matching discipline.
4. Re-run eval + Carbonara: pasta cook-time on the RIGHT node, fry keeps "until crispy",
   consistent verbs, fewer invented tasks; measure tokens.
5. Minimal curation admin view to grow the guide.
6. THEN instruction composition + tool concept tier (own docs).

## KEY LESSONS THIS ARC
- **More prompt-tightening hits a ceiling** — free-form decomposition is inherently
  inconsistent; the structural fix is anchoring to a curated task library (guide layer),
  not more rules.
- **Run the migration before testing the save** — `source_extraction` missing column
  blocked decompose-save until applied (recurring trap).
- **One shared display component** beats two renderers — when a preview and a final view
  show the same data, they must be the same code, or they drift. Extract the pure
  presentation; keep page-specific interactivity in the page wrapping it.
- **Data captured but not rendered looks like a bug** — the prompt captured `notes` but
  RecipeDisplay/mapNewSchemaRecipe/the SELECT all had to surface it before it was
  visible. Capture + map + select + render are four separate steps.
- (restated) `recipes` mirror links via `recipe_version_id`; delete mirror rows first
  in any teardown.

# SESSION UPDATE — 2026-06-07 (cont.) — Guide layer SHIPPED; Techniques pages + curation; display fixes

Continuation of the same day. The decomposition guide layer (designed v0.3 earlier) is
now BUILT, SHIPPED & VALIDATED on prod, plus the public Techniques pages, a task curation
admin view, two decomposition display fixes, and three design captures. All live unless
marked. Read the design docs in docs/ for full theory; this is the build state.

## SHIPPED & VALIDATED (prod, tested live)

### Guide layer — the consistency fix (Phase A)
The decompose route now matches against a VERIFIED task library instead of inventing.
This structurally fixed the bugs prompt-tightening couldn't: cook-time landing on the
wrong node, dropped "until crispy", inconsistent verbs.
- **Schema** (`supabase/migrations/guide_00_task_schema.sql`, RAN LIVE): added to `tasks`
  — `completion_type` enum (time/core_temp/surface_temp/color/volume/mass/texture/
  structural/aroma/ph/subjective — EXTENSIBLE) + `completion_target text`; `heat_mechanism`
  enum (conduction/convection/radiation/dielectric/combination/none) + `heat_medium`
  (fat/water/steam/air/direct/none). `completion_measurable` bool now redundant
  (derivable: type != subjective). Re-granted.
- **Seed** (`guide_01_core_task_seed.sql`, RAN LIVE): blessed ~30 CORE tasks
  (is_verified=true) with typed completion + heat mechanism/medium + durations + in/out
  states + tools. Added "Bring to a boil" (structural/rolling boil, NO duration) distinct
  from "Boil" (texture/al dente, has duration) — the boil-bug fix made structural.
  Cleaned AI dupes: merged lowercase `fry`→Sauté, `combine`→Mix (repointed version_steps,
  deleted); re-cased+blessed `melt`→Melt, `reserve`→Reserve, `crack`→Crack. ~66 other
  tasks remain is_verified=false (the curation to-do list).
- **Guide injection** (`src/app/api/recipes/decompose/route.ts`): before the AI call,
  fetches all is_verified=true tasks, builds a compact "KNOWN TECHNIQUES" block (name,
  description, in→out state, heat, completion expectation+target, tools) appended to the
  SYSTEM prompt with matching discipline (use exact name; honour completion expectations;
  most specific; invent lowercase + new_task:true only if none fits). Verified core is
  small (~30) so all are included; verb-keyed narrowing can come later if it grows.
- **VALIDATED via carbonara**: pasta cook-time on Boil (not Bring-to-a-boil), guanciale
  Pan-fry kept "until crispy", consistent verbs, new_task=false for all 19 nodes,
  convergences correct.

### Two decomposition DISPLAY fixes (shipped)
- **#1 Time column**: `naturalDurationToSeconds()` added to BOTH
  `api/recipes/decompose-save/route.ts` and `lib/dag-to-recipe.ts` — parses "about 9
  minutes" / "8-10 min" (midpoint) / "90 seconds" from completion OR notes as a fallback
  after ISO PT. Boil now shows 9 min. VERIFIED.
- **#2 grate/prep double-up (Model B)**: prompt rule 2b in the decompose route — a
  transformation stated about an ingredient ("pecorino, finely grated") becomes its OWN
  task (Grate; "finely"→param), NEVER also a prep-note. prep-notes reserved for
  non-transformation qualifiers ("at room temperature", "ripe"). VERIFIED: cheeses now
  raw ingredients + Grate tasks, no redundant prep text.

### Techniques pages — the human face (Phase B, partial)
The verified task data, now surfaced for users. "One spine, two faces" is literally true:
same `tasks` rows feed the AI guide AND render as public pages.
- `src/app/techniques/page.tsx` — list, grouped by category (human labels), verified-
  first, with a search box AND category FILTER BUTTONS (derived from categories present in
  the data, Ingredients-page style, self-update as you curate). Shows ALL tasks; drafts
  badged. Doubles as a curation overview.
- `src/app/techniques/[slug]/page.tsx` — detail: description + "Done when" (plain-language
  gloss of the completion signal — appliance-grade doneness), Heat, Typical time,
  Transforms (in→out state), Tools, Category, Tips, Common mistakes. Admin "Edit" button
  (server-checked).
- Sidebar "Techniques" link already wired. Tools page DEFERRED (equipment content
  uncurated — 61 rows mostly empty; build after curation can fill it).

### Task curation ADMIN VIEW (the edit face)
Edit/bless tasks from the UI instead of SQL. Now load-bearing (the guide depends on good
verified tasks).
- `src/app/api/admin/check/route.ts` — GET {isAdmin} from the SERVER session (robust; no
  client getUser() race).
- `src/app/api/admin/tasks/[id]/route.ts` — admin-gated PATCH; whitelists editable fields,
  validates enums, coerces numbers/arrays; `maybeSingle()` + clear "Update blocked by
  permissions" message (not the cryptic coercion error).
- `src/app/techniques/[slug]/edit/page.tsx` — full edit form; FIXED BOTTOM SAVE BAR
  (recipe-editor pattern, right:0 since no chat sidebar).
- **RLS** (`guide_02_admin_task_update.sql`, RAN LIVE): `tasks_admin_update` policy lets
  the admin account UPDATE ANY task (the verified core has created_by=NULL — blessed as
  postgres — so the existing "Update own tasks" policy couldn't touch them).

## ⚠️ KEY LESSON — person id ≠ account id (cost ~30min)
The admin gate was first keyed to Rasmus's PERSON id `b6a30271-...`. But `auth.uid()`
returns the ACCOUNT id. Rasmus's two accounts: **bb02ae50-436c-4402-8c8c-447344e10151
(rr@varm.io)** and **1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf (rr@le.works)** — BOTH are
admins. The wrong id meant the Edit button never showed AND the RLS policy blocked saves
(0-row update → "Cannot coerce result to single JSON object"). Fixed in all 3 places
(check route, tasks route default, RLS policy) + env override `SOUPDOG_ADMIN_ACCOUNT_IDS`.
Anywhere admin gating touches auth.uid(), use the ACCOUNT id, not the person id.

## ANOTHER LESSON — doc versioning / the `docs--` prefix
Reusing a filename across material edits bred FOUR copies of the same doc (v0_2..v0_5) and
a "same name, didn't add it" loop. Also: the `docs--` delivery prefix is a PLACEMENT
instruction (→ docs/ folder), NOT part of the filename — must be stripped on placement
(files had landed as `docs/docs--*.md`). RULE: material change → new unique version number
+ filename; strip the `--` prefix when placing.

## DESIGN DOCS (in docs/ — theory; this handover has build state)
- **Soupdog_Culinary_Knowledge_Layer_Design_v0_5.md** — THE canonical knowledge-layer doc
  (supersedes v0.1 guide-layer + all v0_2..v0_4 drafts; delete those). Contents: one
  spine/two faces (AI guide ↔ Techniques/Tools pages); §2b machine-truth-vs-human-filter
  + intermediate-visibility rule (graph keeps every intermediate; display surfaces one
  ONLY if held & reused later, e.g. pasta water, else implied by the next task); §2c typed
  completion signals (appliance-grade doneness); §2d heat-mechanism technique taxonomy
  (fry = conduction+fat; sauté/sear/pan-fry siblings under a shared mechanism, distinct
  methods — answers fry-vs-Sauté: siblings, not merge, not fake parent); §2e tasks that
  prepare a TOOL not an ingredient (bain-marie, preheat oven — a 3rd node shape; apparatus-
  prep family; tool-availability can insert make-the-tool steps; needs inventory model;
  matters most for the machine/appliance view); §5b concept-first + intermediate-hiding +
  role-gated browsing; §5c category-model evolution (free-text now → locked-vocabulary +
  deliberate-creation-form later → maybe m2m, but mechanism/medium may already cover the
  cross-cutting axis). Build sequence: Phase A (DONE) → B (Techniques pages DONE, Tools +
  fuller curation pending) → C (ingredient affordances via roles + entity_relations
  interactions) → D (instruction composition + intermediate visibility + admin per-step
  inputs/outputs column).
- **Soupdog_Variation_Generation_And_Content_Pipeline_Design_v0_1.md** — guidance at the
  RECIPE level: A1 reference-exemplar decomposition (cook tenderloin "like" verified
  ribeye; retrieval by food-family/role neighbour); A2 expected-variation-family
  generation (doneness×thickness×count → populates existing `execution_variants`); the
  flywheel (curated exemplars improve all related recipes). COST DISCIPLINE: variation
  generation runs AFTER base settled (on publish / explicit action), cost-gated, NEVER in
  the live edit loop. Content pipeline (Rasmus's 3 steps): tiered region-aware dish-family
  backbone (HONEST CAVEAT: no authoritative global ranking exists — AI estimation refined
  later by real usage signal) → derive minimal high-reuse exemplar set + their guide
  dependencies → sequence by demand (only verify guide rows the prioritised exemplars
  touch). Claude can draft the backbone/exemplars. NOT next.

## NEXT SESSION — options (all build/curation, design largely settled)
- **Curate the verified core + drafts** via the new admin view (fix Melt's category etc.;
  bless the ~66 drafts). Now pleasant (UI, not SQL). Highest-leverage for guide quality.
- **Phase D display layer**: instruction composition ("Add water to the pot", stop baking
  "Add 3 l water"); intermediate visibility (pasta water as a surfaced ingredient) + an
  ADMIN per-step inputs/outputs column (Rasmus's idea — concretises §2b machine truth).
- **Tools page** (after equipment content curated) — same shape as Techniques over
  `equipment`.
- **Phase C**: ingredient affordances from roles; populate entity_relations (tool→task
  'performs', ingredient→task 'typical_task').
- **Re-import the ~34 existing recipes** through the new decompose path (only test
  carbonaras have DAGs/edges so far). Then delete test carbonaras.
- Variation generation + content pipeline (own doc; not next).
- Larger pending (unchanged): meal-plan enforcement + Stripe; Demand Phase 2; Sharing &
  Delegation Phase 0; Plan & End-Product bridge.

## Loose ends this session
- `supabase/migrations/decomposition_02_source_extraction.sql` showed as modified in git
  status unexpectedly — glance at the diff before committing; `git restore` if it's a
  stray edit.
- Category vocabulary is free-text + drifting (e.g. "thermal state change") — fine for now
  (filter buttons derive from data); lock later per §5c.
- Apparatus-prep (§2e) and the tool-availability/inventory model are captured, NOT built.
# SESSION UPDATE — 2026-06-09 — Tools section BUILT; Techniques parity (create+archive); archive-not-delete; curation cleanup

A long build/debug session. The knowledge-section CURATION SURFACE is now complete and
consistent across both Tools and Techniques: create → read → edit → publish(verify) →
archive/unarchive, with find-drafts and find-archived. All SHIPPED & VERIFIED on prod
unless marked. Also: extensive earlier design work this session (validated visual system +
dietary-fit content area) is captured in the design docs — see the pointers at the end.

## SHIPPED & VERIFIED (prod, tested live)

### Tools section — BUILT end-to-end (the prerequisite unblocker)
Tasks reference tools (`tasks.suggested_tool_slugs`), so you can't curate tasks without
creating/editing the tools they cite → Tools built first. Mirrors the Techniques/curation
pattern over the `equipment` table.
- **`src/app/tools/page.tsx`** — list: search + data-derived category pills (from the
  `equipment_category` enum values present), concept-level only (`parent_id is null`),
  summary as one-line preview, admin "+ Add a tool" button, admin "Show archived (N)" toggle.
- **`src/app/tools/[slug]/page.tsx`** — detail, the agreed content order: breadcrumb →
  header → hero image slot (graceful "Illustration coming soon" when `image_url` empty) →
  what-it-is lead → what-it's-for + uses → **techniques it performs** (reverse-lookup
  cross-links, placed high) → specs (subordinate) → specific models (parent_id children) →
  related models (siblings) → My-kitchen pointer. Admin **Archive/Unarchive + Edit** controls
  top-right.
- **`src/app/tools/[slug]/edit/page.tsx`** — full edit form, fixed bottom save bar (right:0),
  `content_reviewed` toggle, save returns to view page. (Archive control REMOVED from here in
  the cleanup pass — now lives only on the detail page, matching Techniques.)
- **`src/app/tools/new/page.tsx`** — "Add a tool": name → auto-slug (override) → category
  dropdown (real enum) → optional summary → creates + redirects into edit. Minimal-create-
  then-edit pattern.
- **API:** `src/app/api/tools/[slug]/route.ts` (GET: tool + parent/siblings/children +
  technique reverse-lookup); `src/app/api/admin/equipment/route.ts` (POST create, slugify,
  dup-slug 409); `src/app/api/admin/equipment/[id]/route.ts` (PATCH edit + archive via
  `archived` boolean → `archived_at`).
- **The tool→technique cross-link** is a REVERSE LOOKUP: verified tasks whose
  `suggested_tool_slugs` contains this tool's slug. The DB jsonb `.contains()` operator
  proved UNRELIABLE (column-type ambiguity) → fetch verified tasks (~30) and match in JS,
  normalising the value (array / JSON string / PG array literal). Works reliably now.

### Techniques/tasks — parity (create + archive added)
- **`src/app/api/admin/tasks/route.ts`** (NEW) — POST create. Requires name + slug +
  **family** (the one NOT-NULL-no-default column). **ALSO sets `category`** (defaults to
  `family`) — see the category bug below. Starts unverified (draft).
- **`src/app/api/admin/tasks/[id]/route.ts`** — existing PATCH, now also handles `archived`.
- **`src/app/techniques/new/page.tsx`** — "Add a technique": name + slug + family + optional
  description → create + into edit. (Was first MISPLACED at `techniques/[slug]/new/` by the
  flat-file hazard; moved to correct `techniques/new/`.)
- **`src/app/techniques/page.tsx`** — admin "+ Add a technique" button, **"Drafts only (N)"**
  filter (curation queue), "Show archived (N)" toggle, archived rows filtered + badged.
- **`src/app/techniques/[slug]/page.tsx`** — Archive/Unarchive control next to Edit (admin).
- **Verify/publish toggle ALREADY EXISTED** on the technique edit page (`is_verified`
  checkbox). Cleanup pass made it PROMINENT: a bordered box reading "Publish this technique"
  / "Published — verified". To publish a draft: open → Edit → scroll down → check → Save.

### Archive model — SOFT-DELETE, no hard delete in the UI (deliberate decision)
For a connected knowledge graph, hard delete is dangerous (orphans child models, breaks
technique cross-links). Decision (researched against how Wikipedia/big content systems work
— soft-by-default, true-erase reserved & still recoverable): **archive is the only removal
action in the UI; hard delete deferred to a possible future backend cleanup job, NOT a
button.**
- **Migrations RAN LIVE:** `tools_03_archive.sql` (equipment.archived_at) and
  `techniques_01_archive.sql` (tasks.archived_at) — each adds `archived_at timestamptz` +
  index + `grant all ... to authenticated`.
- Archiving rides on the existing `*_admin_update` RLS policies (it's an UPDATE of
  archived_at) — no new policy needed.
- Read paths filter `archived_at is null` by default; admin "Show archived" toggle reveals
  them; Unarchive restores. Lifecycle is now: **draft (is_verified=false) → verified/live →
  archived.**
- RLS policies added earlier this session for equipment admin write:
  `equipment_admin_update`, `equipment_admin_insert`, `equipment_admin_delete` (the
  insert/update/delete-needs-its-own-policy lesson, public-scoped, account-id-gated).

### Cleanup pass (end of session)
- Removed stale `src/app/equipment/page.tsx` ("Equipment — coming soon" stub; real page is
  `/tools`). Fixed the Sidebar "Tools" nav link (`/equipment` → `/tools`).
- De-duplicated the Tools archive control (removed from edit page; detail page only).
- Made the technique verify/publish toggle prominent.
- Category backfill: `update tasks set category = family where category is null;` (RAN).

## ⚠️ BUGS & LESSONS THIS SESSION
1. **New code selects a column the migration didn't add yet → BLANK PAGE.** Hit TWICE
   (tools, then techniques): deploying a list/detail page that `.select(...archived_at...)`
   before running the archive migration makes the query error and the page goes empty. Also
   caused "stuck after create" (the redirect target's detail API errored). RULE: run the
   migration BEFORE (or with) deploying code that reads the new column. (Same family as the
   `source_extraction` trap from the prior session.)
2. **The `category` invisibility bug (real, fixed).** The techniques LIST groups/filters by
   `tasks.category`, but the create form only set `family`. A technique created with
   `category = null` EXISTED but was INVISIBLE on the list (e.g. "CVap" — found via SQL,
   total stayed 95). Fix: create route now sets `category` (defaults to `family`); backfill
   SQL fixes existing rows. ROOT CAUSE is schema cruft — `tasks` has THREE overlapping
   grouping columns (`family`, `task_family`, `category`) that aren't kept in sync.
3. **person id ≠ account id** (restated, bit us again on admin gates): `auth.uid()` returns
   the ACCOUNT id (bb02ae50… / 1a0f72df…), NOT Rasmus's person id (b6a30271…). Admin
   gates/RLS use account ids.
4. **`.contains()` on jsonb is unreliable** for slug-array matching across column-type
   variants → fetch-and-match-in-JS for small verified sets.
5. **Flat-file `--`-to-folder delivery still bites:** the new-technique page landed in the
   wrong folder (`[slug]/new` vs `new`). Always verify the first-line path comment matches
   the placed folder.
6. **Many symptoms this session were the unstable China connection**, not bugs ("Slow
   network detected" in console; SSL/TLS handshake push failures). When something looks
   broken, check the connection/VPN before assuming a code bug.

## SCHEMA CRUFT — FLAGGED FOR A DEDICATED SESSION (do NOT do as casual cleanup)
- **Overlapping task grouping columns** `family` / `task_family` / `category` — cause of the
  invisibility bug. Consolidate to one. Needs data migration + every read/write path updated
  + dry-runs. NOT a quick fix.
- **Duplicate RLS policies on `tasks`** — 3 INSERT, 4 SELECT, 2 UPDATE accumulated across
  sessions. Working (permissive RLS) but should consolidate to one clear policy per action;
  must confirm which are load-bearing (e.g. the decompose insert path) before dropping any.
- **Category free-text drift** — per the knowledge-layer doc §5c, the plan is intentional:
  free-text now → freeze into a controlled vocabulary (deliberate creation form) once the set
  has settled → maybe m2m later. The drift (e.g. "thermal state change", 1 item) is the
  signal it's settling, not a bug. Guardrail added: create now defaults category so no row
  lands category-less.

## DESIGN DOCS — POINTERS (produced earlier this session; handover now points at them)
- **`docs/Soupdog_Knowledge_Section_Roadmap_And_Visual_Strategy_v0_3.md`** — reader-facing +
  production side of the knowledge section. v0.2 added the **VALIDATED visual system** (tested
  with real AI renders): TOOLS = engraved B&W Haynes/patent 3/4 illustration (color not
  identity-carrying); INGREDIENTS/DRINKS = color editorial photo on off-white #f5f3ee (color
  CARRIES identity — engraved butter was illegible, color butter/lemon/parmesan/guanciale
  instantly readable); TECHNIQUES = HYBRID (color doneness-state still as hero, engraved
  action for method; multi-stage doneness is a strong format). Reusable prompt recipes
  embedded. Concept = AI-gen; specific branded product = REAL photo. Lock one engine per
  section to avoid drift. v0.3 added §9 the **dietary-fit content area** (a 2nd content spine,
  the meal-planning reasoning as reading): Nutrients (build first, best home for data-graphs)
  → Allergies (informational-not-medical guardrails) → Religious/ethical (highest curation
  bar, attribute variation, human-reviewed) → Diets (descriptive only, lower priority).
  Print role models: Le Répertoire (terse/expert register) vs Larousse/McGee (deep) as two
  reading registers over one entry; Haynes for tools; Pépin for techniques; Flavor Bible for
  affinities. Discard superseded v0_1/v0_2 copies.
- Culinary Knowledge Layer v0.5 and Variation/Content-Pipeline v0.1 unchanged.

## NEXT SESSION — options
- **The content/curation pass** (the payoff): use "Drafts only" to work the queue — fill the
  ~13 referenced tools (frying-pan, saucepan, chefs-knife, whisk, mixing-bowl, grater, tongs,
  spoon, spatula, chopping-board, roasting-tin, conventional-oven, ladle) and bless the ~60
  draft techniques. Content work; doable solo at your pace.
- **Visual content production**: generate hero illustrations (tools, engraved) + ingredient
  photos per the validated prompt recipes; ops pass, not a build.
- **Schema-cruft consolidation** (own session, careful, dry-runs): the three task grouping
  columns + duplicate RLS policies.
- **STEP BACK TO REVENUE (untouched this whole session):** meal-plan enforcement + Stripe;
  Demand Phase 2 (ask/habits + running balance; settle Doc A §11 opens); Sharing & Delegation
  Phase 0 (settle v0.2 §8 opens); Plan & End-Product bridge. HONEST NOTE: the knowledge
  section has absorbed a lot; this is the work that makes it a business and it hasn't moved.

## SMALL BACKLOG (carried / minor)
- Route rename `/api/admin/equipment` → `/api/admin/tools` (cosmetic; touches 4 callers in
  lockstep; skipped as poor risk/reward — left working as-is).
- Header avatar stale-until-hard-refresh (minor, pre-existing).
- "Add new" for ingredients/products (tools + techniques have it now).
- Tools page in recipe step-instructions (engraved style; untested idea).
- Re-import ~34 existing recipes through decompose; delete test carbonaras.
- npm xlsx vulns → migrate to SheetJS CDN dist (don't --force).
- Saved-recipe folders; manual-add barcode fallback when OFF returns nothing; reader
  view-mode toggle (the two-registers idea); skill-building loop; personal inventory
  ("My kitchen / Blue pot" — the generic-vs-personal surface where same-name dupes are
  allowed; public catalogue stays slug-unique).

# SESSION UPDATE — 2026-06-09 — Tools section; Techniques parity; archive model; account/nav; IMAGE PIPELINE

A long multi-part session. Built the knowledge-section curation surface to completion
(Tools + Techniques: create/read/edit/publish/archive), restructured account & nav,
fixed sign-out, and built the **image upload pipeline** (Supabase Storage + resize/WebP +
drag-and-drop). All SHIPPED & VERIFIED on prod unless marked. This entry supersedes the
earlier-in-session draft and includes the image work that came after it.

## SHIPPED & VERIFIED (prod, tested live)

### Tools section — BUILT end-to-end (over the `equipment` table)
Tasks reference tools (`tasks.suggested_tool_slugs`), so tools had to exist before task
curation. Mirrors the Techniques/curation pattern.
- `src/app/tools/page.tsx` — list: search + data-derived category pills, concept-level only
  (`parent_id is null`), admin "+ Add a tool", "Show archived (N)" toggle.
- `src/app/tools/[slug]/page.tsx` — detail (hero image slot → what-it-is → uses → techniques
  it performs (reverse-lookup) → specs → models/siblings). Admin Archive/Unarchive + Edit.
- `src/app/tools/[slug]/edit/page.tsx` — full edit; fixed bottom save bar; content_reviewed
  toggle. **Hero image = ImageUpload component** (was URL-paste). Archive control removed
  here (now detail-only).
- `src/app/tools/new/page.tsx` — "Add a tool": name → auto-slug → category dropdown
  (equipment_category enum) → optional summary → create + into edit.
- API: `src/app/api/tools/[slug]/route.ts` (GET + technique reverse-lookup, archived filtered);
  `src/app/api/admin/equipment/route.ts` (POST create, dup-slug 409);
  `src/app/api/admin/equipment/[id]/route.ts` (PATCH edit + archive).
- Tool→technique cross-link = REVERSE LOOKUP: verified tasks whose suggested_tool_slugs
  contains the slug. jsonb `.contains()` UNRELIABLE → fetch verified tasks + match in JS.

### Techniques/tasks — parity (create + archive)
- `src/app/api/admin/tasks/route.ts` (NEW) — POST create. Requires name + slug + **family**
  (NOT-NULL no-default). **Also sets `category`** (defaults to family — see category bug).
  `image_url` added to the PATCH whitelist in `tasks/[id]/route.ts`.
- `src/app/techniques/new/page.tsx` — "Add a technique" (was misplaced at `[slug]/new`, moved).
- `src/app/techniques/page.tsx` — admin "+ Add a technique", **"Drafts only (N)"** filter,
  "Show archived (N)" toggle.
- `src/app/techniques/[slug]/page.tsx` — Archive/Unarchive next to Edit; **renders hero image**.
- `src/app/techniques/[slug]/edit/page.tsx` — PROMINENT publish toggle (bordered box
  "Publish this technique" / "Published — verified"); **hero image upload field**.

### Archive model — SOFT-DELETE only in UI, no hard delete (decision)
Hard delete is dangerous for a connected graph (orphans children, breaks cross-links).
Decision: archive is the only UI removal; hard delete deferred to a possible future backend
job, never a button. Migrations RAN LIVE: `tools_03_archive.sql`, `techniques_01_archive.sql`
(each: `archived_at timestamptz` + index + grant). Rides on existing `*_admin_update` RLS.
Lifecycle: draft (is_verified=false) → verified/live → archived.

### Account & navigation restructure
Principle settled: **sidebar = the product** (recipes/plan/people/ingredients);
**avatar menu = me & account** (profile/membership/usage/sign out).
- `src/components/layout/Header.tsx` — avatar is now a DROPDOWN menu (Profile · Account &
  membership · Usage · Sign out). Closes on outside-click/Escape. Also re-fetches the avatar
  on a `soupdog:profile-updated` window event (fixes stale-until-refresh).
- `src/app/my/account/page.tsx` (NEW) — account/membership front door: plan card (reads
  `/api/my/usage`), usage bar, upgrade→/pricing, **sign-in methods** (reads
  `user.app_metadata.providers`, maps azure→Microsoft/google→Google/apple→Apple; DISPLAY ONLY,
  no link/unlink UI — only Microsoft sign-in is actually built). Honest pre-billing framing
  via the `isPlaceholder` flag.
- `src/components/layout/Sidebar.tsx` — removed Usage (now in avatar menu). (Tools link is
  `/tools`.)
- `src/app/my/profile/page.tsx` — removed its duplicate "Account" section (now lives at
  /my/account); profile = eater-only. Dispatches `soupdog:profile-updated` on save.
- `src/lib/auth-context.tsx` — `signOut` now redirects to `/` (was leaving the user stranded
  on the now-inaccessible page).

### Cleanup pass
Removed stale `src/app/equipment/page.tsx` ("coming soon" stub; real page is /tools).
Category backfill RAN: `update tasks set category = family where category is null;`.
Two small carried fixes: header avatar refresh (above); pre-seed product into create-recipe
(`ingredients/[slug]` button passes `?product=&productSlug=`; import page prefills title + paste).

### IMAGE PIPELINE — BUILT (hosting on Soupdog, no external links) ✅ technique image verified live
- **Hosting = Supabase Storage**, public `images` bucket. Files at
  `images/<kind>/<slug>-<timestamp>.webp` (timestamp busts CDN cache on replace).
- `src/app/api/admin/upload-image/route.ts` (NEW) — admin-gated; takes multipart file,
  resizes to ≤1200px + converts to **WebP** via `sharp` (1.7MB PNG → ~80–150KB), uploads via
  the **service-role** client (past bucket RLS), returns public URL. Accepts kinds:
  techniques/tools/ingredients/recipes/meals.
- `src/components/admin/ImageUpload.tsx` (NEW) — reusable. **Drag-and-drop** (matches recipe
  import) + click-to-pick + preview/replace/remove. Wired into tools & techniques edit forms.
- `supabase/migrations/images_00_storage_bucket.sql` — creates the public bucket + read policy.
  **MUST be run; needs `npm install sharp`; needs SUPABASE_SERVICE_ROLE_KEY in Vercel (already set).**
- VERIFIED: technique hero image upload + render works live.

## ⚠️ BUGS & LESSONS THIS SESSION
1. **New code selects a column the migration didn't add yet → BLANK PAGE.** Hit twice
   (tools, techniques archive_at). Run the migration BEFORE/with deploying code that reads it.
2. **The `category` invisibility bug.** Techniques list groups/filters by `tasks.category`,
   but create only set `family` → a technique with category=null EXISTED but was INVISIBLE
   (found "CVap" via SQL; total stayed 95). Fixed: create sets category (defaults to family) +
   backfill. ROOT CAUSE = three overlapping grouping columns (family/task_family/category).
3. **person id ≠ account id.** `auth.uid()` = ACCOUNT id (bb02ae50… / 1a0f72dd…), not Rasmus's
   person id (b6a30271…). Admin gates / RLS use account ids; env `SOUPDOG_ADMIN_ACCOUNT_IDS`.
4. **jsonb `.contains()` unreliable** for slug-array matching → fetch-and-match in JS.
5. **Flat-file `--`-to-folder delivery** misplaced the new-technique page → 404. Verify the
   first-line path comment matches the placed folder.
6. **Account linking is real:** rr@le.works has `providers: [email, azure]` (Microsoft + email
   on one account). Worked correctly here; provider-linking has edge cases for later (OAuth
   email vs signup email).
7. **Connection (China/VPN) caused several false alarms** — "blank" pages, `schannel
   handshake failed` push fails. NOT bugs. Check VPN/connection first.
8. **Vercel missed-webhook fix:** when GitHub has a commit but Vercel didn't auto-deploy it,
   push an EMPTY commit (`git commit --allow-empty -m "nudge" && git push`) to re-trigger.
   (Worked this session.) The `git: 'credential-manager-core' is not a git command` line is a
   harmless warning, not a failure.

## SCHEMA CRUFT — FLAGGED FOR A DEDICATED SESSION (NOT casual cleanup)
- Overlapping task grouping columns `family`/`task_family`/`category` (cause of bug #2).
  Consolidate to one; needs data migration + every read/write path + dry-runs.
- Duplicate RLS policies on `tasks` (3 INSERT / 4 SELECT / 2 UPDATE). Consolidate; confirm
  load-bearing ones (decompose insert) before dropping.
- Category free-text drift is INTENTIONAL per knowledge-layer §5c: free-text now → freeze to
  controlled vocabulary (deliberate creation form) → maybe m2m. Drift = the settling signal.

## DESIGN DOCS (in docs/) — pointers
- `Soupdog_Knowledge_Section_Roadmap_And_Visual_Strategy_v0_3.md` — VALIDATED visual system
  (TOOLS = engraved B&W; INGREDIENTS/DRINKS = colour photo on #f5f3ee, colour carries identity;
  TECHNIQUES = hybrid doneness-still + engraved action) + §9 dietary-fit content area
  (Nutrients → Allergies → Religious/ethical → Diets). Reusable prompt recipes embedded.
- Culinary Knowledge Layer v0.5; Variation/Content-Pipeline v0.1 (unchanged).

## NEXT SESSION — RECOMMENDED STEPS (in priority order)
1. **Finish the image work's loose ends:** confirm `npm install sharp` + the bucket SQL ran
   and the build is green; then decide on **AI image generation in-app** — the natural next
   build now the pipeline exists. It calls an image model with the already-validated prompts,
   then POSTs the result through the same upload route → bucket. Run it as a POST-VERIFY "step
   2" action (cost-gated, never in the live edit loop), per the variation-gen discipline.
   (Image gen is a DIFFERENT API/provider than the text models in `src/lib/ai/anthropic.ts` —
   separate cost line, slow 10–30s, should be usage-logged like text.)
2. **Ingredient edit page** (if ingredient images/edits wanted): ingredients have NO edit
   surface at all today (only `/my/ingredients/new` create; OFF auto-fills images for barcode
   products). Build an admin-gated `ingredients/[slug]/edit` + PATCH route mirroring tools/
   techniques; the ImageUpload + pipeline (kind='ingredients') are already ready to drop in.
   It's really "build the ingredient editor" — a real surface, not a quick add.
3. **Content/curation pass** (the payoff): use "Drafts only" to bless the ~60 draft techniques;
   fill the ~13 referenced tools; upload hero images (now possible). Solo-doable.
4. **THE REVENUE TRACK (untouched for several sessions — flag honestly):** meal-plan
   enforcement + Stripe (plan column, checkout, credit_ledger, balance gate in
   `src/lib/ai/anthropic.ts`); Demand Phase 2 (settle Doc A §11 opens); Sharing & Delegation
   Phase 0 (settle v0.2 §8 opens); Plan & End-Product bridge. This is the work that makes it a
   business; the knowledge section has absorbed many sessions.
5. Schema-cruft consolidation (own careful session — see above).

## DISPLAY WORK DEFERRED (designed-intent, build against real images later)
Recipe tool hero-shots in steps; ingredients/tools in a recipe revealing info on CLICK
(popup, not navigate-away — keeps the calm aesthetic); meal images (can go inline since the
meal page is otherwise sparse). Don't build until images exist to design against.

## SMALL BACKLOG (carried / minor)
- Old images not deleted on replace (timestamped; old file orphaned in bucket) — prune later.
- Tools edit page once had a duplicate archive control (removed); fully consistent now.
- Route rename `/api/admin/equipment` → `/api/admin/tools` (cosmetic; 4 callers lockstep; skipped).
- npm xlsx vulns "no fix available" → migrate to SheetJS CDN dist (don't --force).
- Re-import ~34 existing recipes through decompose; delete test carbonaras.
- Header avatar cross-tab edge (event approach doesn't cover other tabs); saved-recipe folders;
  barcode manual-add fallback when OFF returns nothing (China/SE-Asia thin); reader view-mode
  toggle (two-registers); skill-building loop; personal inventory ("My kitchen / Blue pot" —
  generic-vs-personal: public catalogue slug-unique, personal allows same-name dupes).

## DELIVERY / WORKFLOW REMINDERS (for the next chat)
- Rasmus works from China via Clash Verge TUN VPN (required for GitHub + Anthropic API).
  No real users yet → live data changes are safe.
- **File delivery:** Claude zips WHOLE files with `--` as the folder separator in the filename
  (e.g. `src--app--tools--page.tsx` → `src/app/tools/page.tsx`). Rasmus downloads, extracts,
  places manually. Deliver complete drop-in files, never partial edits. Every file's first
  line is its real path comment (or `'use client'` then the path) — verify placed folder
  matches it. Never PowerShell in-place edits on TSX (corrupts them).
- **SQL** is run manually in the Supabase SQL editor (autocommit; no bare BEGIN). project id
  npvajzgciuykugqxedmm.
- **Git push (PowerShell):** clear NODE_EXTRA_CA_CERTS / NODE_TLS_REJECT_UNAUTHORIZED /
  HTTPS_PROXY; `git remote set-url origin https://github.com/rasmusrasmusson/soupdog.git`;
  Clash TUN ON; `git push`. Bracket paths `[id]`/`[slug]` are PowerShell globs — quote them or
  use `git add -A`. Vercel auto-deploys on push to main; if it misses, empty-commit nudge.
- Claude's esbuild check (transform-only, NOT full Next type-check):
  `npx --yes esbuild FILE --bundle --loader:.ts=ts --loader:.tsx=tsx --jsx=automatic
  --external:react --external:next --external:lucide-react --external:@/* --format=esm
  --outfile=/dev/null`. Passing esbuild ≠ green Vercel build; watch the first deploy.
- Stack: Next.js 16, TS, Tailwind v4, Supabase/Postgres, Vercel (syd1, auto-deploy on main).
- To give Claude current code: zip the `src/` folder and upload it (the live DB is
  authoritative; schema.sql in repo is a partial snapshot).

## 2026-06-14 — AI compose + design arc
- SHIPPED: AI compose meal feature — route `src/app/api/my/meals/[id]/compose/route.ts`
  (Slice A) + `src/components/meal/MealComposer.tsx` wired into the meal editor (Slice B).
  Working & deployed. Selection-not-invention; grounded butler.
- SHIPPED: meal recipe view ingredient table (CombinedIngredients) matching RecipeDisplay.
- DESIGN NOTES added to /docs (design-only, parked — downstream of atomic decomposition):
  - Skill_Aware_Cooking_Together_v0.2 (canonical; 0–3 competency scale settled)
  - Active_Cooking_Sessions_v0.1 (resumable multi-device session; Layer 1 = next buildable)
  - Consumption_Tracking_v0.1 (plan-as-default-log)
  - TODO: Behavioral_Data_And_Insights note (not yet written)
- NEXT: (1) test AI compose vs real catalogue; (2) build resumable session Layer 1 (schema first).
- See HANDOVER_next_chat_2026-06-14.md for full detail.

# Soupdog — Session Handover · 2026-06-20

Read this first, then the big standing HANDOVER.md for full project context. This
records what changed THIS session and what's next.

## Standing context (unchanged)
Solo founder Rasmus; soup.dog; Next.js 16 / Supabase (npvajzgciuykugqxedmm) / Vercel
(auto-deploy on push to main). Rasmus in EUROPE now (no VPN needed; AI works). No real
users (safe to change live data). File delivery: Claude creates whole files with `--`
path separators; Rasmus places manually in VS Code; `[id]`/`[slug]` segments stay literal.
First line = real path comment. SQL run manually in Supabase SQL editor (autocommit-safe,
idempotent). `tasks` has per-column grants — after adding columns, re-grant
`grant all on tasks to authenticated; grant select on tasks to anon;`. Admin ACCOUNT ids
(not person id): bb02ae50-436c-4402-8c8c-447344e10151 (rr@varm.io),
1a0f72dd-f0a7-487c-9ecd-7ef898f8dabf (rr@le.works).

## SHIPPED + VERIFIED LIVE this session

### Concept matcher (C) — deterministic post-match specialisation
`decompose-save/route.ts` now swaps a generic matched task for a bound CONCEPT when the
step's ingredient/tool matches. `specialiseTask(db, genericTaskId, ingredientId, toolSlug,
cache)`: loads concepts (parent_task_id = generic), scores +2 ingredient / +1 tool,
DISQUALIFIES any concept binding a dimension the step doesn't match (so "Zest a lemon"
can't land on an orange step), most-specific wins, no match → generic unchanged. Loop
restructured: resolve ingredient FIRST, specialise, insert step with specialised task_id,
then insert the version_ingredient. Runs ONLY at import time. The AI's matching is
UNCHANGED — specialisation is a deterministic post-step, so normal matching is never
disturbed (the design risk we were protecting against). VERIFIED: aglio e olio linked
"Zest a lemon" instead of generic "Zest".

### Instruction composition LAYER 1 — curated wording + display templates (web + PRINT)
Two concerns Rasmus raised about AI-written step text: (#1 metric-vs-imperial units, #2
AI wording drift vs curated content). Split: did #2 now, scoped #1 (units) separately.

- Step lines now render the CURATED task name / a display_template at RENDER time, not the
  frozen AI-built `instruction`. Falls back to instruction for steps with no task.
- **`display_template`** (text) + **`single_tool`** (bool) columns added to `tasks`
  (`template_00_task_display_template.sql`, RAN LIVE + re-grants). A template carries
  `[ingredient]` / `[tool]` tags, e.g. "Add [ingredient] to the [tool]", "Zest
  [ingredient]", "Bring to a boil". At render, tags fill from the step's ingredient/tool.
  `[tool]` fills ONLY when single_tool=true AND a tool is present; an unfillable `[tool]`
  is stripped along with its preposition ("to the [tool]" → gone). Ingredients/quantities
  are shown SEPARATELY by each layout (pills/columns), so the line is just the verb phrase
  (not repeated qty).
- Editable in the technique edit form: Display template field + Single-tool checkbox.
- PATCH route whitelist + coercion extended (display_template empty→null, single_tool→bool).
- Recipe page selects `tasks(name, display_template, single_tool)` and maps onto each step
  as taskName/taskTemplate/taskSingleTool. `types/index.ts` RecipeStep gained those 3.
- **PRINT/PDF (`RecipePrintLayout.tsx`) now uses the SAME composeStepLine** — web and PDF
  match. VERIFIED: arrabbiata step 13 reads "Add spaghetti to the large-pot" on BOTH.

## ⚠️ KEY LESSONS THIS SESSION (cost real time)

1. **Web and PDF are TWO separate renderers.** RecipeDisplay (web) and RecipePrintLayout
   (PDF) are different code paths. A display-layer change must update BOTH or they drift.
   The long [tool] debug was a renderer mismatch: the WEB was fixed and correct the whole
   time; Rasmus was comparing against the PDF, which still printed raw `instruction`.
   **When web and PDF disagree, check which renderer you're looking at FIRST.**

2. **Web and PDF link step→ingredient DIFFERENTLY.** The mapper links ingredients to steps
   via `ing.stepId` (NOT a `step.ingredients` id-array). RecipeDisplay uses stepId (works);
   RecipePrintLayout originally assumed `s.ingredients` (always empty → `[ingredient]`
   stripped → "Add to the large-pot"). Fixed print to build `ingsByStepId` from
   `ing.stepId` like the web. BACKLOG: have the mapper populate both, or have print reuse
   the web's exact map-building, so they can't drift again.

3. **The `[slug]` PowerShell glob trap (recurring).** `Select-String -Path
   "src\app\recipes\[slug]\page.tsx"` returns a FALSE NEGATIVE (brackets = wildcard). Use
   **`-LiteralPath`**. This sent the [tool] debug down a wrong path ("file is stale!" when
   it wasn't). Same glob risk in `git add` — use `git add -A`.

4. **`console.log` debug confirmed the data was always correct** (singleTool:true,
   toolName:'large-pot', ingredientName:'spaghetti') — the bug was purely the PDF renderer.
   console.log has been REMOVED from RecipeDisplay; don't leave it live.

## FILES SHIPPED (all placed + pushed + verified)
- `template_00_task_display_template.sql` (RAN)
- `src/app/api/recipes/decompose-save/route.ts` (concept matcher C)
- `src/app/api/admin/tasks/[id]/route.ts` (PATCH whitelist: display_template, single_tool)
- `src/app/techniques/[slug]/edit/page.tsx` (template field + single-tool checkbox)
- `src/app/recipes/[slug]/page.tsx` (join + map taskName/taskTemplate/taskSingleTool)
- `src/components/recipe/RecipeDisplay.tsx` (composeStepLine; console.log removed)
- `src/components/recipe/RecipePrintLayout.tsx` (same composeStepLine; stepId-based ings)
- `types/index.ts` RecipeStep: taskName?, taskTemplate?, taskSingleTool? (one-line adds)

## OPEN THREADS / NEXT (all design-settled or scoped; pick fresh)

- **Instruction composition LAYER 2 — intermediate materialization (the meaty one).**
  Bare "Add" steps that CONSUME an upstream intermediate (e.g. add the chopped onion from
  the Chop step) still show bare "Add" / "Add to the [tool]" because the intermediate isn't
  on the step as an ingredient. DECISION REACHED: every transforming step PRODUCES a new
  ingredient (Ingredient-Process Model, transformed_from_id); decomposition should
  materialize intermediates and thread them onto consuming steps, so [ingredient] fills
  "Add the chopped onion". NO per-ingredient Add tasks (one Add task; ingredient is data).
  Touches the decomposition pipeline (feeds every recipe) → its own focused session with
  eval discipline. Layer 1 templates are the ready foundation (the template will name the
  intermediate the moment layer 2 puts it on the step).

- **Units (#1) — separate display-layer build.** RecipeDisplay does NO unit conversion;
  prints raw metric in table AND steps. Doing it properly = a unit-system layer (si/imperial/us
  from profile) across table + steps, with culinary rules (weight vs volume, counts don't
  convert, sensible rounding). Its own piece; don't bolt a half-version onto just the step
  line (would make the page inconsistent).

- **Tool-slug humanizing (small).** Tools render as slugs ("large-pot") in composed lines.
  "Add spaghetti to the large-pot" reads a bit technical. Small follow-up: replace hyphens /
  title-case the tool name in composition (both RecipeDisplay + RecipePrintLayout).

- **Concept-name redundancy (minor).** A concept whose name embeds its ingredient ("Add
  spaghetti") + the ingredient pill ("spaghetti") is slightly redundant. Argument for the
  optional display_template on concepts (show just the parent verb in-line). Note, not urgent.

- **Re-import the ~34 existing recipes** to pick up concept matching (C runs import-time
  only) AND eventual layer-2 intermediate naming. Do ONCE after layer 2, not twice.

- **Mass content + blessing the ~62 draft tasks** — Rasmus's dedicated future session.

- **Backlog:** re-add bound_ingredient_id FK (standalone, was dropped to plain uuid to get
  the concept batch to run); hero-via-role media unification; the mapper-populates-both
  fix (lesson #2 above).

## STILL PARKED (unchanged)
Meal-plan enforcement + Stripe; Demand Phase 2; Sharing & Delegation Phase 0; Plan &
End-Product bridge; Cook Mode.

# SESSION UPDATE — 2026-06-21 (Layer 2 intermediates · tool/qty display fixes · archive-leak closure)

Continuation of the decomposition display work. After concept matching + instruction
composition Layer 1, this arc shipped Layer 2 (intermediate materialization) plus a
batch of display-honesty fixes and closed an archive-visibility leak across three
surfaces. All SHIPPED & verified live unless noted.

## SHIPPED — code (pushed, builds green, verified on live)
- **Layer 2 — intermediate materialization (web + PDF).** Combine/transform steps that
  consume an upstream intermediate (and carry no own ingredient by design) now fill the
  [ingredient] slot from `version_step_dependencies.consumes_intermediate_label` (already
  written at save time). "Add" → "Add the diced onion and hot oil"; "Toss" → "Toss the
  reserved pasta water and egg and cheese mixture". Fuller scope: multi-input convergence
  joined ("a, b and c"), "the"-prefixed for intermediates, own-ingredient (with qty) wins
  the slot when both present. Implemented as `attachIntermediates()` in
  `recipes/[slug]/page.tsx` — a FLAT query keyed on the step ids we already have, NOT a
  nested embed (version_step_dependencies has two FKs to version_steps → nested embed is
  FK-alias-fragile; flat query leaves the critical every-recipe main query untouched).
  New `RecipeStep.consumedIntermediates?: string[]`. composeStepLine updated identically
  in BOTH RecipeDisplay.tsx and RecipePrintLayout.tsx (the two renderers must stay byte-
  identical in that function). NO migration, NO AI/decomposition change — the data was
  already there.
- **Tool-slug humanizing.** Shared `humanizeTool()` (hyphens→spaces, lowercase kept)
  applied at every point a slug becomes visible text — the [tool] fill, the per-step tool
  cell, and the recipe-level/mise-en-place tool list — in both renderers. "frying-pan" →
  "frying pan".
- **Qualifier quantities (no more "0 g").** Shared `fmtAmount`/`fmtQty`: a qualifier unit
  ("to taste", "as needed", "to serve", "for garnish", "for serving") renders the
  qualifier in the Qty column with a blank Unit; a real unit with value 0/null renders
  "—" (web) / nothing (print) — never a meaningless "0 g". Applied at all qty render
  sites in both renderers. Save layer (`decompose-save/route.ts`) no longer fabricates:
  `ing.unit ?? 'g'` → `ing.unit?.trim() || null` (the grams-fabrication was the "Salt 0 g"
  root cause; qty kept as `?? 0` for the column default, display interprets it).
- **Archived recipes excluded from the AI duplicate-check catalogue.** `recipes/generate/
  route.ts` catalogue query gained `.is('archived_at', null)` — archived recipes were
  triggering "you already have this" and looping the create-with-AI flow.

## SHIPPED — SQL (run on prod, verified)
- **2 genuine qty-0 slips corrected** (`fix_qty_zero_slips.sql`): garlic-butter-pasta Salt
  → "to taste", lemon-curd Water → "as needed". (The many other "to taste" rows were
  already correct in data — only the display was wrong; the code fix covers them.)
- **search_index view now filters archived recipes** (`fix_search_index_archived.sql`):
  the recipe branch filtered `is_published` but not `archived_at`. Archiving does NOT
  unpublish (it only sets archived_at + drops the `recipes` mirror), so published-and-
  archived recipes kept matching search AND the Ask Soupdog panel (both read this view).
  Added `AND rc.archived_at IS NULL` to the recipe branch only; other branches untouched.

## VERIFIED end-to-end
Greek Salad (old `greek-salad-mpw6vfin`) had lost all 7 quantities (wholesale parse
failure) → archived it → regenerated via create-with-AI as `greek-salad-mqnfd723`. New
copy has real quantities (tomatoes 400 g, olives 16 piece, feta 200 g), qualifier amounts
("Salt · 1 pinch", "Black pepper · to taste"), Layer 2 intermediates ("Add the tomato
chunks", "Add the tossed salad base and dressing"), humanized tools. All three display
fixes confirmed on one fresh recipe.

## OPEN THREADS / NEXT
- **Archive invariant (name the seam).** Archiving leaves `is_published = true`, so every
  read surface must separately remember `archived_at is null`. We've now patched three
  leaks (the `recipes` mirror delete, the generate catalogue, the search_index view) —
  but any FUTURE query filtering only on `is_published` will re-leak archived recipes.
  Durable fix: flip `is_published = false` on archive (in the DELETE/archive handler), OR
  standardize a single "visible" predicate, so the invariant lives in one place. Not
  urgent; the three live leaks are closed.
- **Decomposition-quality quirks (prompt-side, not display).** Surfaced on regenerated
  Greek Salad, none blocking: (a) occasional null-producer bare-combine steps ("Add to
  the large bowl" with no intermediate — the producer node emitted no `produces` label,
  so Layer 2 has nothing to thread); (b) ingredient name + qualifier doubling ("ripe
  tomatoes, ripe"). Same family as the earlier apparatus-as-intermediate cases (bain-
  marie, hot pan modelled as consumed intermediates). All belong to decomposition prompt
  quality, not the display layers.
- **Layer 3?** Intermediate materialization Layer 2 is done. Next decomposition-display
  step (if continuing the arc) is whatever was sequenced after Layer 2.

  # SESSION UPDATE — 2026-06-21 (Layer 2 · display fixes · archive-leak closure · technique-form clarity · re-specialise tool)

A long session continuing the decomposition-display arc, then branching into an
archive-visibility bug, a UX clarity fix, and a new admin tool for re-binding existing
recipes to newer concepts. All SHIPPED & verified live unless marked. Heavy debugging
on the re-specialise tool surfaced two permanent lessons (see KEY LESSONS).

## SHIPPED — code (pushed, builds green, verified live)

### Layer 2 — intermediate materialization (web + PDF)
Combine/transform steps that consume an upstream intermediate (and carry no own
ingredient by design) now fill [ingredient] from
`version_step_dependencies.consumes_intermediate_label` (already written at save time).
"Add" → "Add the diced onion and hot oil"; "Toss" → "Toss the reserved pasta water and
egg and cheese mixture". Fuller scope: multi-input convergence joined ("a, b and c"),
"the"-prefixed for intermediates, own-ingredient (with qty) wins the slot when both
present. Implemented as `attachIntermediates()` in `recipes/[slug]/page.tsx` — a FLAT
query keyed on the step ids we already have, NOT a nested embed (the dependencies table
has two FKs to version_steps → nested embed is FK-alias-fragile; flat query leaves the
critical every-recipe main query untouched). New `RecipeStep.consumedIntermediates?:
string[]`. composeStepLine updated IDENTICALLY in both RecipeDisplay.tsx and
RecipePrintLayout.tsx. NO migration, NO AI change — the data was already there.

### Display fixes (both renderers, all shared helpers kept byte-identical)
- **Tool-slug humanizing** — `humanizeTool()` (hyphens→spaces, lowercase kept) at every
  visible-slug point ([tool] fill, per-step tool cell, recipe-level/mise-en-place list).
  "frying-pan" → "frying pan".
- **Qualifier quantities** — `fmtAmount`/`fmtQty`: a qualifier unit ("to taste", "as
  needed", "to serve", "for garnish", "for serving") renders the qualifier in the Qty
  column, blank Unit; a real unit with value 0/null renders "—"/nothing — never "0 g".
  Save layer (`decompose-save`) stopped fabricating: `ing.unit ?? 'g'` → `ing.unit?.trim()
  || null` (the grams-fabrication was the "Salt 0 g" root cause).
- **Redundant-prep suppression** — `prepIsRedundant`/`displayPrep`: drop a prep qualifier
  when every word already appears in the ingredient name ("ripe tomatoes" + "ripe" → just
  "ripe tomatoes"; "feta cheese, block" + "block" → drops ", block").
- **Capitalization standard** — `capitalizeLabel` (ingredient LISTS/qty tables, first
  letter up) + `lowerInSentence` (inside instructions, first letter down: "Add red onion",
  not "Add Red onion"). Only the first char is touched, so proper-noun casing survives.

### Archive-visibility leak — CLOSED across three surfaces
Archiving sets `archived_at` + deletes the `recipes` mirror, but does NOT unpublish
(`is_published` stays true). Two surfaces ignored `archived_at`:
- **AI duplicate-check catalogue** (`recipes/generate/route.ts`): added `.is('archived_at',
  null)` — archived recipes were triggering "you already have this" and looping the
  create-with-AI flow / stuck generate.
- **search_index view + Ask Soupdog** (SQL, `fix_search_index_archived.sql`): the recipe
  branch filtered is_published but not archived_at. Added `AND rc.archived_at IS NULL` to
  the recipe branch only; other branches (ingredient/product/equipment/task) untouched.
- (The mirror delete already handled the public recipe page.)

### Technique-version form clarity (`techniques/[slug]/edit`)
The "Add specific version" form had ambiguous "Add" / "Done" buttons. Confirmed behaviour:
**Add saves the version IMMEDIATELY to the DB (independent of the page's "Save technique"
button); "Done" only collapsed the form (not a cancel — nothing to cancel, the add is
already committed).** Fix: "Add" → "Add version", inline "✓ saved" after each add, the
confirmation line now says "saved — you don't need to press Save technique", and "Done"
REMOVED (replaced by a subtle "Close" link). Helper text reworded to lead with persistence.

### Re-specialise tool — re-bind existing recipes to newer concepts (NEW)
Concept binding (Phase C `specialiseTask`) is FROZEN at decompose-save time: a step gets
the most-specific concept that existed THEN. Concepts added later (e.g. "Slice cucumber")
don't retroactively bind. New admin tool fixes this on demand:
- Endpoint `src/app/api/admin/recipes/[id]/respecialise/route.ts` — GET = dry-run (returns
  proposed changes), POST `?apply=true` = applies. Reads each step's stored ingredient_id
  + tool slug (NO AI, NO re-decompose), resolves each step's task to its GENERIC ROOT (walk
  up parent_task_id, so concept→better-concept upgrades too, never demotes), scores the
  CURRENT concept library (+2 ingredient, +1 tool; mismatch disqualifies).
- Admin-only `Re-specialise` button on the recipe page (self-gates via /api/admin/check):
  dry-run shows a diff popover ("#2 Slice → Slice cucumber"), Apply writes.
- Verified end-to-end on Greek Salad and Spaghetti all'Arrabbiata.

## SHIPPED — SQL (run on prod, verified)
- `fix_qty_zero_slips.sql` — 2 genuine 0g slips → "to taste"/"as needed".
- `fix_search_index_archived.sql` — archived recipes drop from search.
- **Parsley merge** — `merge_ingredient('51fbef5f… flat-leaf parsley' survivor,
  'bd376332… fresh flat-leaf parsley' orphan, false)`. Dry-run first; only 1
  version_ingredient re-pointed (the Arrabbiata chop step). Done so the "Chop flat-leaf
  parsley" concept matches the recipe step (see Fix-C thread below).

## KEY LESSONS (permanent — both cost real debugging time this session)
1. **An RLS-blocked UPDATE returns NO error — it silently changes 0 rows.** The
   re-specialise apply reported "Updated 2 steps" while the DB was untouched, because the
   session client (RLS-bound, no UPDATE policy on version_steps) matched zero rows and
   `if (!error) updated++` counted a phantom success. FIX: admin writes use the
   service-role client (BYPASSRLS, same as backfill-nutrition) — session client only for
   the admin GATE — and count rows via `.update(...).select('id')`, never absence-of-error.
   "No error" ≠ "it worked" under RLS. (This bit tasks earlier, now version_steps.)
2. **The TypeScript transpiler is more lenient than Turbopack.** A `d?.error ?? text || 'x'`
   (mixing ?? with || sans parens) passed the local transpile syntax-check but FAILED the
   real build ("Nullish coalescing requires parens when mixing with logical operators").
   Always fully-parenthesize ?? near ||/&&; the pre-flight check won't catch it.
   (Also recurring: the `recipes`-mirror id trap — the recipe page's `canonicalId ??
   recipe.id` fallback can hand any feature a MIRROR id, not the canonical. The
   re-specialise endpoint now resolves any id → canonical via recipe_version_id, same as
   the save/unsave fix. And the `--`-to-folder extraction produced a folder TYPO
   "recepies" → 404; verify folder spelling after placing bracket-path routes.)

## OPEN THREADS / NEXT

### Fix C — ingredient-concept matching (the real fix behind the parsley merge)
Concept binding requires an EXACT `bound_ingredient_id === step.ingredient_id` match, so
semantic near-duplicate ingredients ("fresh flat-leaf parsley" vs "flat-leaf parsley")
defeat it. Merging is a TACTICAL per-case patch (and will recur with every "fresh/large/
ripe X" variant). The principled fix: concepts bind to an ingredient-CONCEPT GROUP (the
overlapping-m2m ingredient layer already designed for DISPLAY in the recipe-model docs),
so all variants of a herb match without merges. Design-first, not a quick build. FILED.

### Archive invariant (name the seam — restated, still open)
Archiving leaves `is_published = true`; every read surface must independently add
`archived_at is null`. We've now patched the mirror (delete), the generate catalogue, and
the search_index view — but FUTURE queries filtering only is_published will re-leak.
Durable fix: flip `is_published = false` on archive, OR standardize one "visible"
predicate. Not urgent; live leaks closed.

### Decomposition-quality quirks (prompt-side, not display)
Surfaced on Greek Salad, none blocking: null-producer bare-combine steps ("Add to the
large bowl" with no intermediate — producer emitted no `produces`); apparatus-as-
intermediate ("Transfer the curd mixture and simmering water bath"). Same family;
belong to decomposition prompt quality.

### Step re-ordering for reading (prototyped, deferred BY DESIGN)
"Cut-all-then-add-all" vs cook-natural "cut-one-add-one": prototyped a dependency-
respecting re-sort on Greek Salad's real DAG — it CAN'T produce clean pairing because the
vessel-accumulation chain (each add depends on the previous) forces an order; a faithful
re-sort only interleaves with an offset (arguably worse). Forcing clean pairing would
break the DAG's honesty (claim cucumber can go in before olives). Conservative answer:
re-order ONLY when it yields unambiguous improvement — needs design + testing across
several recipe shapes. NOT a quick fix.

### Re-specialise polish (small)
After Apply the user must manually reload to see changes ("Updated N steps. Reload to see
changes."). Auto-reload / re-fetch on success would be nicer. Tiny.

### Larger, unchanged
Meal-planning enforcement + Stripe (the neglected revenue track — flagged every session,
harder to retrofit each time); Demand Model Phase 2; sub-recipe materialization; Plan &
End-Product bridge. Each its own session.

# SESSION UPDATE — 2026-06-22 (Nutrition coverage solved; repo moved off OneDrive — the real villain)

## ⚠️ ROOT-CAUSE LESSON — the repo lived inside OneDrive (cause of ~all "I pushed but nothing changed" loops)
The working copy was at `E:\OneDrive LW personal\LeWorks\Soupdog - site\2026\soupdog` — i.e. a git repo **inside a OneDrive-synced folder**. OneDrive and git were both trying to own the same files: git/VS Code would write a file, OneDrive (mid-sync, or serving a cloud copy) would shadow it, so edits silently didn't reach disk, Select-String returned 0 on files that "had" the change, and commits captured stale content despite correct commit messages. This produced an entire session of chasing a nutrition bug whose fix was simply never in the deployed code.
- **FIX APPLIED:** moved the repo to **`E:\soupdog`** (plain local disk, NOT synced). Git history + remote intact (everything was already on GitHub, so the move was zero-risk). **NEW canonical working dir = `E:\soupdog`** — the old OneDrive path is dead; update any tooling/notes that reference it.
- **DISCIPLINE going forward:** never put a dev repo in OneDrive/Dropbox/iCloud. For edits to EXISTING files, prefer in-editor edits in VS Code over the download→copy→delete→rename dance (the rename step repeatedly grabbed a stale copy). ALWAYS verify placement with `(Select-String -Path "..." -Pattern "..." -SimpleMatch).Count` and watch the editor tab's unsaved `M` indicator (an unsaved buffer reads as 0 on disk) BEFORE `git add`/commit.
- Bonus: OneDrive was also pointlessly syncing `node_modules`/`.next` (tens of thousands of files). Gone now.

## NUTRITION COVERAGE (#13) — SOLVED, Greek salad now 100%
The recipe page showed "91% ingredients covered" (was 64% at start). NOT a missing-data problem — every ingredient had nutrition. Two real causes, both fixed:

1. **Unit-not-weighable was being counted as "no data."** `unitToGrams()` returns null for `piece`/`whole` units lacking `typical_unit_weight_g`, so those ingredients were excluded from BOTH coverage AND the per-serving totals (undercounting calories). Fixed for Greek salad by setting weights (SQL, autocommit):
   - Cucumber `a0550b7a-...` = 300 g; green pepper `756bb869-...` = 120 g; kalamata olives `b9116641-...` = 4 g. (Red onion `00000311-...` already 120 g.)
   - Took coverage 64% → 91%.
2. **Qualifier units ("to taste") shouldn't count against coverage.** Black pepper `quantity_unit = 'to taste'` can't be weighed → was counted in the denominator (10/11 = 91%). Fix in `src/lib/recipe-nutrition.ts`: a module-level `QUALIFIER_UNITS` set (`'to taste','as needed','to serve','for garnish','for serving'`) + a guard `if (QUALIFIER_UNITS.has((ing.quantityUnit ?? '').trim().toLowerCase())) continue;` in BOTH loops (`calculateRecipeNutrition` AND `applyRetentionFactors`), placed right after the `quantityValue` check. Excludes qualifier-unit ingredients from the denominator entirely (not a data gap). → 100%.
   - **GOTCHA that ate hours:** the `QUALIFIER_UNITS` *const* got committed but the two `continue` *guard lines that use it* did NOT (OneDrive drift) — so the const sat unused and coverage stayed 91%. Diagnosed by adding a temporary `_debug` array to the nutrition API route and reading the running server's own per-ingredient view via `https://www.soup.dog/api/recipes/<version_id>/nutrition`, then `git show HEAD:src/lib/recipe-nutrition.ts | Select-String QUALIFIER_UNITS` which proved the deployed lib had no guard. Lesson: when source "looks right" but behaviour is wrong, check `git show HEAD:<file>` (what's actually committed) and have the running endpoint report its own state — stop reasoning from assumed data.
   - The temporary `_debug` field was REMOVED from `src/app/api/recipes/[id]/nutrition/route.ts` after diagnosis (final commit "Remove temporary _debug from nutrition route").

## DISPLAY POLISH BATCH — shipped this session (against real uploaded source after discovering working-copy drift)
Recipe view (`src/app/recipes/[slug]/page.tsx`) + shared `RecipeDisplay.tsx` + `RecipePrintLayout.tsx`:
- Dropped RECIPE ID from the meta grid; capitalize difficulty/cuisine (`cap()`); servings `.toLocaleString()`.
- Ingredient table headers: "Prep / Notes" → "Notes"; "Qty" → "Quantity" (both tables).
- Thousands separators via `.toLocaleString(undefined,{maximumFractionDigits:2})` in `fmtAmount` (RecipeDisplay), `fmtQty` (RecipePrintLayout), AND the **nutrition value cells** (page.tsx line ~401 — was a separate render path that the earlier fmtAmount fix missed; "1204.1 mg" → "1,204.1 mg").
- (Already shipped earlier, confirmed: capitalize tools, effect "→ notes" same-font/muted, middle-aligned tool cells.)
- **Tools now open a MODAL, not a page link.** New `src/components/recipe/ToolDetailModal.tsx` (mirrors `TaskDetailModal`), fetches `/api/tools/[slug]`, shows name/summary/uses/category/brand, graceful "no details yet" on 404. `ToolCell` gained an `onOpenTool` callback; `RecipeDisplay` holds `openToolSlug` state + renders the modal next to `TaskDetailModal`. Sidesteps the broken `/tools/[slug]` page.

## BACKLOG ADDED THIS SESSION
- **`typical_unit_weight_g` backfill (systemic, HIGH value).** Greek salad worked only because 3 weights were hand-set. EVERY recipe with a countable ingredient (eggs, lemons, onions in "pieces") silently drops them from nutrition totals AND coverage until this column is populated. Build an AI estimator per piece/whole ingredient, parallel to the existing nutrition backfill. Central to nutrition accuracy (butler vision). NOT built.
- **#12 nutrition → modal** — surface the nutrition section as a modal like the new ToolDetailModal/TaskDetailModal. Cheap now the pattern exists. Natural next small item.
- Salt note: salt has a nutrition object (calories 0) but its sodium contribution should be verified; zero-calorie-but-mineral-rich ingredients may have thin nutrition data — spot-check during the backfill.

## OPEN LIST (the original 14-item recipe-display list) — remaining
- #7 chef-adaptive ACTIVE TIME, #8 chef-adaptive DIFFICULTY — real features, downstream of the cooking-competency model; each its own session.
- #9 aesthetic plating (portion-SPLIT already exists on meals via MealFitPanel/platingSplit; the *beautiful-plating* generative side is unbuilt) — own project.
- #10 honest-edges / reading-order — design doc done (Soupdog_Honest_Vessel_Edges_And_Reading_Order_Design_v0_1.md); next step is BUILD Phase A (decomposition prompt rules), not more design.
- #12 nutrition modal — see backlog above (smallest next item).

## LARGER PENDING (unchanged, carried)
Stripe enforcement + checkout (revenue track, repeatedly neglected); AI cost aggregation SQL view over ai_usage_log; Fix C (ingredient-concept group matching so concepts bind to a group not an exact row id); Layer 2 instruction composition; Demand Model Phase 2; sub-recipe materialization; Plan & End-Product bridge; schema cruft consolidation; re-decompose ~34 existing recipes.

# SESSION UPDATE — 2026-06-22 (Nutrition data layer: Phase 1 + 2A + 2B shipped; ingredient dedup; two environment gremlins killed)

A long, high-output session. Took the nutrition layer from "AI estimates in a JSON
blob" to "evidence-graded, multi-source, USDA-fed, curatable, deduplicated." Also
solved the multi-hour coverage bug from the prior arc (root cause was environment,
not code) and recorded two environment lessons that had been causing phantom
"I pushed but nothing changed" loops all day.

## ⚠️ TWO ENVIRONMENT GREMLINS — READ FIRST (caused most of the day's false trails)
1. **Repo was inside OneDrive** → OneDrive shadowed git writes, edits silently didn't
   reach disk, commits captured stale content. **FIX: repo moved to `E:\soupdog`**
   (plain local disk). History + remote intact (all on GitHub). **NEW canonical working
   dir = `E:\soupdog`.** Never put a repo in OneDrive. Prefer in-editor edits; watch the
   editor's unsaved-`M` indicator.
2. **PowerShell bracket-glob false zero.** `Select-String -Path "...\[id]\..."` treats
   `[id]` as a wildcard and returns Count 0 even on a correct file. **FIX: always use
   `Select-String -LiteralPath` for paths with `[id]`/`[slug]`.** Trustworthy checks on
   bracket paths: `git status` / `git diff <file>` (they don't glob).

## NUTRITION — design doc at v0.3
`docs/Soupdog_Nutrition_Data_Sourcing_Design_v0_3.md` (v0_1, v0_2 SUPERSEDED — delete).
Spine: reuse the existing `evidence_grade` enum for nutrition (e0=AI, e1=USDA SR Legacy,
e2=USDA Foundation, e3=lab test, e4=validated); per-nutrient multi-source rows (not one
blob); USDA FoodData Central as first real population; lab tier (e3/e4) named as a future
seam. §12 = Phase-1 build state; §13 = USDA findings validated against live olive-oil data.

## PHASE 1 — evidence-graded spine (SHIPPED, verified)
- `nutrient` lookup (key/name/category/unit/display_order/fdc_nutrient_id). Phase 1 = 16
  rows; Phase 2A added 37 (→ ~53) incl. fatty-acid isomers, vitamins E/K/B, minerals.
- `ingredient_nutrient_value` (per ingredient×nutrient×source_kind: amount_per_100g, unit,
  evidence_grade, source_kind, source_ref, sample_count, measured_at). Unique
  (ingredient_id, nutrient_id, source_kind). Public RLS using(true) + grants.
- `ingredient_nutrition_current` resolved VIEW: DISTINCT ON (ingredient, nutrient) ORDER BY
  evidence_rank DESC → source-preference → measured_at DESC. (Mirrors
  target_state_rules_current.) evidence_rank: e0=0,u=1,e1=2,e2=3,e3=4,e4=5.
- Migrated old blobs → 3,146 e0/ai rows over 308 ingredients.
- Read path repointed: `/api/recipes/[id]/nutrition/route.ts` sources per-100g from the
  VIEW, not the blob. Verified: Greek salad identical numbers post-repoint (coveredPct 100,
  cal 698, sodium 1707.5). Blob KEPT as fallback relic (page client-side fallback still
  reads it); drop after Phase 2 once page fallback repointed too.

## PHASE 2A — USDA ingest engine (SHIPPED, verified on olive oil)
- `POST /api/admin/ingredients/[id]/import-nutrition` (admin-gated; body `{fdcId}`):
  fetches USDA `food/{fdcId}` server-side, maps nutrients via fdc_nutrient_id, writes
  graded rows (Foundation→e2_expert/usda_foundation, else→e1_literature/usda_sr_legacy;
  source_ref=`FDC:{id}`). Uses serviceClient() (BYPASSRLS — table is SELECT-only RLS).
  Energy unit-guarded (id 1008 + KCAL; ignore kJ 1062). Now ALSO records fdc_id +
  fdc_matched_at on the ingredient.
- `USDA_FDC_API_KEY` lives in Vercel env (rotate the key pasted in chat earlier — treat as
  burned). USDA free data.gov key, ~1000 req/hr.
- VERIFIED: olive oil FDC 171413 ("Oil, olive, salad or cooking", SR Legacy) → 53 nutrients;
  view flipped all macros e0→e1, fatty-acid profile (oleic 71.3, linoleic=omega-6 9.76,
  ALA=omega-3 0.76), vit E 14.35, vit K 60.2 — all real, correct (zero EPA/DHA = correct for
  a plant oil). Omega-6/-3 are DERIVED from isomers (store isomers, roll up at display).

## PHASE 2B — curation worklist (SHIPPED, verified)
- `ingredients.fdc_id` + `fdc_matched_at` columns (migration).
- `GET /api/admin/usda/search?q=` — admin-gated candidate search; returns description +
  dataType + marker nutrients (kcal/fat/protein) + fdcId so blends are catchable.
  (NOTE: Foundation candidates show '–' markers — their search-result nutrient shape
  differs; cosmetic only, the import still works. Small future fix.)
- `GET /api/admin/nutrition/worklist` — ingredients with best grade + match state + product flag.
- `/admin/nutrition` page — worklist (filters: On estimates / Unmatched / All; hide products),
  inline Match → pre-filled USDA query → Search → candidates → "Use this" → import → grade flip.
  House style; admin-gated via /api/admin/check.
- VERIFIED full loop: matched extra-virgin olive oil → Foundation FDC 748608. KEY FINDING:
  Foundation gave only 6 nutrients (deep but NARROW — a fat panel), vs SR Legacy's 53 (broad).
  → grade (e2>e1) ≠ coverage. Design implication: match to RICHEST source, or STACK BOTH
  (architecture supports it — per-nutrient resolution; proven below).

## INGREDIENT DEDUP (SHIPPED, dry-run-first)
- **Patched `merge_ingredient(survivor, orphan, dry_run)`** to ALSO re-point the new
  `ingredient_nutrient_value` table (skip-would-be-dup on nutrient_id+source_kind; survivor's
  value wins on clash) AND carry `fdc_id` forward if survivor lacks one. It previously
  re-pointed 10 FK tables but NOT the Phase-1 nutrition table — merging would have orphaned
  USDA data. (File: dedup_01_patch_merge_fn.sql.)
- **15 merges** of clear duplicates (Apple→apples, both Eggplant variants→aubergine, Basil
  variants→basil leaves, black peppercorns→Black pepper, Carrot→Carrots, Clove→cloves,
  Coriander seed→coriander seeds, both Garlic-clove variants→Garlic, Extra virgin olive
  oil→extra-virgin (the fdc-matched one), 2 medium-onion variants→Onion, Parmesan or Pecorino
  →Parmesan). Survivor = the load-bearing (most-used) row.
- **DRY-RUN CAUGHT:** "Onions" (00000200) and "Tomatoes" (00000201) plural rows PARENT 5 / 4
  child ingredients → they're CATEGORY NODES, not duplicates. Merging would've mis-parented
  Red onion / Cherry tomatoes etc. → DROPPED from merges, MARKED is_category instead.
- Marked 12 category nodes is_category (Cheese, Meat & Poultry, Fruits, Vegetables, Oils &
  Fats, Stock/broth, Noodles, Pasta, Pepper, Peppers, Onions, Tomatoes) + 3 non-foods
  is_product (aluminum foil, baking weights, parchment paper).
- RESULT: 303 total · **274 real ingredients** · 17 categories · 13 products (was 318).
- **Multi-source merge PROVEN:** olive oil survivor now holds 53 e1/sr_legacy + 6 e2/foundation
  + 8 e0/ai — view serves fats from e2, rest from e1, e0 fallback. Survived the merge intact.
- Files: dedup_00_inventory.sql, dedup_01_patch_merge_fn.sql, dedup_02_dryrun.sql,
  dedup_02b_dryrun_oneresult.sql, dedup_03_commit.sql. Deliberately CONSERVATIVE (left
  borderline cases: ripe tomatoes vs Tomato, unsalted butter block/dough, fresh-herb variants,
  Cilantro/coriander — low value, risk collapsing real distinctions; a 2nd pass can mop up).

## NEXT SESSION — clear opening: the AI AUTO-MATCHER (high value, now unblocked)
Manual matching 274 ingredients is NOT the plan; 2B is the SAFETY NET / review queue, not the
bulk method. Build a batch auto-matcher: for each unmatched real ingredient → USDA search →
Haiku/Sonnet picks best candidate → AUTO-IMPORT the confident ones, QUEUE doubtful ones to the
/admin/nutrition worklist. Turns the worklist into a review queue for the ~15% the AI wasn't
sure about. Bake in the matching RULE from the 2B finding: prefer RICHEST source (or stack
SR Legacy + Foundation so coverage + e2-where-available). Cost-gated, dry-run/review friendly.
Now that the list is deduped to 274 real foods, every auto-match is a keeper.

## CARRIED BACKLOG (unchanged)
- typical_unit_weight_g backfill (countable ingredients silently dropped from totals/coverage
  until populated — HIGH value, AI estimator per piece/whole).
- Drop the nutrition blob after page client-side fallback repointed to the view.
- Foundation-candidate '–' markers (search-result nutrient shape) — small display fix.
- min-grade recipe total + source badge (make evidence grade visible in recipe UI).
- Stripe enforcement + checkout (revenue track, repeatedly neglected); AI cost aggregation
  view over ai_usage_log; Honest-edges build Phase A; re-decompose ~34 recipes; schema cruft.
