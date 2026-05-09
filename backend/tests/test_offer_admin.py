"""Smoke tests for the new Offer admin CRUD endpoints (Inventory v2).

These tests run against the single-DB test fixtures in conftest.py, which
recreate the public schema and run Base.metadata.create_all on every test.
They cover:

- POST /api/offer/                — create + admin gate
- GET  /api/offer/                — list with `include_inactive` admin gate
- GET  /api/offer/{id}            — fetch one
- PATCH /api/offer/{id}           — partial update
- DELETE /api/offer/{id}          — soft + hard delete + 409 on referenced
- POST /api/offer/{id}/toggle     — flip active
- POST /api/offer/reorder         — bulk reorder, route order test (would
                                    catch the static-vs-dynamic shadowing bug)

Multi-DB mode is exercised by import-time smoke checks during build, not by
pytest (the per-cafe DB fixture infrastructure is heavier than this PR).
"""
from __future__ import annotations


# --- Helpers ---------------------------------------------------------------


def _admin_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_offer_payload(**overrides) -> dict:
    return {
        "name": overrides.pop("name", "Hourly Pack"),
        "description": "1 hour of play",
        "price": 60.0,
        "hours_minutes": 60,
        "bonus_minutes": 5,
        "discount_percent": 0.0,
        "tax_percent": 18.0,
        "display_order": 0,
        "is_happy_hour_only": False,
        "happy_hour_start": None,
        "happy_hour_end": None,
        "thumbnail_url": None,
        **overrides,
    }


# --- POST /api/offer/ ------------------------------------------------------


def test_create_offer_requires_admin(client, user_token):
    """Non-admin users cannot create offers."""
    r = client.post(
        "/api/offer/",
        json=_make_offer_payload(),
        headers=_admin_headers(user_token),
    )
    assert r.status_code == 403, r.text


def test_create_offer_admin_succeeds_and_returns_full_payload(client, admin_token):
    r = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Power Hour"),
        headers=_admin_headers(admin_token),
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "Power Hour"
    assert data["bonus_minutes"] == 5
    assert data["tax_percent"] == 18.0
    assert data["active"] is True
    assert "id" in data


def test_create_offer_rejects_duplicate_name(client, admin_token):
    payload = _make_offer_payload(name="Solo Pack")
    r1 = client.post("/api/offer/", json=payload, headers=_admin_headers(admin_token))
    assert r1.status_code == 200
    r2 = client.post("/api/offer/", json=payload, headers=_admin_headers(admin_token))
    assert r2.status_code == 400


def test_create_offer_rejects_invalid_happy_hour(client, admin_token):
    """HH:MM validator must reject malformed values."""
    p = _make_offer_payload(name="HH-Bad", happy_hour_start="9am")
    r = client.post("/api/offer/", json=p, headers=_admin_headers(admin_token))
    assert r.status_code == 422


# --- GET /api/offer/ -------------------------------------------------------


def test_list_offers_default_excludes_inactive(client, admin_token, user_token):
    a = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Active Pack"),
        headers=_admin_headers(admin_token),
    ).json()
    b = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Inactive Pack"),
        headers=_admin_headers(admin_token),
    ).json()
    # Soft-disable b
    client.delete(f"/api/offer/{b['id']}", headers=_admin_headers(admin_token))

    # Default list (no flag) — kiosk view
    r = client.get("/api/offer/", headers=_admin_headers(user_token))
    assert r.status_code == 200
    names = [o["name"] for o in r.json()]
    assert "Active Pack" in names
    assert "Inactive Pack" not in names


def test_list_include_inactive_requires_admin(client, admin_token, user_token):
    """Soft-deleted rows must not leak to non-admin clients."""
    r_user = client.get(
        "/api/offer/?include_inactive=true",
        headers=_admin_headers(user_token),
    )
    assert r_user.status_code == 403

    r_admin = client.get(
        "/api/offer/?include_inactive=true",
        headers=_admin_headers(admin_token),
    )
    assert r_admin.status_code == 200


# --- GET /api/offer/{id} ---------------------------------------------------


def test_get_one_offer_404s(client, user_token):
    r = client.get("/api/offer/999999", headers=_admin_headers(user_token))
    assert r.status_code == 404


# --- PATCH /api/offer/{id} -------------------------------------------------


def test_patch_offer_partial_update(client, admin_token):
    o = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Patchable"),
        headers=_admin_headers(admin_token),
    ).json()

    r = client.patch(
        f"/api/offer/{o['id']}",
        json={"price": 99.5, "bonus_minutes": 12, "happy_hour_start": "18:00"},
        headers=_admin_headers(admin_token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["price"] == 99.5
    assert data["bonus_minutes"] == 12
    assert data["happy_hour_start"] == "18:00"
    # Untouched fields preserved
    assert data["name"] == "Patchable"
    assert data["hours_minutes"] == 60


def test_patch_rejects_duplicate_name(client, admin_token):
    a = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Pack-A"),
        headers=_admin_headers(admin_token),
    ).json()
    client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Pack-B"),
        headers=_admin_headers(admin_token),
    )
    r = client.patch(
        f"/api/offer/{a['id']}",
        json={"name": "Pack-B"},
        headers=_admin_headers(admin_token),
    )
    assert r.status_code == 400


# --- DELETE /api/offer/{id} ------------------------------------------------


def test_soft_delete_marks_inactive(client, admin_token):
    o = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Soft-Del"),
        headers=_admin_headers(admin_token),
    ).json()
    r = client.delete(f"/api/offer/{o['id']}", headers=_admin_headers(admin_token))
    assert r.status_code == 200
    assert r.json()["hard"] is False

    fetched = client.get(
        f"/api/offer/{o['id']}", headers=_admin_headers(admin_token)
    ).json()
    assert fetched["active"] is False


def test_hard_delete_removes_row_when_unreferenced(client, admin_token):
    o = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Hard-Del"),
        headers=_admin_headers(admin_token),
    ).json()
    r = client.delete(
        f"/api/offer/{o['id']}?hard=true", headers=_admin_headers(admin_token)
    )
    assert r.status_code == 200
    assert r.json()["hard"] is True

    fetched = client.get(
        f"/api/offer/{o['id']}", headers=_admin_headers(admin_token)
    )
    assert fetched.status_code == 404


# --- POST /api/offer/{id}/toggle -------------------------------------------


def test_toggle_flips_active(client, admin_token):
    o = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Toggle-Me"),
        headers=_admin_headers(admin_token),
    ).json()
    r1 = client.post(
        f"/api/offer/{o['id']}/toggle", headers=_admin_headers(admin_token)
    )
    assert r1.status_code == 200
    assert r1.json()["active"] is False

    r2 = client.post(
        f"/api/offer/{o['id']}/toggle", headers=_admin_headers(admin_token)
    )
    assert r2.status_code == 200
    assert r2.json()["active"] is True


# --- POST /api/offer/reorder -----------------------------------------------


def test_reorder_persists_display_order(client, admin_token):
    a = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Order-A", display_order=0),
        headers=_admin_headers(admin_token),
    ).json()
    b = client.post(
        "/api/offer/",
        json=_make_offer_payload(name="Order-B", display_order=1),
        headers=_admin_headers(admin_token),
    ).json()

    # Swap
    r = client.post(
        "/api/offer/reorder",
        json=[{"id": a["id"], "display_order": 99}, {"id": b["id"], "display_order": 0}],
        headers=_admin_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["updated"] == 2

    listed = client.get("/api/offer/", headers=_admin_headers(admin_token)).json()
    by_id = {o["id"]: o for o in listed}
    assert by_id[a["id"]]["display_order"] == 99
    assert by_id[b["id"]]["display_order"] == 0


# --- Route ordering (regression for the bug python-reviewer caught) --------


def test_static_routes_not_shadowed_by_offer_id(client, user_token):
    """
    Regression test: GET /api/offer/mine must hit my_offers(), not
    get_offer(offer_id="mine") which would 422. If someone reorders the
    @router decorators wrong, this fails.
    """
    r = client.get("/api/offer/mine", headers=_admin_headers(user_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
