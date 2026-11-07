#!/usr/bin/env bash
# Automatic checks a PR must pass before the PM review may merge it. Writes a Markdown summary to /tmp/gates.md
# and exits non-zero when any gate fails. Needs DATABASE_URL pointing at a migrated, empty database.
# Usage: scripts/pm-gates.sh <news|source-discovery|seo>
set -uo pipefail
kind=$1
out=/tmp/gates.md
: > "$out"
failed=0

gate() {
  local name=$1
  shift
  if "$@" > /tmp/gate.log 2>&1; then
    echo "- PASS $name" >> "$out"
  else
    failed=1
    { echo "- FAIL $name"; echo '  ```'; tail -40 /tmp/gate.log | sed 's/^/  /'; echo '  ```'; } >> "$out"
  fi
}

no_removed_networks() {
  bun scripts/registry-diff.ts origin/main | tee /dev/stderr | head -1 | grep -q ", 0 removed;"
}

gate "route types" bunx next typegen
gate "typecheck" bun run typecheck
gate "connector ids load without clashes" bun -e 'await import("./src/connectors/index.ts")'
gate "offline tests" bun test tests src/app src/components src/db src/ingest src/lib src/connectors/global-gtfs
case $kind in
  source-discovery) gate "no published network removed" no_removed_networks ;;
  seo) gate "production build" bun run build ;;
esac

cat "$out"
exit $failed
