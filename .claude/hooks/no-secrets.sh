#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# PreToolUse(Bash) — die Versicherung gegen den einzigen wirklich teuren Fehler
# in diesem Projekt.
#
# Zwei Dinge dürfen niemals in einen öffentlichen Commit geraten:
#   1. API-Keys. Ein einmal gepushter Key ist auch nach einem force-push in der
#      GitHub-Events-API und in Forks noch abrufbar — er muss rotiert werden.
#   2. Alles aus _intern/. Das sind Notizen und Vorbereitung, die nicht Teil der
#      Abgabe sind.
#
# .gitignore deckt Punkt 2 bereits ab. Dieser Hook ist das zweite, unabhängige
# Netz: eine .gitignore lässt sich mit `git add -f` übergehen, und ein Key in
# einer versehentlich angelegten Datei fällt gar nicht darunter.
#
# Verhalten: blockiert nur bei einem Treffer, und nur bei git add/commit/push.
# Bei allem Unerwarteten exit 0 — ein Hook, der die Sitzung lahmlegt, wird
# abgeschaltet und schützt dann gar nichts mehr.
#
# Von Hand testen:
#   echo '{"tool_name":"Bash","tool_input":{"command":"git add ."}}' \
#     | sh .claude/hooks/no-secrets.sh
# ─────────────────────────────────────────────────────────────────────────────
set -eu

command -v jq >/dev/null 2>&1 || exit 0
input=$(cat) || exit 0

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
[ "$tool" = "Bash" ] || exit 0

cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
case "$cmd" in
  *"git add"*|*"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

findings=""

# Was würde tatsächlich hochgeladen? Gestaged plus nicht gestaged, gegen HEAD.
staged=$(git diff --cached --name-only 2>/dev/null || true)
unstaged=$(git diff --name-only 2>/dev/null || true)
untracked=$(git ls-files --others --exclude-standard 2>/dev/null || true)
candidates=$(printf '%s\n%s\n%s\n' "$staged" "$unstaged" "$untracked" | sed '/^$/d' | sort -u)

# 1. Private Ordner — auch wenn jemand die .gitignore mit -f übergangen hat.
leaked=$(printf '%s\n' "$candidates" | grep -E '^_intern/' || true)
[ -n "$leaked" ] && findings="${findings}Dateien aus _intern/ im Arbeitsbaum-Diff:
$leaked
"

# 2. Key-Muster im tatsächlichen Inhalt. Nur echte Formate, damit der Hook nicht
#    bei jeder Erwähnung des Wortes anschlägt und dadurch unglaubwürdig wird.
content=$(git diff HEAD 2>/dev/null || true)
for f in $untracked; do
  [ -f "$f" ] && [ "$(wc -c <"$f")" -lt 2000000 ] && content="$content
$(cat "$f" 2>/dev/null || true)"
done

keys=$(printf '%s' "$content" \
  | grep -nE 'AIza[0-9A-Za-z_-]{30,}|sk-[A-Za-z0-9]{32,}|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}' \
  | head -5 || true)
[ -n "$keys" ] && findings="${findings}Etwas mit der Form eines API-Keys oder JWT:
$(printf '%s' "$keys" | cut -c1-120)
"

[ -z "$findings" ] && exit 0

reason="Vor diesem git-Befehl gestoppt.

$findings
Bitte prüfen, bevor es weitergeht. Falls es ein Fehlalarm ist — ein Beispielwert in
.env.example, ein Key-Format in der Dokumentation, ein Testfixture — dann sag das kurz
und führe den Befehl erneut aus; dieser Hook blockiert nichts zweimal in Folge, wenn
der Treffer bewusst so gewollt ist."

jq -n --arg r "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $r
  }
}'
