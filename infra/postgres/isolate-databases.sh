#!/bin/sh
set -eu

isolate() {
  database=$1
  role=$2
  password=$3

  psql -X -q -v ON_ERROR_STOP=1 -d postgres \
    -v database="$database" -v role="$role" -v password="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
ALTER ROLE :"role" PASSWORD :'password';
REVOKE ALL ON DATABASE :"database" FROM PUBLIC;
ALTER DATABASE :"database" OWNER TO :"role";
SQL

  psql -X -q -v ON_ERROR_STOP=1 -d "$database" -v role="$role" <<'SQL'
ALTER SCHEMA public OWNER TO :"role";

SELECT format(
  'ALTER %s %s OWNER TO %I',
  CASE relation.relkind WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
  relation.oid::regclass,
  :'role'
)
FROM pg_class relation
JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p', 'S')
  AND NOT EXISTS (
    SELECT FROM pg_depend dependency
    WHERE dependency.objid = relation.oid
      AND dependency.deptype IN ('e', 'a', 'i')
  ) \gexec

SELECT format('ALTER TYPE %s OWNER TO %I', type.oid::regtype, :'role')
FROM pg_type type
JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
WHERE namespace.nspname = 'public' AND type.typtype = 'e' \gexec

SELECT format('ALTER ROUTINE %s OWNER TO %I', routine.oid::regprocedure, :'role')
FROM pg_proc routine
JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
WHERE namespace.nspname = 'public'
  AND NOT EXISTS (
    SELECT FROM pg_depend dependency
    WHERE dependency.objid = routine.oid AND dependency.deptype = 'e'
  ) \gexec
SQL
}

psql -X -q -v ON_ERROR_STOP=1 -d postgres \
  -c 'REVOKE CONNECT ON DATABASE postgres, template1 FROM PUBLIC'

isolate auth_db auth_service "$AUTH_DB_PASSWORD"
isolate users_db users_service "$USERS_DB_PASSWORD"
isolate events_db events_service "$EVENTS_DB_PASSWORD"
isolate geo_search_db geo_search_service "$GEO_SEARCH_DB_PASSWORD"
isolate participation_db participation_service "$PARTICIPATION_DB_PASSWORD"
isolate notifications_db notifications_service "$NOTIFICATIONS_DB_PASSWORD"
isolate messages_db messages_service "$MESSAGES_DB_PASSWORD"
isolate event_log_db event_log_service "$EVENT_LOG_DB_PASSWORD"
isolate storage_db storage_service "$STORAGE_DB_PASSWORD"
