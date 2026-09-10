---
name: rls-review
description: Row Level Security für eine neue oder geänderte Tabelle prüfen — Policies für alle vier Operationen, (select auth.uid()), to authenticated, Index auf der Filterspalte, Isolationstest. Verwenden nach jeder Migration, die eine Tabelle anlegt oder ändert, und wenn jemand "RLS", "Policy" oder "Zugriffsrechte" sagt.
---

# RLS-Review

Ein Fehler hier ist der einzige in diesem Projekt, der fremde Daten offenlegt — und der einzige,
den ein grüner Testlauf nicht zeigt. Die Liste wird vollständig abgearbeitet, auch bei einer
Tabelle, die „offensichtlich" harmlos aussieht.

## Die Liste

**1 · RLS ist eingeschaltet.**
`alter table <t> enable row level security;` — ohne das sind Policies wirkungslos, und PostgREST
liefert die Tabelle offen aus.

**2 · Policies für alle vier Operationen.**
`select`, `insert`, `update`, `delete`. Fehlt eine, ist sie nicht etwa offen — sie ist gesperrt,
und der Fehler zeigt sich als leere Liste oder als schweigend verworfener Schreibvorgang. Beides
sucht man lange. Genau `update` wird am häufigsten vergessen.

**3 · `(select auth.uid())`, nie `auth.uid()`.**
Der Wrapper erzeugt einen InitPlan: die Funktion wird einmal pro Statement ausgewertet statt
einmal pro Zeile. Bei einem Scan über zehntausende Chunks ist das der dominierende Kostenfaktor.

**4 · Immer `to authenticated`.**
Ohne Rollenangabe wird die Policy auch für `anon` evaluiert — unnötige Arbeit, und eine
Einladung für den nächsten Fehler.

**5 · Index auf der Spalte, nach der die Policy filtert.**
Eine nicht indizierte Policy-Spalte macht jeden Lesezugriff zum Seq Scan. Bei `source_chunks`
ist das `notebook_id` — es liegt genau deshalb denormalisiert auf der Tabelle, statt über zwei
Ebenen gejoint zu werden.

**6 · Kein `SECURITY DEFINER` an einer Funktion, die PostgREST exponiert.**
Sie liefe als `postgres`, umginge RLS vollständig und wäre ein Datenleck mit Aufruf-Interface.
`SECURITY DEFINER` ist nur für kleine Helfer wie `owns_notebook()` zulässig, die selbst keine
Daten zurückgeben und ein festes `search_path` setzen.

**7 · Bei approximativer Vektorsuche: das Filterprädikat steht explizit im Query.**
Approximative Indizes filtern _nach_ dem Scan, und RLS ist ein Filter. Verlässt man sich allein
auf RLS, liefert der Index die global nächsten Nachbarn und RLS streicht fast alles weg — der
Recall bricht still zusammen. RLS ist die Sicherheitsgrenze, das Prädikat die Performance-Grenze.
Beides, immer.

**8 · Der Isolationstest kennt die neue Tabelle.**
`e2e/a2-rls-isolation.spec.ts` erweitern: ein zweiter Nutzer darf die Zeilen des ersten weder
lesen noch schreiben — auch nicht mit einem gültigen Token direkt gegen PostgREST, am UI vorbei.

**9 · Storage-Objekte sind mitgedacht.**
Buckets sind privat, die Policy prüft `(storage.foldername(name))[1] = auth.uid()::text`, und
ausgeliefert wird ausschließlich per Signed URL.

## Danach

Was auffiel und was bewusst so bleibt, in einem Satz an den Nutzer. Wenn eine Regel hier
absichtlich verletzt wird, gehört der Grund in die Migration **und** in einen ADR — nicht in
diese Datei.
