#!/usr/bin/env bash
# Round-trip test for backup.sh / restore.sh using plain directories (no Docker needed).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
cleanup() { [ -n "${work:-}" ] && [ -d "$work" ] && rm -rf -- "$work"; }
trap cleanup EXIT

export BACKUP_PASSPHRASE='test-passphrase-123'
src_vault="$work/src/vault"; src_data="$work/src/data"
mkdir -p "$src_vault/Clio/Daily" "$src_data"
printf -- '---\nprivate: true\n---\nSECRET-MARKER-123 my diary\n' > "$src_vault/Clio/Daily/2026-11-23.md"
printf '{"settings":true}\n' > "$src_data/settings.json"

fail() { echo "FAIL: $*" >&2; exit 1; }

# 1. backup creates exactly one encrypted file with restrictive permissions
CLIO_VAULT_DIR="$src_vault" CLIO_DATA_DIR="$src_data" "$here/backup.sh" "$work/out" > "$work/backup.log"
file=$(ls "$work"/out/clio-backup-*.tar.enc)
[ "$(ls "$work"/out | wc -l)" -eq 1 ] || fail "expected one backup file"
[ "$(stat -c %a "$file")" = "600" ] || fail "backup file must be mode 600"

# 2. the file does not contain the plaintext
if grep -q 'SECRET-MARKER-123' "$file"; then fail "plaintext found in encrypted backup"; fi

# 3. restore into empty directories reproduces the originals exactly
mkdir -p "$work/dst/vault" "$work/dst/data"
CLIO_VAULT_DIR="$work/dst/vault" CLIO_DATA_DIR="$work/dst/data" "$here/restore.sh" "$file" > "$work/restore.log"
diff -r "$src_vault" "$work/dst/vault" || fail "vault differs after restore"
diff -r "$src_data" "$work/dst/data" || fail "data differs after restore"

# 4. wrong passphrase is refused and writes nothing
mkdir -p "$work/bad/vault" "$work/bad/data"
if BACKUP_PASSPHRASE='nope' CLIO_VAULT_DIR="$work/bad/vault" CLIO_DATA_DIR="$work/bad/data" "$here/restore.sh" "$file" 2>/dev/null; then fail "restore must fail with the wrong passphrase"; fi
[ -z "$(ls -A "$work/bad/vault")" ] || fail "wrong passphrase must not write files"

# 5. restoring into a non-empty target is refused unless forced
if CLIO_VAULT_DIR="$work/dst/vault" CLIO_DATA_DIR="$work/dst/data" "$here/restore.sh" "$file" 2>/dev/null; then fail "restore into non-empty target must be refused"; fi
CLIO_RESTORE_FORCE=1 CLIO_VAULT_DIR="$work/dst/vault" CLIO_DATA_DIR="$work/dst/data" "$here/restore.sh" "$file" > /dev/null || fail "forced restore should work"

# 6. a missing passphrase is an error
if env -u BACKUP_PASSPHRASE CLIO_VAULT_DIR="$src_vault" CLIO_DATA_DIR="$src_data" "$here/backup.sh" "$work/out2" 2>/dev/null; then fail "backup without a passphrase must fail"; fi

echo "backup/restore: all checks passed"
