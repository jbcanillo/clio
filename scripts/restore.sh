#!/usr/bin/env bash
# Restores a backup made by backup.sh into EMPTY vault/data targets.
#
#   BACKUP_PASSPHRASE=... scripts/restore.sh <backup-file>
#
# Refuses to touch a target that already has files unless CLIO_RESTORE_FORCE=1.
# Stop the stack first (docker compose stop) when restoring into the live volumes.
set -euo pipefail

file=${1:?usage: restore.sh <backup-file>}
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE must be set}"
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }

project=${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}
vault_volume=${CLIO_VAULT_VOLUME:-${project}_vault}
data_volume=${CLIO_DATA_VOLUME:-${project}_data}

tmp=$(mktemp -d)
cleanup() { [ -n "${tmp:-}" ] && [ -d "$tmp" ] && rm -rf -- "$tmp"; }
trap cleanup EXIT

# Decrypt first: a wrong passphrase must fail before anything is written.
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" | tar -C "$tmp" -xf - 2>/dev/null; then
  echo "Could not decrypt the backup (wrong passphrase or damaged file)." >&2
  exit 1
fi
[ -f "$tmp/vault.tar" ] && [ -f "$tmp/data.tar" ] || { echo "Backup is incomplete." >&2; exit 1; }

dir_mode=0
[ -n "${CLIO_VAULT_DIR:-}" ] && [ -n "${CLIO_DATA_DIR:-}" ] && dir_mode=1

is_empty_dir() { [ -z "$(ls -A "$1" 2>/dev/null)" ]; }
is_empty_volume() { [ -z "$(docker run --rm -v "$1":/t alpine ls -A /t)" ]; }

if [ "${CLIO_RESTORE_FORCE:-0}" != "1" ]; then
  if [ "$dir_mode" = 1 ]; then
    is_empty_dir "$CLIO_VAULT_DIR" && is_empty_dir "$CLIO_DATA_DIR" || { echo "Target is not empty. Set CLIO_RESTORE_FORCE=1 to overwrite." >&2; exit 1; }
  else
    is_empty_volume "$vault_volume" && is_empty_volume "$data_volume" || { echo "Target volumes are not empty. Set CLIO_RESTORE_FORCE=1 to overwrite." >&2; exit 1; }
  fi
fi

if [ "$dir_mode" = 1 ]; then
  tar -C "$CLIO_VAULT_DIR" -xf "$tmp/vault.tar"
  tar -C "$CLIO_DATA_DIR" -xf "$tmp/data.tar"
else
  for pair in "vault:$vault_volume" "data:$data_volume"; do
    name=${pair%%:*}; vol=${pair#*:}
    docker run --rm -v "$vol":/dst -v "$tmp":/in:ro alpine tar -C /dst -xf "/in/$name.tar"
  done
fi
echo "Restore complete."
