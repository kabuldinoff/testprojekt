#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# PreToolUse(Bash) — vor `git push` oder `gh pr create` einschätzen, was rausgeht.
#
# Nicht jeder Push ist gleich riskant. Eine Änderung an einer RLS-Policy, am
# Auth-Pfad oder an einer Migration kann Daten fremder Nutzer freilegen, und das
# merkt man nicht am grünen Testlauf. Solche Änderungen bekommen eine Rückfrage
# mit einer konkreten manuellen Prüfempfehlung — nicht als Bremse, sondern damit
# die Entscheidung mit den Fakten vor Augen fällt.
#
# Alles andere läuft durch, mit einer kurzen Einordnung.
#
# Von Hand testen:
#   IMPACT_RANGE_OVERRIDE=origin/main..HEAD \
#     echo '{"tool_name":"Bash","tool_input":{"command":"git push"}}' \
#       | sh .claude/hooks/push-impact.sh
# ─────────────────────────────────────────────────────────────────────────────
set -eu

command -v jq >/dev/null 2>&1 || exit 0
input=$(cat) || exit 0

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
[ "$tool" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
case "$cmd" in
  *"git push"*|*"gh pr create"*) ;;
  *) exit 0 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# Der Bereich unten wird aus HEAD abgeleitet. Das stimmt für `git push` und
# `git push origin <branch>`, aber nicht für jede Form: `git push --all`,
# `--tags`, `--mirror` oder ein Refspec wie `origin release:main` schicken
# etwas anderes los, als HEAD vermuten lässt. Die Einschätzung wäre dann
# schlicht falsch — und eine falsche Entwarnung ist schlechter als keine.
#
# Diese Fälle vollständig aufzulösen wäre viel Logik für Befehle, die hier
# praktisch nicht vorkommen. Stattdessen wird zugegeben, dass die Einschätzung
# nicht möglich ist, und unbedingt nachgefragt.
if [ -z "${IMPACT_RANGE_OVERRIDE:-}" ]; then
  unresolvable=""
  case "$cmd" in
    *" --all"*|*" --tags"*|*" --mirror"*) unresolvable="Sammel-Push (--all, --tags oder --mirror)" ;;
  esac

  # Ein Push an eine ausgeschriebene URL statt an einen konfigurierten Remote.
  # Eigener Fall, nicht nur ein Sonderfall des Refspecs: hier ist nicht bloß
  # unklar, WAS rausgeht, sondern auch WOHIN.
  if [ -z "$unresolvable" ] && printf '%s' "$cmd" | grep -qE '[a-zA-Z][a-zA-Z0-9+.-]*://'; then
    unresolvable="Push an eine ausgeschriebene URL statt an einen konfigurierten Remote"
  fi

  # Ein Refspec der Form <quelle>:<ziel>. URLs sind oben schon abgefangen und
  # werden hier entfernt, sonst liest sich "https://…" als Refspec.
  if [ -z "$unresolvable" ]; then
    cmd_ohne_urls=$(printf '%s' "$cmd" | sed -E 's#[a-zA-Z][a-zA-Z0-9+.-]*://[^[:space:]]*##g')
    if printf '%s' "$cmd_ohne_urls" | grep -qE 'git push[^|;&]*[[:space:]][^[:space:]:/]+:[^[:space:]]+'; then
      unresolvable="expliziter Refspec (<quelle>:<ziel>)"
    fi
  fi

  if [ -n "$unresolvable" ]; then
    reason="Dieser Push lässt sich nicht zuverlässig einschätzen: $unresolvable.

Der Hook leitet die Tragweite aus HEAD ab. Bei dieser Befehlsform geht etwas
anderes raus als HEAD, die Einschätzung wäre also falsch — und eine falsche
Entwarnung ist schlechter als gar keine.

Bitte selbst prüfen, was tatsächlich hochgeht, und dann bestätigen."
    jq -n --arg r "$reason" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: $r
      }
    }'
    exit 0
  fi
fi

range=${IMPACT_RANGE_OVERRIDE:-}
if [ -z "$range" ]; then
  if git rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1; then
    range='@{upstream}..HEAD'
  else
    base=$(git merge-base origin/main HEAD 2>/dev/null || true)
    [ -z "$base" ] && exit 0
    range="$base..HEAD"
  fi
fi

files=$(git diff --name-only "$range" 2>/dev/null || true)
[ -z "$files" ] && exit 0

high=""
note() { high="${high}  - $1
    → $2
"; }

printf '%s\n' "$files" | grep -q '^supabase/migrations/' && \
  note "Datenbank-Migration" "Auf einer Kopie einspielen. Ist sie vorwärtskompatibel zur laufenden Version?"
printf '%s\n' "$files" | grep -qiE 'policy|rls' && \
  note "RLS-Policies berührt" "e2e/a2-rls-isolation ausführen: sieht ein zweiter Nutzer wirklich nichts?"
printf '%s\n' "$files" | grep -qE 'src/lib/supabase/|middleware\.ts|/auth/' && \
  note "Auth-Pfad berührt" "Ab- und wieder anmelden, dann eine fremde Notebook-URL direkt aufrufen — 404 erwartet."
printf '%s\n' "$files" | grep -q 'src/lib/supabase/admin' && \
  note "service_role-Client geändert" "Der Import-Graph-Test muss grün sein: aus src/app/(app)/** nicht erreichbar."
printf '%s\n' "$files" | grep -qE 'src/lib/(llm|rag)/' && \
  note "Antwortpfad berührt" "Eine Frage stellen, deren Antwort nur in einer Quelle steht, und das Zitat anklicken."

count=$(printf '%s\n' "$files" | sed '/^$/d' | wc -l | tr -d ' ')

if [ -z "$high" ]; then
  jq -n --arg m "Push-Einschätzung: $count Datei(en), keine sicherheitskritischen Pfade berührt." \
    '{ systemMessage: $m }'
  exit 0
fi

reason="Dieser Push berührt Pfade, deren Fehler ein grüner Testlauf nicht zeigt.

$high
$count Datei(en) insgesamt. Wenn das geprüft ist oder nicht zutrifft, bestätigen und
weitermachen."

jq -n --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $r
  }
}'
