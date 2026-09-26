#!/bin/bash
# Dumps the running `db` container's database to backups/<timestamp>.sql.gz.
# Safe to run anytime the stack is up — mysqldump takes a consistent snapshot
# without stopping the database.
#
# Usage:
#   ./db/backup.sh
#
# Schedule it (on the server, once deployed) with cron, e.g. daily at 2am:
#   0 2 * * * cd /path/to/ElevateCare && ./db/backup.sh >> /var/log/elevatecare-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/elevatecare_${TIMESTAMP}.sql.gz"
DB_NAME="${DB_NAME:-elevatecare_db}"

# MYSQL_PWD (passed via -e, not `-p...` on the command line) so the password
# never shows up in `ps`/`docker top` output.
docker compose exec -T -e MYSQL_PWD="${DB_PASSWORD}" db \
    mysqldump -u root --single-transaction "$DB_NAME" | gzip > "$BACKUP_FILE"

echo "✅ Backup saved to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Keep only the most recent 14 backups (2 weeks at one-a-day) so this doesn't
# grow the disk forever.
ls -1t "$BACKUP_DIR"/elevatecare_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
