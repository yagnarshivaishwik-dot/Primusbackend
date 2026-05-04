-- =============================================================================
-- seed_superadmin.sql
-- Direct-to-Postgres fallback for inserting / updating the Primus SuperAdmin.
--
-- USE THE PYTHON SCRIPT INSTEAD whenever the backend venv is available
-- (scripts/seed_superadmin.py). Argon2 hashing in pure SQL is not feasible
-- so this file expects you to compute the hash externally and substitute it.
--
-- WHEN TO USE THIS FILE
--   * You cannot run Python on the Azure VM (rare).
--   * You need to recover access by injecting a known argon2 hash you
--     already generated on a trusted workstation.
--   * You're running Azure Database for PostgreSQL Flexible Server and
--     want to manage the row from the Azure portal Query Editor.
--
-- HOW TO GENERATE THE PASSWORD HASH FROM A TRUSTED MACHINE
--   python3 -c "
-- import hashlib, getpass
-- from argon2 import PasswordHasher
-- pw = getpass.getpass('SuperAdmin password: ')
-- norm = hashlib.sha256(pw.encode('utf-8')).hexdigest()
-- print(PasswordHasher().hash(norm))
-- "
--
-- The output looks like: $argon2id$v=19$m=65536,t=3,p=4$...
-- Paste it into the :superadmin_hash psql variable below.
--
-- HOW TO RUN
--   psql "postgresql://primus_user:***@<azure-host>:5432/primus_global" \
--        -v superadmin_email='admin@primusadmin.in' \
--        -v superadmin_username='primus' \
--        -v superadmin_first_name='Primus' \
--        -v superadmin_last_name='Admin' \
--        -v superadmin_hash='$argon2id$v=19$m=65536,t=3,p=4$....' \
--        -f scripts/seed_superadmin.sql
--
-- This script is idempotent: it INSERTs if the user is missing, UPDATEs
-- (password + role) if the email or username already exists.
-- =============================================================================

\set ON_ERROR_STOP on
\echo Connected to: :DBNAME on :HOST as :USER

BEGIN;

-- Sanity: required variables must be present.
DO $$
BEGIN
    IF current_setting('superadmin_email', true) IS NULL
       OR current_setting('superadmin_email', true) = '' THEN
        RAISE EXCEPTION 'Missing -v superadmin_email=...';
    END IF;
    IF current_setting('superadmin_hash', true) IS NULL
       OR position('$argon2' IN current_setting('superadmin_hash', true)) <> 1 THEN
        RAISE EXCEPTION 'Missing or invalid -v superadmin_hash=$argon2id$...';
    END IF;
END $$;

-- Confirm the users table exists in this database.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'users'
    ) THEN
        RAISE EXCEPTION
          'No users table in this database (%). Did you connect to primus_global?',
          current_database();
    END IF;
END $$;

-- Upsert the SuperAdmin row. Match on email OR username.
WITH upsert AS (
    UPDATE users
       SET name              = :'superadmin_username',
           role              = 'superadmin',
           password_hash     = :'superadmin_hash',
           first_name        = :'superadmin_first_name',
           last_name         = :'superadmin_last_name',
           is_email_verified = TRUE
     WHERE email = :'superadmin_email'
        OR name  = :'superadmin_username'
     RETURNING id
)
INSERT INTO users (
    name, email, role, password_hash,
    first_name, last_name, is_email_verified,
    wallet_balance, coins_balance
)
SELECT
    :'superadmin_username',
    :'superadmin_email',
    'superadmin',
    :'superadmin_hash',
    :'superadmin_first_name',
    :'superadmin_last_name',
    TRUE,
    0,
    0
WHERE NOT EXISTS (SELECT 1 FROM upsert);

-- Best-effort audit row. The audit_logs table may or may not exist; if it
-- does not, we ignore the failure rather than aborting the SuperAdmin seed.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs'
    ) THEN
        INSERT INTO audit_logs (user_id, action, details, created_at)
        SELECT id,
               'superadmin_seed_sql',
               'SuperAdmin row created/updated via seed_superadmin.sql',
               NOW()
          FROM users
         WHERE email = current_setting('superadmin_email');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping audit log insert: %', SQLERRM;
END $$;

COMMIT;

\echo
\echo SuperAdmin row written. Verify:
SELECT id, name, email, role, is_email_verified
  FROM users
 WHERE email = :'superadmin_email'
    OR name  = :'superadmin_username';
