from datetime import UTC, datetime

import pytest

from app.api.endpoints.auth import create_access_token
from app.models import Cafe, ClientPC, License, RemoteCommand, SystemEvent, User


@pytest.fixture
def auth_headers(admin_user):
    token = create_access_token({"sub": admin_user.email, "role": "admin"})
    return {"Authorization": f"Bearer {token}"}


def test_cafe_onboarding(client, db_session):
    """Test the full cafe onboarding flow."""
    onboard_data = {
        "full_name": "Test Owner",
        "email": "owner@example.com",
        "preferred_username": "testowner",
        "cafe_name": "Test Cafe",
        "cafe_location": "Test Location",
        "pc_count": 10,
        "mobile_number": "1234567890",
        "accept_terms": True,
    }

    response = client.post("/api/cafe/onboard", json=onboard_data)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Verify DB records
    cafe = db_session.query(Cafe).filter_by(name="Test Cafe").first()
    assert cafe is not None

    owner = db_session.query(User).filter_by(email="owner@example.com").first()
    assert owner is not None
    assert owner.cafe_id == cafe.id

    license = db_session.query(License).filter_by(cafe_id=cafe.id).first()
    assert license is not None
    assert license.max_pcs == 10


def test_device_registration_and_handshake(client, db_session):
    """Test idempotent device registration."""
    # 1. Setup a cafe and license
    cafe = Cafe(name="Reg Cafe")
    db_session.add(cafe)
    db_session.flush()

    license = License(key="TEST-KEY", cafe_id=cafe.id, max_pcs=5, is_active=True)
    db_session.add(license)
    db_session.commit()

    # 2. Register PC
    reg_data = {
        "name": "PC-01",
        "license_key": "TEST-KEY",
        "hardware_fingerprint": "hw-123",
        "capabilities": {"features": ["lock", "unlock"]},
    }

    response = client.post("/api/clientpc/register", json=reg_data)
    assert response.status_code == 200
    data = response.json()
    assert "device_secret" in data
    pc_id = data["id"]

    # 3. Idempotent registration (same hardware fingerprint)
    response = client.post("/api/clientpc/register", json=reg_data)
    assert response.status_code == 200
    assert response.json()["id"] == pc_id

    # 4. Verify system event emitted
    event = db_session.query(SystemEvent).filter_by(pc_id=pc_id, type="pc.status").first()
    assert event is not None


def test_command_pipeline_pull_and_ack(client, db_session, admin_user):
    """Test the durable command pull and ACK pipeline."""
    # 1. Setup
    cafe = Cafe(name="Cmd Cafe")
    db_session.add(cafe)
    db_session.flush()
    admin_user.cafe_id = cafe.id

    license = License(key="KEY", cafe_id=cafe.id, max_pcs=5, is_active=True)
    db_session.add(license)
    db_session.flush()

    pc = ClientPC(
        name="Cmd-PC",
        cafe_id=cafe.id,
        license_key="KEY",
        hardware_fingerprint="fp-1",
        device_secret="secret-123",
        status="online",
        last_seen=datetime.now(UTC),
        capabilities={"features": ["lock"]},
    )
    db_session.add(pc)
    db_session.commit()

    admin_token = create_access_token({"sub": admin_user.email, "role": "admin"})

    # 2. Admin sends command
    send_res = client.post(
        "/api/command/send",
        json={"pc_id": pc.id, "command": "lock", "params": None},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert send_res.status_code == 200
    cmd_id = send_res.json()["id"]

    # 3. PC pulls command (Long-Polling)
    # We'll use a short timeout for the test
    import hashlib
    import hmac
    import time

    def get_signed_headers(pc_id, secret, method, path, body_bytes):
        ts = str(int(time.time()))
        nonce = "nonce123"
        msg = f"{method}{path}{ts}{nonce}".encode() + body_bytes
        sig = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
        return {
            "X-PC-ID": str(pc_id),
            "X-Device-Signature": sig,
            "X-Device-Timestamp": ts,
            "X-Device-Nonce": nonce,
        }

    pull_body = b'{"timeout": 1}'
    headers = get_signed_headers(pc.id, "secret-123", "POST", "/api/command/pull", pull_body)

    pull_res = client.post("/api/command/pull", content=pull_body, headers=headers)
    assert pull_res.status_code == 200
    cmds = pull_res.json()
    assert len(cmds) == 1
    assert cmds[0]["id"] == cmd_id
    assert cmds[0]["state"] == "DELIVERED"

    # 4. PC ACKs command
    ack_payload = {"command_id": cmd_id, "state": "SUCCEEDED", "result": {"ok": True}}
    import json

    ack_body = json.dumps(ack_payload).encode()
    headers = get_signed_headers(pc.id, "secret-123", "POST", "/api/command/ack", ack_body)

    ack_res = client.post("/api/command/ack", content=ack_body, headers=headers)
    assert ack_res.status_code == 200

    # 5. Verify command state in DB
    db_session.expire_all()
    cmd_db = db_session.query(RemoteCommand).get(cmd_id)
    assert cmd_db.state == "SUCCEEDED"
    assert cmd_db.executed is True
