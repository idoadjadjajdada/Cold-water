#!/bin/sh
# Runs every suite and reports a single pass/fail. Any suite failing fails the run.
cd "$(dirname "$0")" || exit 1
rc=0
for f in smoke corrupt halls content ui families; do
  printf '\n=== %s ===\n' "$f"
  if node "$f.js"; then :; else rc=1; fi
done
printf '\n%s\n' "$([ $rc -eq 0 ] && echo 'ALL SUITES PASSED' || echo 'SOME SUITES FAILED')"
exit $rc
