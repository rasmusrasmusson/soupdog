# Soupdog Platform

> A food process graph, recipe execution system, and connected appliance orchestration layer.

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | Next.js 15, React 19, TypeScript    |
| Styling     | Tailwind CSS v4, CSS variables      |
| Icons       | Lucide React                        |
| Hosting     | Vercel (recommended)                |
| CMS         | Sanity (Phase 2+)                   |
| Database    | PostgreSQL via Supabase             |
| Auth        | Supabase Auth                       |
| Search      | PG full-text → Meilisearch (Phase 2)|

## Project Structure

```
src/
  app/                     # Next.js App Router pages
    recipes/               # Recipe index + [slug] detail
    ingredients/           # Ingredient pages
    techniques/            # Technique pages
    equipment/             # Equipment pages
    search/                # Search page
  components/
    layout/                # Sidebar, RightPanel
    recipe/                # RecipeCard, RecipeSteps, etc.
    ui/                    # Shared primitives
  data/                    # Sample/seed data
  lib/                     # Utilities (units, slugs, time)
  types/                   # All TypeScript types
```

## Design System

- **Fonts**: Fraunces (display) + DM Sans (body) + DM Mono
- **Accent**: Terracotta `#c84b2f`
- **Philosophy**: Minimal, structured, cookbook-inspired, information-dense

## Development Phases

- **Phase 1** ✅ Public recipe site, search, accounts, saved recipes  
- **Phase 2** Structured recipe engine, equipment, translations  
- **Phase 3** Inventory, household profiles, ratings  
- **Phase 4** Connected appliances, cooking programs  
- **Phase 5** B2B portals, analytics  
- **Phase 6** Adaptive execution, process intelligence  

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
