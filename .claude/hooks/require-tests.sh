#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Stop — Quellcode geändert, aber kein Test angefasst? Einmal nachfragen.
#
# Die Regel dahinter steht in CLAUDE.md: was ohne I/O entscheidbar ist, lebt als
# reine Funktion in src/lib/ und hat einen Test daneben. Der Hook erzwingt keine
# Abdeckungsquote — er verhindert nur, dass eine Scheibe unbemerkt ganz ohne
# Test fertig gemeldet wird.
#
# Ausdrücklich mit Ausweg: die Blockmeldung nennt selbst die Fälle, in denen
# kein Test nötig ist. Ein Hook ohne Ausweg wird umgangen statt befolgt.
#
# Von Hand testen:  REQUIRE_TESTS_FORCE=1 sh .claude/hooks/require-tests.sh
# ─────────────────────────────────────────────────────────────────────────────
set -eu

command -v jq >/dev/null 2>&1 || exit 0
input=$(cat 2>/dev/null || echo '{}')

# Schutz vor der Endlosschleife: nach einem Block läuft der Stop-Hook erneut.
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null) || exit 0
[ "$active" = "true" ] && exit 0

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

changed=$(
  {
    git diff --name-only HEAD 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sed '/^$/d' | sort -u
)
[ -n "${REQUIRE_TESTS_FORCE:-}" ] && changed="src/lib/beispiel.ts"
[ -z "$changed" ] && exit 0

source_changed=$(printf '%s\n' "$changed" \
  | grep -E '^src/.*\.(ts|tsx)$' \
  | grep -vE '__tests__/' || true)
[ -z "$source_changed" ] && exit 0

tests_changed=$(printf '%s\n' "$changed" | grep -E '__tests__/.*\.test\.ts$|^e2e/.*\.spec\.ts$' || true)
[ -n "$tests_changed" ] && exit 0

reason="Diese Dateien haben sich geändert, ohne dass ein Test angefasst wurde:

$source_changed

Bitte entweder einen Unit-Test in src/lib/**/__tests__/ oder einen Playwright-Test in
e2e/ ergänzen.

Wenn das hier nicht zutrifft — ein reines Refactoring, eine Konfigurationsänderung, ein
Fix, den ein bestehender Test bereits abdeckt, oder reine Darstellung ohne ableitbares
Verhalten — dann sag das dem Nutzer in einem Satz und mach weiter. Dieser Hook blockiert
nur einmal."

jq -n --arg r "$reason" '{ decision: "block", reason: $r }'
