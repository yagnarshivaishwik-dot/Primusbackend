# AdminUI.jsx Decomposition Plan (FE-C1 Master Audit Finding)

**File:** `src/components/AdminUI.jsx`
**Current size:** 6,880 lines (8.6× the 800-line cap from CLAUDE.md)
**Recommended strategy:** Full atomic decomposition (Strategy B)
**Estimated effort:** 15–22 hours by one engineer

This document is the executor checklist. It was produced by a forensic
analysis of the file and is line-numbered against the version of
`AdminUI.jsx` at session start (commit baseline noted in
`scripts/security/MASTER_DEPLOY_RUNBOOK.md`).

A small Phase 1 starter (helpers + Dashboard + console.log strip) is
landed in this branch as a reference implementation; the rest of the
extraction is queued for a focused FE sprint.

---

## Section map (line ranges in pre-split AdminUI.jsx)

| # | Section | Range | LoC | Severity | Target path |
|---|---|---|---|---|---|
| 1 | StatCard helper | 16–26 | 11 | LOW | `src/components/common/StatCard.jsx` |
| 2 | Modal helper | 35–48 | 14 | LOW | `src/components/common/Modal.jsx` |
| 3 | Button helper | 57–69 | 13 | LOW | `src/components/common/Button.jsx` |
| 4 | Dashboard | 80–160 | 81 | HIGH | `src/pages/Dashboard.jsx` |
| 5 | PCManagement | 161–562 | 402 | HIGH | `src/pages/PCManagement.jsx` |
| 6 | UserManagement (legacy) | 564–685 | 122 | LOW | DELETE — unused |
| 7 | GameManagement stub | 687–694 | 8 | LOW | `src/pages/GameManagement.jsx` |
| 8 | ShopPage | 696–900 | 205 | HIGH | `src/pages/Shop/ShopPage.jsx` |
| 9 | CouponsPage | 901–1114 | 214 | HIGH | `src/pages/Coupons/CouponsPage.jsx` |
| 10 | CampaignsPage | 1115–1409 | 295 | HIGH | `src/pages/Campaigns/CampaignsPage.jsx` |
| 11 | Financials stub | 1410–1429 | 20 | LOW | `src/pages/Financials.jsx` |
| 12 | Settings stub | 1430–1433 | 4 | LOW | DELETE — empty |
| 13 | UsersPage | 1434–1612 | 179 | HIGH | `src/pages/Users/UsersPage.jsx` |
| 14 | AddUserModal | 1613–1658 | 46 | MED | `src/pages/Users/AddUserModal.jsx` |
| 15 | ImportUsersModal | 1659–1690 | 32 | MED | `src/pages/Users/ImportUsersModal.jsx` |
| 16 | OrdersPage | 1691–1739 | 49 | MED | `src/pages/Orders/OrdersPage.jsx` |
| 17 | GuestsPage | 1740–1783 | 44 | MED | `src/pages/Guests/GuestsPage.jsx` |
| 18 | BookingsPage | 1784–1878 | 95 | MED | `src/pages/Bookings/BookingsPage.jsx` |
| 19 | ActivityPage | 1879–1959 | 81 | MED | `src/pages/Activity/ActivityPage.jsx` |
| 20 | AdminUI orchestrator | 1960–2074 | 115 | HIGH | refactor in place |
| 21 | App auth wrapper | 2076–2116 | 41 | MED | `src/App.jsx` |
| 22 | PlaceholderPage | 2128–2136 | 9 | LOW | `src/pages/PlaceholderPage.jsx` |
| 23 | ClientGeneral | 2139–2513 | 375 | HIGH | `src/pages/Settings/Client/ClientGeneral.jsx` |
| 24 | ClientVersion | 2514–2638 | 125 | HIGH | `src/pages/Settings/Client/ClientVersion.jsx` |
| 25 | ClientConsoles | 2639–2785 | 147 | HIGH | `src/pages/Settings/Client/ClientConsoles.jsx` |
| 26 | AddConsoleModal | 2786–2837 | 52 | MED | `src/pages/Settings/Client/AddConsoleModal.jsx` |
| 27 | ClientCustomization | 2838–3234 | 397 | HIGH | `src/pages/Settings/Client/ClientCustomization.jsx` |
| 28 | ClientAdvanced | 3235–3805 | 571 | HIGH | `src/pages/Settings/Client/ClientAdvanced.jsx` |
| 29 | ClientSecurity | 3806–4346 | 541 | HIGH | `src/pages/Settings/Client/ClientSecurity.jsx` |
| 30 | ClientGamesApps | 4347–4924 | 578 | HIGH | `src/pages/Settings/Client/ClientGamesApps.jsx` |
| 31 | SettingsRoot | 4925–5082 | 158 | HIGH | `src/pages/Settings/SettingsRoot.jsx` |
| 32 | CenterFinancial | 5100–5320 | 221 | HIGH | `src/pages/Settings/Center/CenterFinancial.jsx` |
| 33 | CenterReports | 5321–5495 | 175 | HIGH | `src/pages/Settings/Center/CenterReports.jsx` |
| 34 | CenterInfo | 5496–5714 | 219 | HIGH | `src/pages/Settings/Center/CenterInfo.jsx` |
| 35 | CenterNetwork | 5715–5959 | 245 | HIGH | `src/pages/Settings/Center/CenterNetwork.jsx` |
| 36 | UserDetails | 5960–6258 | 299 | HIGH | `src/pages/Settings/UserDetails.jsx` |
| 37 | Licenses | 6259–6449 | 191 | MED | `src/pages/Settings/Licenses/Licenses.jsx` |
| 38 | LicenseModal | 6450–6604 | 155 | MED | `src/pages/Settings/Licenses/LicenseModal.jsx` |
| 39 | CenterLanguage | 6605–6879 | 275 | MED | `src/pages/Settings/Center/CenterLanguage.jsx` |

## Shared state to factor into context / store

```js
// AdminUI orchestrator state (lines 1961-1962) — keep in AdminUI:
const [activePage, setActivePage] = useState('Dashboard');
const [activeChatContext, setActiveChatContext] = useState(null);

// App-level state (lines 2077-2078) — move to AuthContext:
const [isLoggedIn, setIsLoggedIn] = useState(...);
const [cafeInfo, setCafeInfo] = useState(null);
```

Recommended new files:
- `src/context/AuthContext.jsx` — `isLoggedIn`, `cafeInfo`, `fetchCafeInfo`
- `src/context/CafeContext.jsx` — pass-through for cafeInfo to deep settings pages

## Console / debug statements to strip during extraction (29 total)

Lines: 175, 194, 210, **333**, 610, 2188, 2255, 2257, 2260, 4399, 4421, 4486, 5148, 5162, 5352, 5366, 5533, 5547, 5742, 5756, 5783, 5797, 6066, 6088, 6276, 6296, 6321, 6499, 6654, 6668.

Line 333 is the FE-H7 audit citation: `console.log("Executing command '${command}' on PC ${selectedPc.id}")`.

## Unused identifiers to delete (8 in AdminUI.jsx)

| Line | Identifier |
|---|---|
| 281 | `openCommandModal` |
| 466 | `UserManagement` (legacy import) |
| 933 | `hourToColumn` |
| 2658 | `index` (loop var) |
| 3023 | `saving` |
| 3074 | `saveSecuritySettings` |
| 3737 | `getFilterCount` |
| 5170 | `Row` helper |

## HTML entity escapes to fix

Lines 323, 339, 1342, 1645 (×2), 3854 (×2), 5578 (×2), 5770 (×2). Replace literal `'` inside JSX text with `&apos;` or `&#39;`.

## Effort breakdown

| Phase | Hours | Deliverable |
|---|---|---|
| Helpers + context | 1.5 | StatCard / Modal / Button / AuthContext |
| Main pages × 12 | 5.0 | Dashboard / PCManagement / Shop / Coupons / etc. |
| Modals × 4 | 1.0 | AddUserModal / ImportUsersModal / AddConsoleModal / LicenseModal |
| Settings tree × 16 | 6.0 | Client/* + Center/* + Licenses/* |
| Lint cleanup | 1.0 | console.log strip + unused-var delete + entity escapes |
| Refactor orchestrator | 1.0 | AdminUI = thin router |
| Smoke test | 1.0 | npm run lint && navigate every page |
| **Total** | **15.5** | |

## Final structure

```
src/
  components/
    AdminUI.jsx                 (router, ~150 lines)
    AdminSidebar.jsx
    AdminHeader.jsx
    common/
      StatCard.jsx
      Modal.jsx
      Button.jsx
    ChatPanel.jsx               (unchanged)
    NotificationBell.jsx        (unchanged)
  context/
    AuthContext.jsx
    CafeContext.jsx
  pages/
    Dashboard.jsx
    PCManagement.jsx
    GameManagement.jsx
    Financials.jsx
    PlaceholderPage.jsx
    Shop/ShopPage.jsx
    Coupons/CouponsPage.jsx
    Campaigns/CampaignsPage.jsx
    Users/{UsersPage,AddUserModal,ImportUsersModal}.jsx
    Orders/OrdersPage.jsx
    Guests/GuestsPage.jsx
    Bookings/BookingsPage.jsx
    Activity/ActivityPage.jsx
    Settings/
      SettingsRoot.jsx
      UserDetails.jsx
      Client/{ClientGeneral,ClientVersion,ClientConsoles,AddConsoleModal,
              ClientCustomization,ClientAdvanced,ClientSecurity,
              ClientGamesApps}.jsx
      Center/{CenterFinancial,CenterReports,CenterInfo,CenterNetwork,
              CenterLanguage}.jsx
      Licenses/{Licenses,LicenseModal}.jsx
  App.jsx                       (refactored to wrap AuthContext)
```

## Risk and rollback

- One commit per extracted file → granular `git revert` if any page regresses
- No behavioral change — only file structure
- AuthContext is purely additive; the existing prop-passing keeps working until the consumer is updated
- Existing tests (if any) keep working because no public component API changes
