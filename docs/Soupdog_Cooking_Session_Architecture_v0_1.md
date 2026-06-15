# Soupdog — Cooking Sessions: Self-Containment, Offline & Hosting Tiers (v0.1)

**Status:** architecture note. Captures decisions from the 2026-06-15 session about
*why* a cooking session is built as a self-contained snapshot, and what that enables
for offline use, local/edge hosting, and the upcoming mobile apps. **Build none of
the offline/local infrastructure now** — this note exists so the seam stays open and
isn't re-derived later. It accompanies the Layer-1 session build (schema + routes).

---

## 1. The one decision everything hangs on: the session is SELF-CONTAINED

A cooking session stores a **snapshot** of its merged cooking timeline (the resolved
`MergeResult` from `lib/meal-merge.ts`) taken at session start, plus which
`recipe_versions` each dish was at when snapshotted. Progress (`session_step_state`)
is tracked against that frozen snapshot, never against the live recipe graph.

Why this matters beyond resumability:

- **A running session needs nothing from the global recipe graph.** No joins across
  recipe_canonicals → recipe_versions → version_steps at render time. The session is
  one self-contained document: read it, write progress to it.
- That single property is what makes **every** offline / local / edge / cache hosting
  model possible later (see §3). Without it, any offline mode would have to replicate
  the entire recipe graph. With it, you replicate one small document.
- It fits the **residency seam** already drawn in People & Groups: *shared catalog
  data* (recipes, ingredients, the Food Model) is global; *personal/operational data*
  (a person's cooking session, their progress) is residency-scoped. A session lives on
  the personal side, so it can be hosted close to the cook without dragging the global
  graph along.

**What would CLOSE this seam (avoid):** making a live session re-query or depend on the
global recipe graph step-by-step. The snapshot is precisely what prevents that. Any
future change that "just joins the live recipe to save storage" silently re-closes the
door to offline/local hosting.

A session is, in the platform's own terms, a *frozen execution instance of the
recipe-at-that-moment* — consistent with "a meal is a recipe / everything is an
identified thing." Recipe edits after the snapshot never disturb an in-progress cook;
a "recipe updated since you cooked this" flag (computed by comparing the meal's dishes'
current `current_version_id` to the session's stored source version ids) lets the user
choose to finish the old one or start fresh on the new version.

---

## 2. Oversight is NOT participation (kept out of the session schema)

Two different relationships to a session, deliberately separated:

- **Participation** — hands-on cooking this session (lead cook, helper). Modelled by
  `session_participant` (role-ready; v1 populates one lead).
- **Oversight** — watching/directing sessions you are not personally cooking
  (head chef across stations, franchise control center). This is a read/command
  relationship to *many* sessions, and it is the **same shape as the existing
  `person_access` / Sharing & Delegation model** (an account with a delegated role +
  scope over persons/sessions). A head chef "overseeing" a station is structurally the
  same as a nurse "managing" a patient's plan.

Decision: **do not model oversight in the session tables.** It belongs to the Sharing &
Delegation access layer (its own future build) and layers on cleanly *because* the
session is self-contained and access is a separate concern. Baking head-chef/franchise
control into the session schema now would be premature abstraction.

---

## 3. Offline / local hosting tiers (the spectrum — build none yet)

All three tiers are enabled by the §1 self-contained snapshot. You never *pick* a tier
in the schema; you keep the seam and choose a tier when a real, paying need appears.

**Tier 1 — Offline-capable web app (PWA).** The session snapshot is cached on the
*device* (IndexedDB / service worker). Connection drops mid-cook → the session keeps
working locally (steps still check off) and syncs progress back on reconnect. Nothing
to install.
- Fits: a single tablet on a counter, an airline cart, a food truck — the "can't afford
  to lose connection during a cook" case.
- Limit: cache is per-device; two tablets don't share offline state.
- **This is the realistic FIRST step for commercial offline**, and the natural partner
  to the mobile/tablet apps (see §4). Lowest cost, no hardware.

**Tier 2 — Local server appliance (a box in the kitchen).** A small Linux node on the
kitchen LAN holds session snapshots + progress; all tablets talk to it; it syncs to the
cloud when it can. Internet can vanish entirely and the kitchen keeps running.
- Fits: busy multi-station kitchens, remote sites (ship galley, festival).
- Cost: shipping + supporting hardware/software the customer installs and runs. Real
  operational weight. Only when shared-offline-state across stations is a paying need.

**Tier 3 — Full self-hosted deployment.** Customer runs the whole stack (airline data
center, hotel chain). Enterprise territory: licensing, deployment, updates, support
contracts. A business model, not a feature. Likely never needed unless a very large
customer demands it.

Natural progression is **1 → 2 → 3**; most pain is covered by Tier 1. Do NOT build
speculative hardware/self-host paths. Reach for the PWA offline path first.

---

## 4. The trigger: mobile / tablet apps make this concrete (relatively soon)

Offline stays theoretical until there's a device on a kitchen counter — which is exactly
when the mobile/tablet apps arrive. A tablet running a cook is the first place
"don't die mid-cook when the wifi drops" actually bites. So the cooking session, the
mobile app, and the offline cache converge.

Per the existing mobile assessment (Capacitor as the best fit for current stage — wraps
the existing web UI, App Store / Play Store presence, camera/TTS plugins; true wake-word
voice would need React Native or native):

- **Capacitor + a PWA-style offline cache of the session snapshot is the coherent first
  offline story.** Capacitor wraps the web app; the same offline session cache (Tier 1)
  works inside it. So "build the mobile app" and "make sessions work offline" are the
  same arc, reached together — not two separate efforts.
- When the tablet app lands, the highest-leverage offline work is: cache the active
  session snapshot on-device, queue progress writes, sync on reconnect. That is Tier 1,
  and it's the recommended first concrete offline build — *when* the apps are built, not
  before.

---

## 5. What to build NOW (and what not to)

**Now (Layer 1):** snapshot-based `cooking_session`, `session_participant` (lead only,
role-ready), `session_step_state` keyed to the frozen snapshot; the "recipe updated
since snapshot" flag; plain Postgres, normal RLS/grants. Multiple historical sessions
per meal allowed (cook history; "finish before redoing").

**NOT now (seam kept, not built):** PWA/offline cache, local kitchen box, self-host,
oversight/head-chef/franchise control, edge replication, any cache layer. Each is
enabled by the self-contained snapshot and chosen when a real need appears.

**The discipline:** name the seam, don't build the abstraction. The session is
self-contained and access-agnostic; everything else layers on later without reopening
the schema.
