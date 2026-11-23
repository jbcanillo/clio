#!/usr/bin/env bash
# Encrypted backup of the Clio vault and data volumes.
#
#   BACKUP_PASSPHRASE=... scripts/backup.sh <output-dir>
#
# Docker mode (default): reads the compose volumes <project>_vault and <project>_data
#   (override with CLIO_VAULT_VOLUME / CLIO_DATA_VOLUME).
# Directory mode: set CLIO_VAULT_DIR and CLIO_DATA_DIR to back up plain folders.
set -euo pipefail

out_dir=${1:?usage: backup.sh <output-dir>}
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE must be set}"

project=${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}
vault_volume=${CLIO_VAULT_VOLUME:-${project}_vault}
data_volume=${CLIO_DATA_VOLUME:-${project}_data}

tmp=$(mktemp -d)
cleanup() { [ -n "${tmp:-}" ] && [ -d "$tmp" ] && rm -rf -- "$tmp"; }
trap cleanup EXIT

if [ -n "${CLIO_VAULT_DIR:-}" ] && [ -n "${CLIO_DATA_DIR:-}" ]; then
  tar -C "$CLIO_VAULT_DIR" -cf "$tmp/vault.tar" .
  tar -C "$CLIO_DATA_DIR" -cf "$tmp/data.tar" .
else
  for pair in "vault:$vault_volume" "data:$data_volume"; do
    name=${pair%%:*}; vol=${pair#*:}
    docker run --rm -v "$vol":/src:ro -v "$tmp":/out alpine tar -C /src -cf "/out/$name.tar" .
  done
fi

mkdir -p "$out_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$out_dir/clio-backup-$stamp.tar.enc"
umask 077
tar -C "$tmp" -cf - vault.tar data.tar \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
chmod 600 "$out"
echo "Backup written: $out"
