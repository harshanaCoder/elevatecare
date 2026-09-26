#!/bin/bash
# Restores a backup produced by db/backup.sh — REPLACES all current data.
#
# Usage:
#   ./db/restore.sh backups/elevatecare_20260101_020000.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
DB_NAME="${DB_NAME:-elevatecare_db}"

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: db/restore.sh <path-to-backup.sql.gz>"
    echo "Available backups:"
    ls -1t backups/elevatecare_*.sql.gz 2>/dev/null || echo "  (none found in backups/)"
    exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ File not found: $BACKUP_FILE"
    exit 1
fi

echo "⚠️  This REPLACES all current data in '$DB_NAME' with the contents of:"
echo "    $BACKUP_FILE"
read -p "Type YES to continue: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
    echo "Cancelled — nothing changed."
    exit 1
fi

gunzip -c "$BACKUP_FILE" | docker compose exec -T -e MYSQL_PWD="${DB_PASSWORD}" db \
    mysql -u root "$DB_NAME"

echo "✅ Restore complete."
