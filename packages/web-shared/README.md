# @primus/web-shared

Shared HTTP / auth / WebSocket infrastructure for the three Primus
SPAs (`ClutcHH-1/`, `primus-admin-main/`, `Primus-SuperAdmin-main/`).

Created as part of the forensic-audit P4 refactor to eliminate ~1,800
LOC of duplicated client code across the three apps and to lock down
the cross-cutting security bugs (BUG #1.2 / #1.9 / #3.3 / #28).

## What it solves

| Forensic audit finding | Root cause | Where it's fixed |
|------------------------|------------|------------------|
| BUG #28 — JWT in localStorage (SuperAdmin) | `persist.partialize` included `token` | `src/auth/store.ts` — `partialize` excludes `token` |
| BUG #3.3 — JWT in SSE URL (admin) | EventSource cannot send headers | `src/ws/manager.ts` — first-frame auth via WS |
| BUG #1.2 / #1.9 — mutable API base + JWT in localStorage (kiosk) | `localStorage.primus_api_base` override | Consumer-side change; kiosk JWT goes through the C# bridge |
| FE-C4 — offline queue replays across users | queue had no user binding | `src/api/client.ts` — `userId`-scoped queue |
| 401 refresh storms | each SPA had its own single-flight refresh | `src/api/client.ts` — single canonical singleFlightRefresh() |

## Layout

```
packages/web-shared/
├── package.json
├── README.md (this file)
└── src/
    ├── index.ts              # barrel
    ├── api/client.ts         # createApiClient(opts)
    ├── auth/store.ts         # useSharedAuthStore (zustand, persist w/o token)
    ├── auth/login.tsx        # <SharedLogin /> skeleton
    └── ws/manager.ts         # createWsManager(opts) — first-frame auth
```

## Migration plan

1. **Workspaces** — add to the root `package.json`:
   ```jsonc
   {
     "workspaces": [
       "packages/*",
       "ClutcHH-1",
       "primus-admin-main",
       "Primus-SuperAdmin-main"
     ]
   }
   ```
   FLAG FOR OPS: this requires a root `package.json` that is currently
   missing. Without it npm/pnpm cannot resolve `@primus/web-shared` as a
   workspace dependency.

2. **Per-SPA consumption** — add `"@primus/web-shared": "*"` to each
   SPA's `dependencies`, then replace the local module with a re-export:
   ```ts
   // primus-admin-main/src/utils/api.js
   export { createApiClient } from '@primus/web-shared/api';
   ```

3. **Phased rollout** — keep the SPA-local files in place as thin
   adapters during the swap so each SPA can flip one consumer at a
   time. The local-vs-shared interfaces are intentionally identical so
   diffs stay small.

4. **Backend dependencies** — see "Migration hazards" in the
   accompanying handoff note. The shared store assumes the backend
   delivers refresh tokens via httpOnly cookies and that the WS
   endpoint accepts an `auth` first frame.

## Smoke test

```bash
cd packages/web-shared
npm install
npm run build          # tsc --noEmit
npm test               # vitest, when added
```
