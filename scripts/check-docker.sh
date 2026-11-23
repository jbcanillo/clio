#!/usr/bin/env bash
# Static checks for the Docker setup (no daemon needed). These guard mistakes that only show up on first `docker compose up`.
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
bad() { echo "FAIL: $*" >&2; status=1; }

# The API runs as the unprivileged `node` user, so /vault and /data must exist and be owned by it in the image;
# otherwise a fresh named volume is root-owned and the API cannot write its notes.
chown_line=$(grep -n 'chown node:node /vault /data' backend/Dockerfile | head -1 | cut -d: -f1 || true)
user_line=$(grep -n '^USER node' backend/Dockerfile | head -1 | cut -d: -f1 || true)
[ -n "$chown_line" ] || bad "backend/Dockerfile must create and chown /vault and /data"
[ -n "$user_line" ] && [ -n "$chown_line" ] && [ "$chown_line" -lt "$user_line" ] || bad "chown of /vault and /data must come before USER node"

grep -q 'vault:/vault' docker-compose.yml || bad "compose must mount the vault volume at /vault"
grep -q 'data:/data' docker-compose.yml || bad "compose must mount the data volume at /data"
grep -q 'proxy_pass http://clio-api:4000' frontend/nginx.conf || bad "nginx must proxy /api to clio-api:4000"
grep -q 'COPILOTKIT_TELEMETRY_DISABLED' backend/Dockerfile || bad "telemetry must be disabled in the API image"
grep -rn 'down -v' README.md | grep -vq -i 'never' && bad "README must only mention 'down -v' as something to avoid" || true

[ "$status" = 0 ] && echo "docker config checks passed"
exit $status
