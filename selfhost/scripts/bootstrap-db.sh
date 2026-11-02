#!/usr/bin/env bash
# Lädt das Nurvo-Schema + alle Migrationen in die laufende Selfhost-DB.
# Voraussetzung: der Supabase-Stack läuft (db + auth sind hochgefahren), damit das `auth`-Schema
# (auf das FKs zeigen) bereits existiert.
#
# Ausführen AUS dem geklonten supabase/docker-Verzeichnis (damit `docker compose` den Stack kennt):
#   NURVO_REPO=/pfad/zu/nurvo bash "$NURVO_REPO/selfhost/scripts/bootstrap-db.sh"
#
# Optional: DB_SERVICE (Default: db) überschreiben, falls der Servicename abweicht.

set -euo pipefail

: "${NURVO_REPO:?Bitte NURVO_REPO auf das nurvo-Repo-Verzeichnis setzen}"
DB_SERVICE="${DB_SERVICE:-db}"

psql() { docker compose exec -T "$DB_SERVICE" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }

echo "→ Verbindung testen…"
psql -c "select version();" >/dev/null

echo "→ Basis-Schema (supabase/schema.sql)…"
psql < "$NURVO_REPO/supabase/schema.sql"

echo "→ Migrationen (supabase/migrations/*.sql, in Reihenfolge)…"
for f in $(ls "$NURVO_REPO"/supabase/migrations/*.sql | sort); do
  echo "   • $(basename "$f")"
  psql < "$f"
done

echo "✓ DB-Bootstrap abgeschlossen."
