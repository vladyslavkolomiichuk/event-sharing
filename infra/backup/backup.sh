#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE before starting backups}"
if (( ${#BACKUP_PASSPHRASE} < 16 )); then
  echo 'BACKUP_PASSPHRASE must contain at least 16 characters.' >&2
  exit 1
fi
retention=${BACKUP_RETENTION_DAYS:-30}
if [[ ! "$retention" =~ ^[0-9]+$ ]] || (( retention < 1 || retention > 3650 )); then
  echo 'BACKUP_RETENTION_DAYS must be between 1 and 3650.' >&2
  exit 1
fi

mkdir -p /backups
chmod 700 /backups
export GNUPGHOME
GNUPGHOME=$(mktemp -d)
temporary=''
lock_pid=''

cleanup() {
  if [[ -n "$lock_pid" ]]; then
    kill "$lock_pid" 2>/dev/null || true
    wait "$lock_pid" 2>/dev/null || true
  fi
  if [[ -n "$temporary" && -d "$temporary" ]]; then
    rm -rf -- "$temporary"
  fi
  rm -rf -- "$GNUPGHOME"
}
trap cleanup EXIT

encrypt() {
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --output "$1" 3<<<"$BACKUP_PASSPHRASE"
}

decrypt() {
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt "$1" 3<<<"$BACKUP_PASSPHRASE"
}

backup() {
  local name line=''
  name="backup-$(date -u +%Y%m%dT%H%M%SZ)-$(cat /proc/sys/kernel/random/uuid)"
  temporary=$(mktemp -d /backups/.partial-XXXXXXXX) || return 1

  coproc STORAGE_LOCK { exec psql -X -qAt -v ON_ERROR_STOP=1 -d storage_db; }
  lock_pid=$STORAGE_LOCK_PID
  printf '%s\n' 'SELECT pg_advisory_lock(194727201);' "SELECT 'locked';" >&"${STORAGE_LOCK[1]}"
  while IFS= read -r -t 60 line <&"${STORAGE_LOCK[0]}"; do
    [[ "$line" == locked ]] && break
  done
  if [[ "$line" != locked ]]; then
    echo 'Could not lock file storage for backup.' >&2
    return 1
  fi

  pg_dumpall --no-password | encrypt "$temporary/databases.sql.gpg" || return 1
  tar -C /data/files -czf - . | encrypt "$temporary/files.tar.gz.gpg" || return 1
  local configuration=(.env)
  for service in auth users events participation messages notifications geo-search event-log storage; do
    configuration+=("services/$service/.env")
  done
  configuration+=(apps/gateway/.env)
  tar -C /configuration -czf - "${configuration[@]}" | encrypt "$temporary/configuration.tar.gz.gpg" || return 1
  decrypt "$temporary/databases.sql.gpg" >/dev/null || return 1
  decrypt "$temporary/files.tar.gz.gpg" | tar -tzf - >/dev/null || return 1
  decrypt "$temporary/configuration.tar.gz.gpg" | tar -tzf - >/dev/null || return 1
  printf '\\q\n' >&"${STORAGE_LOCK[1]}" || return 1
  wait "$lock_pid" || return 1
  lock_pid=''

  (cd "$temporary" && sha256sum databases.sql.gpg files.tar.gz.gpg configuration.tar.gz.gpg > SHA256SUMS) || return 1
  mv -- "$temporary" "/backups/$name" || return 1
  temporary=''
  find /backups -mindepth 1 -maxdepth 1 -type d -name 'backup-20*' \
    -mtime "+$retention" -exec rm -rf -- {} + || return 1
  echo "Encrypted project backup created: $name"
}

if [[ ${1:-} == --once ]]; then
  backup
else
  while true; do
    if backup; then
      sleep 86400
    else
      echo 'Project backup failed; retrying in five minutes.' >&2
      cleanup
      GNUPGHOME=$(mktemp -d)
      temporary=''
      lock_pid=''
      sleep 300
    fi
  done
fi
