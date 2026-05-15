# ClutchHH

Large-scale SaaS gaming platform UI — feature-based React + JavaScript + Tailwind foundation.

## Stack

- React 18.3 + Vite 5 (JavaScript, ESM)
- React Router DOM 6
- Tailwind CSS 3.4 (dark mode default)
- Zustand (global state)
- ESLint + Prettier
- Absolute imports via `@/*`

## Getting Started

```bash
npm install
npm run dev       # http://localhost:5173
npm run build
npm run lint
```

## Folder Structure

```
src/
  app/         # App-level configs (routes, providers, stores)
  assets/      # Images, icons, fonts
  components/  # Reusable UI (common, layout, overlays)
  features/    # Feature-based modules (see below)
  hooks/       # Global hooks
  utils/       # Helpers (cn, format)
  constants/   # App-wide constants
  layouts/     # MainLayout, AuthLayout
  pages/       # Top-level pages (404)
  styles/      # Tailwind entry + CSS vars
```

### Feature module convention

Each `features/<name>/` contains:

```
pages/         # Route-level pages
components/    # Feature-scoped UI
services/      # Mock data / API logic
hooks/         # Feature-scoped hooks
constants.js
index.js       # Barrel export
```

## 41-Screen Mapping

| # | Screen | Implementation |
|---|---|---|
| 1 | Splash / Initializing | `/initial-setup/initializing` |
| 2 | Login | `/auth/login` (any credentials) |
| 3 | Home | `/main/home` |
| 4 | Games | `/main/apps/games` |
| 5 | Game Detail | `/game/:id` |
| 6 | Tracking Modal | Overlay (`useUIStore`) |
| 7 | Game Login | `/game/login` |
| 8 | Apps | `/main/apps/apps` |
| 9 | Apps Tools Filter | `/apps/tools` |
| 10 | Apps Launcher Filter | `/apps/launcher` |
| 11 | Arcade | `/main/apps/arcade` |
| 12 | Shop | `/main/shop` |
| 13 | Shop Detail | `/shop/:id` |
| 14 | Prize Vault | `/main/prize-vault` |
| 15 | Prize Redeem | `/prize-vault/redeem` |
| 16 | Challenges List | `/challenges` |
| 17 | Challenge Detail | `/challenges/:id` |
| 18 | Quests List | `/quests` |
| 19 | Quest Detail | `/quests/:id` |
| 20 | Notifications Panel | Overlay (`useUIStore`) |
| 21 | Profile | `/main/profile` |
| 22 | Profile Stats | `/profile/stats` |
| 23 | Profile Achievements | `/profile/achievements` |
| 24 | Profile Friends | `/profile/friends` |
| 25 | Profile Edit | `/profile/edit` |
| 26 | Help | `/settings/help` |
| 27 | Sound Settings | `/settings/sound` |
| 28–37 | Game Tag Filters (10) | Filter state on `/main/apps/games` (`useFiltersStore.tags`) |
| 38 | Borrow Toggle | Filter state (`useFiltersStore.borrow`) |
| 39 | Free Toggle | Filter state (`useFiltersStore.free`) |
| 40 | Arcade Game Detail | `/arcade/:id` |
| 41 | Leaderboard | `/leaderboard` |

## Adding a new feature

1. Create `src/features/<name>/` with `pages/`, `components/`, `services/`, `index.js`.
2. Add the route path to `src/app/routes/paths.js`.
3. Register the route in `src/app/routes/AppRoutes.jsx`.
4. Optional: add a sidebar entry in `src/components/layout/Sidebar.jsx`.

## State (Zustand)

- `useSessionStore` — user + auth
- `useUIStore` — sidebar + overlays
- `useNotificationsStore` — notifications
- `useFiltersStore` — game filters (tags, borrow, free, genre, launcher)
