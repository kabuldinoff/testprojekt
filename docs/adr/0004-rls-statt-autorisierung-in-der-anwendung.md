# 0004 — RLS ist die Grenze, nicht die Anwendung

**Datum:** 2026-09-10 · **Status:** angenommen

## Kontext

Zwei verbreitete Wege, Mandantentrennung in einer Supabase-Anwendung zu bauen:

1. Die Anwendung verbindet sich mit erhöhten Rechten — typisch über ein ORM mit dem
   Service-Key — und filtert selbst nach dem angemeldeten Nutzer. RLS ist dann entweder aus
   oder nur „an, ohne Policies", damit die Data-API dicht ist.
2. Die Anwendung verbindet sich mit der Identität des Nutzers, und die Datenbank entscheidet.

Weg 1 ist bequemer: keine Policies, keine Überraschungen beim Debuggen, jede Abfrage tut, was
dasteht. Er verlagert die Autorisierung aber vollständig in den Anwendungscode — und damit ist
**jede neue Route eine neue Gelegenheit, den Filter zu vergessen**. Der Fehler ist dabei nicht
laut: eine vergessene `where`-Klausel liefert mehr Daten, nicht weniger, und Tests, die auf
„es kommt etwas zurück" prüfen, bleiben grün.

## Entscheidung

Weg 2. Konkret:

- Zugriff läuft über `@supabase/supabase-js` mit dem **Publishable Key** und dem Session-Cookie
  des Nutzers, im Browser wie auf dem Server. Kein ORM.
- **Jede Tabelle hat RLS und echte Policies** für alle Operationen, die sie zulässt.
- Der **Secret Key** existiert genau einmal, in `src/lib/supabase/admin.ts`, und ist dem
  Ingestion-Worker vorbehalten — dort läuft die Arbeit nach der Antwort weiter, außerhalb des
  Request-Kontexts, wo es keine Identität mehr gibt, an der RLS ansetzen könnte.

Dazu drei Regeln, die in jeder Policy stehen und die jeweils einen konkreten Fehler verhindern:

| Regel                                    | Was ohne sie passiert                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `(select auth.uid())` statt `auth.uid()` | Die Funktion wird pro Zeile statt pro Statement ausgewertet. Bei einem Scan über zehntausende Chunks ist das der dominierende Kostenfaktor. |
| `to authenticated`                       | Die Policy wird auch für die `anon`-Rolle evaluiert — unnötige Arbeit und eine Einladung für den nächsten Fehler.                           |
| Index auf der Filterspalte               | Jeder Lesezugriff wird zum Seq Scan. Der häufigste Grund für eine RLS-Anwendung, die „plötzlich" langsam wird.                              |

## Alternativen

**Drizzle oder Prisma mit dem Service-Key.** Bessere Typsicherheit, vertrautere Abfragen,
Migrationen aus dem Schema generiert. Verworfen, weil es Weg 1 bedeutet. Der Preis dieser
Entscheidung sind handgeschriebene Migrationen — und die sind in einem Gespräch ohnehin
lesbarer als ein generiertes Schema.

**RLS an, aber ohne Policies, plus Autorisierung in der API-Schicht.** Eine gängige Variante:
RLS sperrt die Data-API komplett, die Anwendung greift mit erhöhten Rechten daran vorbei. Das
ist Weg 1 mit einem zusätzlichen Riegel gegen direkte Zugriffe. Es hat einen echten Vorteil
(einfachere Abfragen) und einen entscheidenden Nachteil: die Sicherheit hängt an der
Vollständigkeit des Anwendungscodes, und die lässt sich nicht testen, ohne jede Route einzeln
durchzugehen. Mit echten Policies lässt sie sich in einem Test beweisen — siehe unten.

## Konsequenzen

- **Beweisbar statt behauptet.** `e2e/a2-rls-isolation.spec.ts` legt zwei Konten an und prüft
  mit einem gültigen Token des zweiten, dass er die Daten des ersten weder lesen noch ändern
  noch löschen kann — **an der Oberfläche vorbei, direkt gegen PostgREST**. Ein Test, der nur
  klickt, zeigt lediglich, dass die Oberfläche nichts anzeigt.
- Geprüft wird auch das Einfügen: ohne die `with check`-Klausel der INSERT-Policy könnte ein
  Nutzer eine Zeile mit fremdem `owner_id` anlegen, denn `using` greift beim Einfügen nicht.
- Ein `SECURITY DEFINER`-Helfer (`owns_notebook()`) verhindert, dass Policies abhängiger
  Tabellen über zwei Ebenen joinen. Er gibt nur ja/nein zurück und setzt `search_path`
  explizit — er ist Baustein von RLS, nicht Umgehung.
- Die Data-API wurde ohne „automatically expose new tables" eingerichtet. Eine anonyme Abfrage
  auf `notebooks` ergibt deshalb `401 permission denied` statt einer leeren Liste: die Tabelle
  ist für `anon` gar nicht vorhanden. RLS ist damit das zweite Netz, nicht das einzige.
- Fehlender Zugriff zeigt sich als **leere Ergebnismenge**, nicht als Fehler. Das ist gewollt:
  ein 403 würde bestätigen, dass die Zeile existiert. In der Oberfläche wird daraus ein 404.

## Bewusst nicht enthalten

Geteilte Notebooks. Das Modell trüge es — es fehlten eine Mitgliedschaftstabelle und ein
zweiter Zweig in `owns_notebook()`. Ohne konkreten Anwendungsfall wären das Vermutungen über
Rollen und Rechte, die man später doch anders braucht.
