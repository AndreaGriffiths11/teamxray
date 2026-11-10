#!/usr/bin/env bash
# Contract for the secret gate. Written by a human. Agents don't edit this file.
# 1. The real repo must pass (no false positives).
# 2. A planted fake token must fail the gate.
set -u
gate="scripts/check-secrets.sh"
fail() { echo "CONTRACT BROKEN: $1"; exit 1; }

bash "$gate" src >/dev/null 2>&1 || fail "the gate blocks clean code in src/ (false positive)"

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
plant() {
  rm -rf "$tmp/src"; cp -r src "$tmp/src"
  printf 'const leaked = "%s";\n' "$1" > "$tmp/src/leak.ts"
  if bash "$gate" "$tmp/src" >/dev/null 2>&1; then fail "the gate let a $2 through"; fi
}
plant "ghp_$(printf 'a1B2c3D4e5%.0s' 1 2 3 4 | cut -c1-36)" "github token (ghp_)"
plant "github_pat_$(printf 'a1B2c3D4e5F6%.0s' 1 2 3 4 5 6 7 | cut -c1-82)" "fine-grained pat"
plant "sk-$(printf 'a1B2c3D4e5%.0s' 1 2 3 4 5 | cut -c1-48)" "api key (sk-)"

echo "contract ok: clean code passes, planted secrets fail"