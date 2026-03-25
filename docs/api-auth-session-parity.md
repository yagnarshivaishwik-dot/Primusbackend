# Auth & Session API Parity Notes

These notes capture the exact FastAPI behavior that the .NET migration must replicate. Use this as the contract when implementing controllers, handlers, and tests.

## `/api/auth` Router

| Endpoint | Request | Response | Notes / Side Effects |
| --- | --- | --- | --- |
| `POST /api/auth/login` | `application/x-www-form-urlencoded` (`username`, `password`, optional `totp_code`) | `{"access_token": str, "token_type": "bearer"}` | - Uses `OAuth2PasswordRequestForm` semantics.<br>- Lowercases username/email.<br>- Checks account lockout (`app.utils.account_lockout`). Locked users get HTTP 423 with message `Account locked...`.<br>- Passwords normalized via SHA256 before Argon2/bcrypt verify.<br>- On success: clears lockout counter, logs `login_success` via audit router, returns JWT with claims `sub`, `role`, `cafe_id`.<br>- 2FA: when `ENABLE_TOTP_2FA` and `user.two_factor_secret` set, missing or invalid `totp_code` yields HTTP 401 with specific detail.<br>- All invalid creds → HTTP 401 `"Invalid credentials"` without leaking existence. |
| `POST /api/auth/register` | JSON `RegisterIn` or form fields (`name`, `email`, `password`, optional profile fields) | `{"ok": True}` | - Forces role `"client"` regardless of payload.<br>- Validates password strength via `validate_password_strength`; failures return HTTP 400 with specific error string.<br>- On duplicate email returns `{"ok": True}` (no error).<br>- Persists user with Argon2id hash, `is_email_verified=True`, optional `tos_accepted_at`, logs `user_register`. |
| `POST /api/auth/password/forgot` | `{"email": EmailStr}` | `{"ok": True}` | - Silent success for unknown email.<br>- Creates `PasswordResetToken` (random 32 char) expiring in 1h.<br>- Attempts to send email (best-effort). |
| `POST /api/auth/password/reset` | `{"token": str, "new_password": str}` | `{"ok": True}` | - Validates token unused & not expired. Invalid tokens → HTTP 400 `"Invalid or expired token"` or `"Invalid token"`.<br>- Hashes new password via `_normalize_password` + Argon2.<br>- Marks token `used=True`. |
| `POST /api/auth/login/firebase` | – | HTTP 410 `{"detail":"Firebase login disabled. Use email/password."}` | Hard-coded behavior; replicate. |
| `GET /api/auth/verify-email` | – | HTTP 410 `"Deprecated; use Firebase login"` | Historical endpoint kept for compatibility. |
| `POST /api/auth/2fa/enable` | – | `{"secret": str, "otpauth_url": str}` | - Requires `ENABLE_TOTP_2FA`; else HTTP 410 `"2FA is disabled."`.<br>- Returns existing secret if already enabled.<br>- Persists new secret and returns provisioning URI. |
| `POST /api/auth/2fa/disable` | – | `{"ok": True}` | - Requires `ENABLE_TOTP_2FA`; else HTTP 410.<br>- Clears `two_factor_secret`. |
| `GET /api/auth/me` | – | `UserOut` | - Requires bearer token.<br>- `UserOut` from `app.schemas` (includes role, wallet, etc.). |
| `POST /api/auth/me` | `UserUpdate` (currently only `birthdate`) | `{"ok": True}` | - Updates `current_user.birthdate` if provided. |
| `GET /api/auth/oidc/me` | – | Raw OIDC claims | - Validates against JWKS using `OIDC_ISSUER`, `OIDC_AUDIENCE`.<br>- Errors: 503 if not configured, 401 for token issues. |

### Supporting Behavior

- Password hashing: all user passwords normalized with SHA256 hex then hashed (Argon2 preferred, bcrypt fallback). Successful bcrypt login migrates to Argon2.
- Audit logging hooks: login success/fail/lock events call `app.api.endpoints.audit.log_action`.
- Account lockout utilities: `record_failed_login_attempt`, `is_account_locked`, `clear_login_attempts`.
- JWT: uses `ALGORITHM`, `JWT_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`. Claims must include `sub`, `role`, `cafe_id`.

## `/api/session` Router

| Endpoint | Request | Response | Notes / Side Effects |
| --- | --- | --- | --- |
| `POST /api/session/start` | `SessionStart` (`pc_id`, `user_id`) | `SessionOut` | - Creates `Session` row with `start_time=UTC now`, `paid=False`, `amount=0`.<br>- Logs `session_start` via audit endpoint.<br>- Updates `ClientPC.current_user_id` to `user_id` if PC exists.<br>- Publishes cache invalidation (`scope: sessions`, `session_active_guests`). |
| `POST /api/session/stop/{session_id}` | – | `SessionOut` | - Finds session; missing → HTTP 404 `"Session not found"`.<br>- If already stopped, returns existing row.<br>- Sets `end_time=UTC now`, recalculates billing via `calculate_billing`; ignores billing HTTP errors; clears `ClientPC.current_user_id`.<br>- Logs `session_stop`, publishes cache invalidation. |
| `GET /api/session/current` | – | `SessionOut | null` | - Requires authenticated user.<br>- Returns most recent active (no `end_time`) session for caller. |
| `GET /api/session/history` | Optional query `user_id` | `list[SessionOut]` | - Defaults to caller’s history if `user_id` omitted.<br>- No explicit role check, but route requires valid token. |
| `GET /api/session/guests` | – | `list[SessionOut]` | - Requires `require_role("admin")`.<br>- Returns cached list (TTL 15s) of all active sessions using `app.utils.cache.get_or_set`. |

### Schema References

- `SessionStart`: `{ pc_id: int, user_id: int }`.
- `SessionOut`: `{ id, pc_id, user_id, start_time, end_time, paid, amount }`.

### Side Channels

- Cache invalidation via Redis pub/sub (`publish_invalidation`) ensures other services refresh active session data.
- Billing integration: `app.api.endpoints.billing.calculate_billing(session, db)` must be invoked during stop.
- Client PC linkage: updates `ClientPC.current_user_id` on start/stop.

---

**Next Steps:** use these notes to implement the corresponding ASP.NET Core controllers, MediatR handlers, EF entities, and parity tests. Ensure error codes/messages match exactly (e.g., 401 `"Invalid credentials"`, 423 lockouts, 410 for disabled endpoints). SignalR hubs must emit equivalent cache/notification events when sessions change.

