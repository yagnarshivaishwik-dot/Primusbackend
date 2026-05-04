# Primus Client — Changelog

All notable changes to the Primus Client (Windows native app + installer) are
recorded here. The version in `version.txt` is incremented automatically on
every `build-installer.ps1` run. Pass `-Message "..."` to attach release notes
to the new entry; the default note is `"Automated rebuild."`.

Format: `YYYY-MM-DD — vX.Y.Z — notes`. Most recent version on top.

## v1.0.17 — 2026-05-04

- fix(auth): wire OTP-based password reset (email + 6-digit code + new password) — clutchh UI was still using old token-link flow against backend that switched to OTP in 95f2e27

## v1.0.16 — 2026-05-04

- rebuild against latest backend; bundles WS license_key + X-License-Key + heartbeat alias fixes from a07483e + admin URL fix from 8092ab7

## v1.0.15 — 2026-05-04

- fix(realtime): multi-DB cafe routing via X-License-Key + license_key in WS device_auth/URL — heartbeat & WS auth now actually reach the per-cafe ClientPC row

## v1.0.14 — 2026-05-04

- fix(realtime): WS heartbeat alias (ping->heartbeat), Redis cluster presence, defensive admin button gating + clear stuck restarting status

## v1.0.13 — 2026-05-01

- rebuild against latest ClutcHH-1; verified heartbeat HMAC + restart command + online presence

## v1.0.12 — 2026-04-28

- Revert virtual host to primus.local; switch Google sign-in to redirect flow (avoids WebView2 DNS conflict + Cloud Console origin restrictions)

## v1.0.11 — 2026-04-28

- Wire Google OAuth: virtual host kiosk.primustech.in + client 737653343711

## v1.0.9 — 2026-04-24

- cashfree sdk checkout, payment_session_id driven

## v1.0.8 — 2026-04-24

- empty-state home, stale-user fix, installed inspector, shop 400 fix

## v1.0.7 — 2026-04-24

- signup form-encoding fix

## v1.0.6 — 2026-04-24

- real OTP + empty-field validation + cashfree multi-scheme verifier

## v1.0.5 — 2026-04-24

- cashfree credit-time flow + 5 min starter + ticking timer

## v1.0.4 — 2026-04-16

- Fix CORS: add --disable-web-security to WebView2 + add primus.local to backend origins

## v1.0.3 — 2026-04-16

- WebView2 host + JS bridge (Tauri-compat shim) + auto-version staging pipeline

## v1.0.2 — 2026-04-16

- Verify UTF-8 changelog writes + entry separators

## v1.0.1 — 2026-04-16

- Switched to WebView2 host + auto-versioning pipeline.
- `build-installer.ps1` now auto-bumps patch semver and prepends a CHANGELOG entry.
- `PrimusKiosk.App.csproj` + `installer/primus-client.iss` accept `-p:Version` and
  `/DAppVersion` overrides so exe + installer filename + Add/Remove Programs all
  reflect the current version.

## v1.0.0 — 2026-04-15

- Initial native Windows release.
- WPF .NET 8 host with embedded WebView2 rendering the existing `/PrimusClient`
  React UI verbatim.
- Full Inno Setup installer (`PrimusInstaller-1.0.0.exe`) — `Program Files\Primus\`,
  Desktop + Start Menu shortcuts, Add/Remove Programs, silent install,
  auto-start, kiosk shell-replacement tasks.
- Persistent runtime state under `%ProgramData%\Primus\` (DPAPI-wrapped device
  credentials + JWT tokens, SQLite offline queue, Serilog 7-day rolling logs,
  crash dumps, overrides).
- Wired to the Azure `clutchhh_backend` stack via Cloudflare Tunnel
  `https://api.primustech.in` / `wss://api.primustech.in/ws/pc/{pc_id}`.
- Remote command handlers: lock, unlock, shutdown, reboot, restart, logout,
  message, screenshot, login, launch_app, kill_process.
- 30 s heartbeat with CPU / RAM / GPU / temperature / idle / session
  telemetry. Time-limit enforcement auto-locks the station on expiry.
- Single-file self-contained `PrimusClient.exe` (~76 MB compressed).
