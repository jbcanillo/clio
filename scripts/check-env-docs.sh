#!/usr/bin/env bash
# Every variable in .env.example must appear in the README configuration table, and the other way round.
set -euo pipefail
cd "$(dirname "$0")/.."
from_env=$(grep -oE '^#? ?[A-Z][A-Z0-9_]+=' .env.example | tr -d '# =' | sort -u)
from_readme=$(grep -oE '^\| `[A-Z][A-Z0-9_]+`' README.md | tr -d '|` ' | sort -u)
status=0
for v in $from_env; do echo "$from_readme" | grep -qx "$v" || { echo "In .env.example but not in README: $v" >&2; status=1; }; done
for v in $from_readme; do echo "$from_env" | grep -qx "$v" || { echo "In README but not in .env.example: $v" >&2; status=1; }; done
[ "$status" = 0 ] && echo "env docs in sync ($(echo "$from_env" | wc -w) variables)"
exit $status
