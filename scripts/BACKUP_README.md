# Backups

`scripts/backup.sh <dir>` writes one AES-256 encrypted file (`clio-backup-<UTC time>.tar.enc`, mode 600) containing
the `vault` (your markdown notes) and `data` (settings, push subscriptions, sync state) volumes.
The passphrase comes from `BACKUP_PASSPHRASE`. **Lose the passphrase and the backup cannot be opened.**

```bash
BACKUP_PASSPHRASE='long passphrase' scripts/backup.sh ~/clio-backups
```

Restore into **empty** volumes (stop the stack first):

```bash
docker compose stop
docker volume rm numdum_vault numdum_data   # only if you want a clean restore; this deletes them
docker volume create numdum_vault && docker volume create numdum_data
BACKUP_PASSPHRASE='long passphrase' scripts/restore.sh ~/clio-backups/clio-backup-20261123T100000Z.tar.enc
docker compose up -d
```

`restore.sh` refuses non-empty targets unless `CLIO_RESTORE_FORCE=1`, and decrypts before writing anything, so a wrong
passphrase changes nothing. Volume names follow your Compose project (`COMPOSE_PROJECT_NAME`, default: the folder name);
override with `CLIO_VAULT_VOLUME` / `CLIO_DATA_VOLUME`. Never run `docker compose down -v`: it deletes the volumes.

Check the scripts themselves with `bash scripts/test-backup.sh` (uses temp folders, no Docker).
