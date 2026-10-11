#!/bin/sh
# Creates (or refreshes) a LIMITED MySQL account for the app, so the web app never
# connects as MySQL root. The app only ever needs to read and write rows — never
# to create/drop tables or touch other databases — so that is all this grants.
#
# Runs automatically the first time the db volume is created (it is mounted into
# /docker-entrypoint-initdb.d by docker-compose.yml). For an ALREADY-provisioned
# database, run it once by hand:
#   docker compose exec -T -e APP_DB_USER -e APP_DB_PASSWORD db sh /docker-entrypoint-initdb.d/20-create-app-user.sh
# (with APP_DB_USER / APP_DB_PASSWORD exported from your .env first), then restart the app.
#
# Written with if/fi instead of `exit` because the image may *source* this file,
# and `exit` would then kill the whole database entrypoint.
if [ -n "$APP_DB_USER" ] && [ -n "$APP_DB_PASSWORD" ]; then
    # Letters, digits, _ and - only: the values go into SQL text below.
    case "$APP_DB_USER$APP_DB_PASSWORD" in
        *[!A-Za-z0-9_-]*)
            echo "create-app-user: APP_DB_USER / APP_DB_PASSWORD may only contain letters, digits, _ and -  (skipping)" >&2
            ;;
        *)
            DB="${MYSQL_DATABASE:-elevatecare_db}"
            mysql -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE USER IF NOT EXISTS '$APP_DB_USER'@'%' IDENTIFIED BY '$APP_DB_PASSWORD';
ALTER USER '$APP_DB_USER'@'%' IDENTIFIED BY '$APP_DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`$DB\`.* TO '$APP_DB_USER'@'%';
FLUSH PRIVILEGES;
SQL
            echo "create-app-user: limited account '$APP_DB_USER' ready on database '$DB'"
            ;;
    esac
fi
