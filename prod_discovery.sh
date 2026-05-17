#!/bin/bash
# Prod DB discovery script — RUN ON PROD via SSH.
#
# Read-only. Does not modify anything. Outputs a complete map of:
#   - all databases on the PG server
#   - every table in clutchhh_db, clutchhh_global, and every clutchhh_cafe_N
#   - alembic_version state per DB
#   - which cafe DBs are drifted (have different table sets)
#   - row counts on critical tables (proves whether DBs are actually used)
#   - prod's runtime shape (Docker? native? what's running?)
#
# Usage on prod:
#   bash prod_discovery.sh > prod_discovery_output.txt 2>&1
#   cat prod_discovery_output.txt   # or scp it back
#
# Sections are clearly labeled — paste the whole thing back.

set +e   # don't abort on a failed query — keep going

PSQL="sudo -u postgres psql -At -F'|'"   # -A unaligned, -t tuple-only, -F field sep

echo "=========================================================="
echo "  Prod DB discovery — $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "=========================================================="

# ── 1. Server-level: what databases exist? ──────────────────────────
echo
echo "## 1. All databases on this server"
sudo -u postgres psql -c "\l" 2>&1 | grep -E "^ [a-z_]" | awk '{print "  - " $1}' | sort -u

# ── 2. For each interesting DB: alembic_version + table list ────────
INTERESTING="clutchhh_db clutchhh_global primus_cafe_1"
CAFE_DBS=$(sudo -u postgres psql -At -c "SELECT datname FROM pg_database WHERE datname LIKE 'clutchhh_cafe_%' ORDER BY datname;")

echo
echo "## 2. Cafe DBs found"
for db in $CAFE_DBS; do
  echo "  - $db"
done

echo
echo "## 3. alembic_version per DB"
echo "  (NOT_PRESENT means the alembic_version table doesn't exist in that DB)"
for db in $INTERESTING $CAFE_DBS; do
  result=$(sudo -u postgres psql -At -d "$db" -c "SELECT version_num FROM alembic_version;" 2>&1)
  if echo "$result" | grep -q "does not exist"; then
    echo "  $db: NOT_PRESENT"
  else
    echo "  $db: $result"
  fi
done

# ── 4. Full table list for clutchhh_db and clutchhh_global ──────────
echo
echo "## 4. Tables in clutchhh_db"
sudo -u postgres psql -At -d clutchhh_db -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1 | sed 's/^/  /'

echo
echo "## 5. Tables in clutchhh_global"
sudo -u postgres psql -At -d clutchhh_global -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1 | sed 's/^/  /'

# ── 5. Cafe DB schema drift: are all 16 cafe DBs in sync? ───────────
echo
echo "## 6. Cafe DB schema (table list per cafe DB, hashed for diff)"
echo "  Each row: <hash> <db_name>. Same hash = same table set. Different hash = drift."
declare -A SCHEMA_HASH_TO_DBS
for db in $CAFE_DBS; do
  tables=$(sudo -u postgres psql -At -d "$db" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1)
  h=$(echo "$tables" | md5sum | cut -c1-12)
  echo "  $h  $db"
done

# ── 6. Detailed table list for cafe_1 (representative) ──────────────
echo
echo "## 7. Tables in clutchhh_cafe_1 (representative cafe DB)"
sudo -u postgres psql -At -d clutchhh_cafe_1 -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1 | sed 's/^/  /'

echo
echo "## 8. Tables in primus_cafe_1 (legacy?)"
sudo -u postgres psql -At -d primus_cafe_1 -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>&1 | sed 's/^/  /'

# ── 7. The 8 tables-of-interest: which DBs have which? ──────────────
echo
echo "## 9. The 8 tables we care about — where do they live?"
TABLES_OF_INTEREST="campaigns subscriptions invoices platform_financial_audit payment_intents reports_daily squad_bookings time_slot_pricing_rules"
echo "  Legend: 'DB ✓' = table present, '-' = absent"
echo
printf "  %-30s" "table"
for db in clutchhh_db clutchhh_global $(echo $CAFE_DBS | tr ' ' '\n' | head -3) primus_cafe_1; do
  printf " %-18s" "$db"
done
echo
for t in $TABLES_OF_INTEREST; do
  printf "  %-30s" "$t"
  for db in clutchhh_db clutchhh_global $(echo $CAFE_DBS | tr ' ' '\n' | head -3) primus_cafe_1; do
    exists=$(sudo -u postgres psql -At -d "$db" -c "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='$t';" 2>/dev/null)
    if [ "$exists" = "1" ]; then
      printf " %-18s" "✓"
    else
      printf " %-18s" "-"
    fi
  done
  echo
done

# ── 8. Row counts on cafe_1 tables (which features are actually used?) ──
echo
echo "## 10. Row counts on clutchhh_cafe_1 tables-of-interest"
for t in campaigns payment_intents reports_daily; do
  c=$(sudo -u postgres psql -At -d clutchhh_cafe_1 -c "SELECT COUNT(*) FROM $t;" 2>/dev/null)
  echo "  $t: $c rows"
done

echo
echo "## 11. Row counts in clutchhh_global"
for t in users cafes licenses client_pcs; do
  c=$(sudo -u postgres psql -At -d clutchhh_global -c "SELECT COUNT(*) FROM $t;" 2>/dev/null)
  echo "  $t: $c rows"
done

# ── 9. Total table count per DB ────────────────────────────────────
echo
echo "## 12. Total table count per DB"
for db in clutchhh_db clutchhh_global primus_cafe_1 $CAFE_DBS; do
  c=$(sudo -u postgres psql -At -d "$db" -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null)
  echo "  $db: $c tables"
done

# ── 10. Runtime shape: is the backend running natively or in Docker? ──
echo
echo "## 13. Runtime shape on prod"
echo "  - Docker containers running:"
docker ps 2>&1 | tail -n +1 | sed 's/^/    /' || echo "    (docker not available or not used)"
echo "  - Systemd units matching primus/clutchhh:"
systemctl list-units --type=service 2>/dev/null | grep -iE 'primus|clutchhh' | sed 's/^/    /' || echo "    (none / systemd not available)"
echo "  - Python processes hosting the backend:"
ps aux | grep -iE 'uvicorn|gunicorn|fastapi|alembic' | grep -v grep | sed 's/^/    /'

# ── 11. .env essentials ────────────────────────────────────────────
echo
echo "## 14. .env essentials (DB + multi-DB flags)"
grep -E "^MULTI_DB_ENABLED|^ENVIRONMENT|^DATABASE_URL|^GLOBAL_DATABASE_URL|^APP_BASE_URL" ~/Primusbackend/backend/.env 2>/dev/null | sed 's/:.*@/:REDACTED@/' | sed 's/^/  /' || echo "  (.env not found at ~/Primusbackend/backend/.env)"

echo
echo "=========================================================="
echo "  END of prod discovery"
echo "=========================================================="
