#!/usr/bin/env bash
# End-to-end smoke test against a running Clio.
#
#   CLIO_PASSWORD=... scripts/smoke.sh [base-url]        # default http://localhost:4356
#
# Optional: CLIO_SMOKE_VAULT_DIR=/path/to/vault to check the markdown files directly;
# otherwise the files are checked inside the clio-api container with `docker compose exec`.
set -uo pipefail

base=${1:-http://localhost:4356}
: "${CLIO_PASSWORD:?CLIO_PASSWORD must be set}"
failures=0
pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1" >&2; failures=$((failures + 1)); }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "Smoke test: $base"

[ "$(status "$base/health")" = "200" ] && pass "GET /health is 200" || fail "GET /health"
[ "$(status "$base/api/reminders")" = "401" ] && pass "API rejects requests without a token" || fail "unauthenticated request was not rejected"

token=$(curl -s -X POST "$base/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"password\":\"$CLIO_PASSWORD\"}" | sed -n 's/.*"token":"\([0-9a-f]*\)".*/\1/p')
[ -n "$token" ] && pass "login returns a token" || { fail "login"; echo "Cannot continue without a token." >&2; exit 1; }
auth=(-H "X-Session-Token: $token" -H 'Content-Type: application/json')

due=$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ)
created=$(curl -s -X POST "$base/api/reminders" "${auth[@]}" -d "{\"title\":\"Smoke reminder\",\"due\":\"$due\"}")
rid=$(echo "$created" | sed -n 's/.*"id":"\([a-z0-9]*\)".*/\1/p')
[ -n "$rid" ] && pass "created a reminder ($rid)" || fail "create reminder: $created"
curl -s "$base/api/reminders" "${auth[@]}" | grep -q "Smoke reminder" && pass "reminder is listed" || fail "reminder not listed"

today=$(date -u +%F)
[ "$(status -X POST "$base/api/daily/$today/entries" "${auth[@]}" -d '{"section":"thoughts","text":"smoke-test-entry"}')" = "201" ] \
  && pass "appended a daily entry" || fail "append daily entry"
curl -s "$base/api/search?q=smoke-test-entry&includePrivate=true" "${auth[@]}" | grep -q "Clio/Daily/$today.md" \
  && pass "search finds the entry" || fail "search did not find the entry"
default_hits=$(curl -s "$base/api/search?q=smoke-test-entry" "${auth[@]}")
if echo "$default_hits" | grep -q "Clio/Daily/$today.md" || echo "$default_hits" | grep -q '"private":true'; then
  fail "private diary entry leaked into default search"
else
  pass "private diary entries are hidden from search by default"
fi

if [ -n "${CLIO_SMOKE_VAULT_DIR:-}" ]; then
  has_file() { [ -e "$CLIO_SMOKE_VAULT_DIR/$1" ]; }
  has_glob() { compgen -G "$CLIO_SMOKE_VAULT_DIR/$1" > /dev/null; }
else
  has_file() { docker compose exec -T clio-api test -e "/vault/$1"; }
  has_glob() { [ -n "$(docker compose exec -T clio-api sh -c "ls /vault/$1 2>/dev/null")" ]; }
fi
has_file "Clio/Daily/$today.md" && pass "daily note exists in the vault" || fail "daily note file missing"
has_glob "Clio/Reminders/*.md" && pass "reminder file exists in the vault" || fail "reminder file missing"

if curl -s "$base/api/settings" "${auth[@]}" | grep -q '"openrouterKeySet":false'; then
  code=$(status -X POST "$base/api/copilotkit" "${auth[@]}" -d '{}')
  [ "$code" = "503" ] && pass "chat endpoint reports 'not configured' without an OpenRouter key" || fail "copilotkit without key returned $code"
else
  echo "  skip chat endpoint check (an OpenRouter key is configured)"
fi

[ -n "$rid" ] && curl -s -o /dev/null -X DELETE "$base/api/reminders/$rid" "${auth[@]}"

if [ "$failures" -eq 0 ]; then echo "Smoke test passed."; else echo "Smoke test FAILED ($failures)." >&2; exit 1; fi
