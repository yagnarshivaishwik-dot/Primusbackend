#!/usr/bin/env python3
"""
Apply a Google Cloud Console OAuth web-client credential into local
.env files for both the backend (FastAPI) and the kiosk (PrimusClient).

Usage
-----
    # Default: read both .env paths and patch in-place
    python scripts/configure_google_oauth.py \\
        --client-secret-json ~/Downloads/client_secret_*.json

    # Specify alternate .env locations
    python scripts/configure_google_oauth.py \\
        --client-secret-json ~/Downloads/client_secret_*.json \\
        --backend-env       /etc/primus/backend.env \\
        --kiosk-env         /opt/primus/PrimusClient/.env

    # Dry-run: print what would change without writing
    python scripts/configure_google_oauth.py \\
        --client-secret-json ~/Downloads/client_secret_*.json \\
        --dry-run

What it does
------------
1. Parse the JSON Cloud Console downloads (the file is named
   `client_secret_<id>.apps.googleusercontent.com.json` and contains
   {"web": {"client_id": ..., "client_secret": ...}}).
2. Backup the target .env files (.bak.<timestamp>).
3. Patch GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in the backend .env
   (creates them if missing). Validates the rest of the file is
   structurally untouched.
4. Patch VITE_GOOGLE_WEB_CLIENT_ID in the kiosk .env (creates if missing).
5. chmod 0600 on the backend .env so secrets aren't world-readable.
6. Print a verification block the operator can curl to confirm.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_BACKEND_ENV = REPO_ROOT / "backend" / ".env"
DEFAULT_KIOSK_ENV = REPO_ROOT / "PrimusClient" / ".env"


# ── helpers ──────────────────────────────────────────────────────────
def _color(s: str, code: str) -> str:
    if not sys.stdout.isatty():
        return s
    return f"\033[{code}m{s}\033[0m"


def info(msg: str) -> None:
    print(_color("[oauth]", "1;34"), msg)


def warn(msg: str) -> None:
    print(_color("[oauth]", "1;33"), msg, file=sys.stderr)


def fail(msg: str) -> "NoReturn":  # type: ignore[name-defined]
    print(_color("[oauth]", "1;31"), msg, file=sys.stderr)
    sys.exit(1)


def parse_client_secret(path: Path) -> tuple[str, str, str]:
    """Return (client_id, client_secret, project_id)."""
    if not path.exists():
        fail(f"--client-secret-json not found: {path}")
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        fail(f"{path} is not valid JSON: {exc}")

    # Cloud Console wraps the credential under either "web" or "installed"
    container = data.get("web") or data.get("installed")
    if not container:
        fail(
            f"{path}: expected top-level 'web' or 'installed' key from Cloud "
            f"Console download. Got keys: {list(data.keys())}"
        )

    cid = container.get("client_id", "")
    csec = container.get("client_secret", "")
    pid = container.get("project_id", "")
    if not cid:
        fail(f"{path}: missing client_id")
    if not csec:
        warn(f"{path}: no client_secret (this is a public web client — that's fine for GSI ID-token flow)")
    return cid, csec, pid


def upsert_env_var(text: str, key: str, value: str) -> str:
    """Replace (or append) `KEY=value` in a .env-style text body.

    Preserves surrounding comments and unrelated keys verbatim.
    """
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    replacement = f"{key}={value}"
    if pattern.search(text):
        return pattern.sub(replacement, text, count=1)
    # Append with a trailing newline if missing
    if text and not text.endswith("\n"):
        text += "\n"
    return text + replacement + "\n"


def write_atomic(path: Path, text: str, *, mode: int | None = None) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="\n")
    if mode is not None:
        try:
            os.chmod(tmp, mode)
        except (OSError, NotImplementedError):
            pass
    tmp.replace(path)


def patch_env_file(
    path: Path,
    updates: dict[str, str],
    *,
    create_if_missing: bool,
    secure_perms: bool,
    dry_run: bool,
) -> None:
    if not path.exists():
        if not create_if_missing:
            warn(f"{path} does not exist — skipping")
            return
        info(f"creating {path}")
        body = ""
    else:
        body = path.read_text(encoding="utf-8")

    new_body = body
    for key, value in updates.items():
        new_body = upsert_env_var(new_body, key, value)

    if new_body == body:
        info(f"{path}: already up to date")
        return

    if dry_run:
        info(f"[dry-run] would patch {path}:")
        for key in updates:
            print(f"    {key}=<{len(updates[key])} chars>")
        return

    # Backup
    if path.exists():
        backup = path.with_suffix(path.suffix + f".bak.{int(time.time())}")
        shutil.copy2(path, backup)
        info(f"backed up {path} → {backup.name}")

    write_atomic(path, new_body, mode=0o600 if secure_perms else None)
    info(f"wrote {path}")


# ── main ─────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--client-secret-json", required=True,
        help="Path to client_secret_*.apps.googleusercontent.com.json from Cloud Console.",
    )
    ap.add_argument(
        "--backend-env", default=str(DEFAULT_BACKEND_ENV),
        help=f"Backend .env path (default: {DEFAULT_BACKEND_ENV})",
    )
    ap.add_argument(
        "--kiosk-env", default=str(DEFAULT_KIOSK_ENV),
        help=f"PrimusClient .env path (default: {DEFAULT_KIOSK_ENV})",
    )
    ap.add_argument(
        "--skip-backend", action="store_true",
        help="Don't touch the backend .env (e.g. when running on a build box that doesn't host it).",
    )
    ap.add_argument(
        "--skip-kiosk", action="store_true",
        help="Don't touch the PrimusClient .env (e.g. when running on the backend host).",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    secret_path = Path(args.client_secret_json).expanduser().resolve()
    cid, csec, pid = parse_client_secret(secret_path)

    info(f"Cloud Console project: {pid or '<unknown>'}")
    info(f"Client ID prefix:      {cid.split('-', 1)[0]}-…{cid[-30:]}")
    info(f"Client secret:         {'(present)' if csec else '(none — GSI-only client)'}")

    if not args.skip_backend:
        patch_env_file(
            Path(args.backend_env).expanduser().resolve(),
            {"GOOGLE_CLIENT_ID": cid, "GOOGLE_CLIENT_SECRET": csec},
            create_if_missing=True,
            secure_perms=True,
            dry_run=args.dry_run,
        )

    if not args.skip_kiosk:
        patch_env_file(
            Path(args.kiosk_env).expanduser().resolve(),
            {"VITE_GOOGLE_WEB_CLIENT_ID": cid},
            create_if_missing=True,
            secure_perms=False,  # kiosk .env carries no secrets, only public client_id
            dry_run=args.dry_run,
        )

    if args.dry_run:
        return

    print()
    info("Verify post-deploy:")
    print(
        "    curl -s https://api.primustech.in/health/oauth | python -m json.tool\n"
        "  Expected:\n"
        "    {\"google_configured\": true, \"client_id_prefix\": \"" +
        cid.split('-', 1)[0] + "...\"}"
    )
    print()
    info("Reminders:")
    print("  - Restart the FastAPI process so it re-reads .env (systemctl restart primus-backend)")
    print("  - Rebuild PrimusClient so VITE_GOOGLE_WEB_CLIENT_ID gets baked in:")
    print("      cd PrimusClient && npm run build")
    print("      cp -r dist/* '../Primus C#/web/'")
    print("      cd '../Primus C#' && pwsh ./build-installer.ps1")
    print("  - The client_secret value just passed through this script. If")
    print("    it ever appears in a chat log, transcript, or screenshot:")
    print("    rotate it in Cloud Console and re-run this script with the")
    print("    fresh JSON download.")


if __name__ == "__main__":
    main()
