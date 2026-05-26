# `app/services` — domain service layer

This package holds **domain services**: stateless classes / functions that
implement business rules and own ORM mutations on behalf of the HTTP
endpoints.

The pattern, in one sentence: **endpoints translate HTTP, services
translate domain operations**. An endpoint should never reach into
`db.query(...)` for a five-line procedure that another endpoint also
needs — promote the procedure into a service.

## Why this package exists

Forensic audit finding: of the 60 endpoint files, only 9 use the
`crud/` package. The other 51 do raw `db.query` / `db.add` /
`db.commit()` inline, frequently duplicating logic (e.g. four endpoints
all have their own version of "credit the wallet, idempotent by
(source, source_ref)"). This package replaces that pattern.

## Layout

```
app/services/
├── wallet_service.py             # money in / money out, idempotent
├── cashfree_webhook_service.py   # one-shot HMAC + replay + credit pipeline
├── cashfree_service.py           # outbound Cashfree client (legacy)
├── financial_audit.py            # append-only mirror to platform DB
├── webhook_delivery.py           # outbound webhook fan-out
├── profile_picture_storage.py    # Azure Blob upload (legacy)
└── subscription.py               # SaaS billing
```

## The rules

### 1. Services don't commit

```python
# GOOD
class WalletService:
    @classmethod
    def credit(cls, db: Session, **kwargs) -> CreditResult:
        ...
        db.add(txn)
        db.flush()   # populate IDs, stay in the caller's transaction
        return result
```

```python
# BAD — caller can no longer atomically batch a credit + a UserOffer insert
class WalletService:
    @classmethod
    def credit(cls, db, ...):
        db.add(txn)
        db.commit()  # ← takes the choice away from the endpoint
```

The endpoint owns the transaction boundary. The service participates in
whatever transaction the caller started.

### 2. Services don't take FastAPI types

Services accept primitive arguments (ints, dataclasses, ORM rows) and a
`Session`. They do **not** depend on `Request`, `Depends(...)`, or
`HTTPException`. Endpoints catch domain errors and translate them into
HTTP responses.

```python
# GOOD
@classmethod
def credit(cls, db, *, user_id: int, amount: float, ...) -> CreditResult:
    if amount <= 0:
        raise ValueError("credit amount must be positive")
    ...
```

```python
# BAD
@classmethod
def credit(cls, db, request: Request, ...) -> CreditResult:
    if amount <= 0:
        raise HTTPException(status_code=400, detail="...")  # service shouldn't know about HTTP
```

### 3. Services are stateless

A service class is a namespace. No instance state. Use `@staticmethod` or
`@classmethod`. This lets the same service be safely called from a
sync endpoint, an async endpoint, a Celery task, or a CLI script
without worrying about thread/asyncio safety.

### 4. Idempotency through `(source, source_ref)`

Any service that writes a financial row MUST accept `source` and
`source_ref` and de-duplicate on them. The standard ledger description
format is:

```
"{source}:{source_ref}:{free-form detail}"
```

`WalletService.find_existing()` performs the lookup. A future DB
migration will add a real `UNIQUE (source, source_ref)` constraint —
service code shouldn't rely on the column existing today, but it
shouldn't get in the way of adding it tomorrow either.

## Demonstrated example: `billing.calculate_billing`

`app/api/endpoints/billing.py` was the first endpoint converted to the
new pattern. Before:

- two `db.commit()` calls inside `calculate_billing`
- a `try: ... except Exception: pass` around the audit-mirror call
- caller couldn't roll back a failed coin-grant without losing the
  wallet debit

After:

- single `db.commit()` at the end of the function
- audit-mirror failure is logged via `logger.exception()`
- caller owns the transaction boundary

Future endpoint refactors should follow this shape:

```python
@router.post("/...")
def my_endpoint(..., db: Session = Depends(get_db)):
    try:
        result = MyService.do_thing(db, user_id=..., amount=...)
        db.commit()
    except DomainError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **result.as_dict()}
```

## Adding a new service

1. Create `app/services/<area>_service.py`.
2. Expose a class `class XxxService:` with `@classmethod` or
   `@staticmethod` methods.
3. Accept a `Session` as the first positional argument.
4. **Never** call `db.commit()` inside a service method.
5. Document the idempotency contract if the service writes financial rows.
6. Add an import to `app/services/__init__.py` if you want a top-level
   re-export, but it's fine to leave that empty too.
