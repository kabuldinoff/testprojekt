# Sicherheit

Eine Seite. Was geschützt wird, wodurch, und was bewusst offen bleibt.

## Was hier überhaupt zu schützen ist

Nutzer laden eigene Dokumente hoch. Der Schaden eines Fehlers ist nicht „ein Dienst ist
kurz nicht erreichbar", sondern „jemand liest fremde Unterlagen". Alles Weitere ordnet sich
dem unter.

## Mandantentrennung

Die Grenze ist **RLS in der Datenbank**, nicht der Anwendungscode. Die Begründung steht in
`docs/adr/0004`; hier nur die Konsequenz: eine vergessene Prüfung in einer neuen Route führt
zu einem leeren Ergebnis, nicht zu fremden Daten.

Drei Ebenen, absichtlich verschieden in ihrer Art:

| Ebene                     | Was sie tut                               | Was passiert, wenn sie ausfällt                   |
| ------------------------- | ----------------------------------------- | ------------------------------------------------- |
| Middleware                | leitet Unangemeldete um                   | jemand sieht eine leere Seite statt der Anmeldung |
| Server-Komponente / Route | prüft beim Rendern bzw. vor dem Schreiben | eine Abfrage läuft, die nichts findet             |
| **RLS**                   | filtert Zeilen in der Datenbank           | **fremde Daten**                                  |

Bewiesen wird das nicht durch Lesen, sondern durch `e2e/a2-rls-isolation.spec.ts`: ein
zweiter Nutzer versucht mit gültigem Token direkt gegen PostgREST zu lesen, zu ändern, zu
löschen und eine Zeile auf fremden Namen anzulegen. `e2e/b2-upload-ingest.spec.ts` prüft
dasselbe für Quellen und Abschnitte.

**Fehlender Zugriff ergibt 404, nie 403.** Ein 403 bestätigt, dass die Ressource existiert.

## Der Schlüssel, der alles darf

`SUPABASE_SECRET_KEY` umgeht RLS vollständig. Er lebt an genau einer Stelle
(`src/lib/supabase/admin.ts`) und ist aus genau einer Datei unter `src/app/` erreichbar: der
Ingest-Route. Diese Ausnahme ist nötig, weil die Verarbeitung in `after()` weiterläuft — nach
der Antwort, ohne Sitzung.

`src/lib/__tests__/admin-client-isolation.test.ts` folgt dem Import-Graph mit dem
TypeScript-Parser und schlägt fehl, sobald eine andere Datei ihn erreicht, auch über mehrere
Ebenen. Die Ausnahmeliste wird vom Test selbst geprüft: ein zusätzlicher Eintrag ist eine
sichtbare Änderung an zwei Stellen.

Beim Bauen hat genau dieser Test eine Vereinfachung erzwungen. Die Upload-Route benutzte
zunächst ebenfalls den Admin-Client; nachgemessen kann der RLS-Client die Signed Upload URL
selbst erzeugen, weil die Storage-Policy den eigenen Pfad erlaubt. Eine Stelle mit erhöhten
Rechten weniger.

## Uploads

Der Browser lädt **direkt zu Supabase Storage**, nicht durch die Anwendung — Vercel begrenzt
Request-Bodies auf 4,5 MB. Der Server erzeugt nur eine Signed URL für einen Pfad, der mit der
Nutzer-ID beginnt.

Daran hängt die Storage-Policy: `(storage.foldername(name))[1] = auth.uid()::text`. Die ID
kommt aus dem geprüften Token, nicht aus dem Request — sie ist nicht fälschbar. Ein fremder
Pfad scheitert an der Policy; nachgemessen, nicht angenommen.

Der Bucket ist privat, das Größenlimit (10 MB) und die erlaubten MIME-Typen stehen **am
Bucket** und nicht nur im Anwendungscode: der Upload läuft an der Anwendung vorbei, eine
Prüfung dort sähe die Datei nie.

## URL-Import und SSRF

Beim URL-Import ruft der Server eine Adresse ab, die der Nutzer angibt. Ohne Schutz wäre das
ein Fernrohr ins interne Netz — und die Antwort landete sichtbar als „Quelle" im Notebook.

Zwei Ebenen:

1. **Syntaktisch** (`src/lib/sources/url-safety.ts`, rein und getestet): nur http und https,
   keine eingebetteten Zugangsdaten, keine Loopback-, Link-local-, privaten oder reservierten
   Adressen, keine `.local`/`.internal`/`.home.arpa`, kein Cloud-Metadatendienst — weder über
   IP noch über Namen.
2. **Nach der Auflösung**: der Hostname wird aufgelöst und jede resultierende IP geprüft.
   Nötig, weil `beispiel.de` auf `127.0.0.1` zeigen darf und Ebene 1 das nicht sehen kann.

Weiterleitungen werden **nicht** verfolgt (`redirect: 'manual'`): eine öffentliche Adresse
könnte sonst auf eine interne umleiten und beide Ebenen umgehen. Dazu ein Zeitlimit von 15
Sekunden und eine Obergrenze von 5 MB.

Ein Test pro Angriffsform steht in `src/lib/__tests__/sources-url-safety.test.ts`. Er hat
beim Schreiben eine echte Lücke gefunden: Node normalisiert `::ffff:127.0.0.1` zu
`::ffff:7f00:1`, und die erste Fassung prüfte nur die Punktform.

Die Antwort wird **stückweise** gelesen und der Reader abgebrochen, sobald 5 MB
überschritten sind. `response.arrayBuffer()` wäre eine Zeile, liest aber erst alles und
prüft dann — bei einer Antwort, die absichtlich nicht aufhört, ist der Speicher voll, bevor
die Prüfung drankommt. Die Adresse gibt der Nutzer an; das ist kein hypothetischer Fall.

**Bekannte Restlücke: DNS-Rebinding.** Zwischen der Auflösung und dem Abruf durch `fetch`
kann sich die DNS-Antwort ändern: erst eine öffentliche Adresse für die Prüfung, dann eine
private für die Verbindung.

Sie zu schließen hieße, die Verbindung an die geprüfte IP zu binden — entweder mit einem
eigenen `undici`-Dispatcher oder indem man `node:https` direkt benutzt und Host-Header sowie
TLS-Servername von Hand setzt. Beides ist machbar, beides bringt Fallstricke bei SNI, ALPN
und Weiterleitungen mit, die sich hier nicht gegen einen echten Gegenpart testen lassen. Eine
halb korrekte Sicherheitsmaßnahme ist schlechter als eine dokumentierte Lücke.

Dazu kommt, was auf **dieser** Bereitstellung erreichbar wäre: Vercel-Functions stellen
keinen Metadatendienst bereit, wie EC2 ihn hat, und Supabase wird über das offene Netz mit
einem Schlüssel angesprochen. Der Gewinn eines gelungenen Rebindings wäre also gering.

**Was das ändern würde:** sobald diese Anwendung in einer Umgebung mit einem internen Netz
oder einem Metadatendienst läuft — eigene Server, ein VPC, ein Kubernetes-Cluster — ist das
hier zuerst zu beheben, vor allem anderen auf dieser Seite.

## Prompt Injection aus Quelldokumenten

Ab der Chat-Scheibe relevant, deshalb hier schon als Haltung: **Quelltext ist Daten, nie
Anweisung.** Er wird klar vom System-Prompt getrennt übergeben und niemals als HTML
gerendert. Ein Dokument, das „ignoriere alle vorherigen Anweisungen" enthält, ist ein
Dokument mit diesem Satz darin — mehr nicht.

Vollständig lösbar ist das nicht. Was hilft: das Modell hat keine Werkzeuge, mit denen es
Schaden anrichten könnte, und die Antwort wird als Text dargestellt.

## Geheimnisse

`.env.local` wird nie committet. Zwei unabhängige Netze: `.gitignore` und
`.claude/hooks/no-secrets.sh`, der vor jedem `git add`, `commit` und `push` prüft — beim Push
auch den **ausgehenden Commit-Bereich**, nicht nur den Arbeitsbaum.

Der Hook kennt bekannte Präfixe (`sb_secret_`, `AIza`, `sk-`, JWT) **und** eine allgemeine
Regel: eine Zuweisung an einen Namen, der nach Geheimnis klingt, mit einem hinreichend langen
Wert. Ohne die zweite wäre er blind für jedes Format, das es heute noch nicht gibt — genau
daran ist er schon einmal vorbeigelaufen, als Supabase von JWT-Keys auf `sb_secret_`
umstellte.

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ist **kein** Geheimnis. Er ist eine Adresse und genau
so sicher wie die RLS-Policies dahinter — was der Grund ist, warum jede Tabelle echte
Policies hat und nicht bloß „RLS an".

## Was bewusst nicht getan wird

- **Keine Virenprüfung hochgeladener Dateien.** Sie werden nie ausgeführt und nur als Text
  gelesen; ausgeliefert werden sie ausschließlich per Signed URL an den Besitzer selbst.
- **Kein Rate-Limit** in dieser Scheibe. Kommt mit der Chat-Scheibe, wo die Aufrufe Geld
  kosten. Bis dahin begrenzen die 20 Quellen pro Notebook und 10 MB pro Datei den Schaden.
- **Keine Audit-Logs.** Für ein Produkt mit einem Nutzer pro Notebook gäbe es nichts zu
  rekonstruieren, was nicht ohnehin in den Zeilen steht.
