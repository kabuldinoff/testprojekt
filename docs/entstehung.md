# Wie das hier entstanden ist

Fünfundsiebzig Commits sind ein Protokoll, keine Erzählung. Wer wissen will, **in welcher
Reihenfolge dieses Projekt gebaut wurde und warum in dieser**, müsste sie sonst von Hand
sortieren. Diese Seite nimmt ihm das ab.

Drei Entscheidungen prägen die Reihenfolge, und sie sind an ihr ablesbar:

- **Das Design stand vor der ersten Komponente.** `design/canvas.html` ist älter als jede
  `.tsx`-Datei. Farben, Radien und Zustände nachträglich zu vereinheitlichen kostet mehr, als
  sie einmal vorher festzulegen.
- **Schema und RLS standen vor der ersten Route.** Die Sicherheitsgrenze liegt in der
  Datenbank (`docs/adr/0004`). Wäre sie nachgereicht worden, wäre jede bereits gebaute Route
  eine Gelegenheit gewesen, die Prüfung zu vergessen.
- **Tests gehören in dieselbe Scheibe wie die Funktion**, nie in eine spätere. Eine Scheibe
  ist fertig, wenn sie beweisbar ist — nicht, wenn sie läuft.

Gearbeitet wurde in Scheiben: ein Branch, ein Pull Request, ein Thema. Jeder Pull Request wurde
automatisch reviewt, bevor er gemergt wurde; die Befunde stehen als Kommentare in den Threads,
zusammen mit der Antwort darauf — übernommen oder mit Begründung abgelehnt.

## Die Scheiben

| PR                                                        | Scheibe                           | Was danach lief                                                                                                                                                                      | Entscheidung                                                                                                                                                                                           |
| --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#1](https://github.com/kabuldinoff/testprojekt/pull/1)   | Fundament, Schema, Auth, RLS      | Next.js 16 mit Tokens für beide Themes, das vollständige Schema mit Policies, Registrierung und Anmeldung — und der Isolationstest, der beweist, dass ein fremdes Konto nichts sieht | [0001](adr/0001-dark-als-default-und-token-architektur.md) · [0002](adr/0002-toolchain-versionen.md) · [0003](adr/0003-testpyramide.md) · [0004](adr/0004-rls-statt-autorisierung-in-der-anwendung.md) |
| [#2](https://github.com/kabuldinoff/testprojekt/pull/2)   | Notebooks                         | Anlegen, umbenennen, löschen — und der 404, den ein Ladezustand vorher aufgefressen hatte                                                                                            | [0005](adr/0005-repository-oeffentlich.md)                                                                                                                                                             |
| [#3](https://github.com/kabuldinoff/testprojekt/pull/3)   | Quellen                           | Hochladen, abrufen, lesen, in Abschnitte teilen. Die Fehlerwege zuerst: unlesbares PDF, Adresse im lokalen Netz, zu große Antwort                                                    |                                                                                                                                                                                                        |
| [#4](https://github.com/kabuldinoff/testprojekt/pull/4)   | Chat mit Belegen                  | Hybride Suche aus Kosinus-Distanz und Volltext, zusammengeführt per Reciprocal Rank Fusion. Belege sind Schnappschüsse, damit sie nachprüfbar bleiben                                | [0006](adr/0006-ai-anbieter-im-test-ersetzen.md)                                                                                                                                                       |
| [#5](https://github.com/kabuldinoff/testprojekt/pull/5)   | Anbieterwahl und Notizen          | Der Nutzer entscheidet, wohin seine Daten gehen, und das Datenfluss-Panel sagt pro Einstellung, was das heißt                                                                        |                                                                                                                                                                                                        |
| [#6](https://github.com/kabuldinoff/testprojekt/pull/6)   | Rechte des Worker-Kontos          | `service_role` bekommt aufgezählte Rechte statt geerbter — und lokal dieselben wie live                                                                                              |                                                                                                                                                                                                        |
| [#7](https://github.com/kabuldinoff/testprojekt/pull/7)   | Antwortzeit                       | Ein Modell, dessen Dauer vorhersagbar ist                                                                                                                                            |                                                                                                                                                                                                        |
| [#8](https://github.com/kabuldinoff/testprojekt/pull/8)   | Audio-Überblick                   | Zwei Stimmen aus den gewählten Quellen — und ein Text, der auch dann trägt, wenn die Vertonung scheitert                                                                             | [0007](adr/0007-audio-als-wav-und-der-skript-pfad.md)                                                                                                                                                  |
| [#9](https://github.com/kabuldinoff/testprojekt/pull/9)   | Landing Page und SEO              | Eine öffentliche Seite ohne Client-JS außer Theme-Umschalter und Anmeldeknopf. Werte gemessen, nicht behauptet                                                                       |                                                                                                                                                                                                        |
| [#10](https://github.com/kabuldinoff/testprojekt/pull/10) | Drei Ausprägungen, Zugänglichkeit | Derselbe Markup in Desktop, Tablet und Mobil. Kontraste und Tastaturbedienung gemessen                                                                                               |                                                                                                                                                                                                        |
| [#11](https://github.com/kabuldinoff/testprojekt/pull/11) | Quelltext lesen                   | Der Beleg führt an seine Stelle im Dokument und markiert genau die Passage, die er behauptet                                                                                         | [0008](adr/0008-quelltext-aus-abschnitten-statt-aus-der-datei.md)                                                                                                                                      |
| [#12](https://github.com/kabuldinoff/testprojekt/pull/12) | Registrierungsweg                 | Der Bestätigungslink erreichte den Callback nicht — er landete auf der Startseite und verfiel                                                                                        |                                                                                                                                                                                                        |
| [#13](https://github.com/kabuldinoff/testprojekt/pull/13) | Drosselung                        | Die drei teuren Vorgänge werden in Postgres gezählt, nicht im Speicher einer Instanz                                                                                                 |                                                                                                                                                                                                        |
| [#14](https://github.com/kabuldinoff/testprojekt/pull/14) | Aufräumen im Storage              | Dateien gehen mit der Zeile, zu der sie gehören — Supabase Storage hängt nicht am Schema                                                                                             |                                                                                                                                                                                                        |
| [#15](https://github.com/kabuldinoff/testprojekt/pull/15) | Nachbesserungen                   | Vier Stellen, die kaputt aussahen, und eine, die es geworden war                                                                                                                     |                                                                                                                                                                                                        |

## Was unterwegs umgeworfen wurde

Eine Reihenfolge, in der nichts schiefging, wäre nachträglich geglättet. Vier Stellen, an denen
eine Entscheidung revidiert wurde:

**Audio sollte MP3 werden, blieb WAV.** Geplant war eine Kodierung in reinem JavaScript, weil
es auf der Plattform kein `ffmpeg` gibt — 2,88 MB pro Minute klangen nach zu viel für ein
Gigabyte Speicher. Die Rechnung stimmte, die Bibliothek trug nicht. WAV bleibt, dafür deckelt
ein Limit die Länge. Die Begründung steht in [ADR 0007](adr/0007-audio-als-wav-und-der-skript-pfad.md).

**Der Quellenbetrachter sollte die Originaldatei zeigen, liest jetzt die Abschnitte.** Ein PDF
im Browser zu rendern kostet rund ein Megabyte Bibliothek, und die Textstelle eines Belegs
wäre darin trotzdem nicht zuverlässig zu finden — die Zeichenpositionen stammen aus dem
extrahierten Text, nicht aus dem Layout. Die Abschnitte tragen sie bereits.
Siehe [ADR 0008](adr/0008-quelltext-aus-abschnitten-statt-aus-der-datei.md). Der Preis: Die
Abschnitte überlappen einander, also muss der Text beim Zusammensetzen wieder entdoppelt
werden, ohne je etwas zu verlieren.

**Die Drosselung war in ihrer ersten Fassung vollständig umgehbar.** Die Datenbankfunktion nahm
Grenze und Zeitfenster als Parameter entgegen — wer sie aufrief, durfte also bestimmen, wie oft
er sie aufrufen darf. Ein Fenster von null Sekunden setzte den Zähler bei jedem Aufruf zurück.
Nachgemessen: Grenze drei, fünf Aufrufe, fünfmal „erlaubt". Die Grenzen stehen seitdem **in**
der Funktion.

**Die Löschpolicy für den Audio-Bucket fehlte, und niemand hat es gemerkt** — weil es zum
Zeitpunkt der Migration noch keinen Weg gab, einen Überblick loszuwerden. Aufgefallen ist es
erst beim Aufräumen des lokalen Stacks: 1070 gelöschte Notebooks, und 837 Dateien blieben
liegen. Der Fremdschlüssel räumt die Datenbank auf, den Storage räumt er nicht.

## Was der Review beigetragen hat

Elf der fünfzehn Pull Requests tragen einen Commit, der mit `fix: apply the review` beginnt.
Die Betreffzeilen sagen, was jeweils gefunden wurde — und die Hälfte davon betrifft nicht den
Code, sondern die Tests:

- „starting with a test that proved nothing"
- „four tests that promised more than they checked"
- „the preview-image test was green because of an unrelated server"
- „a silent text loss, and a dead end in the error state"
- „the throttle could be switched off by the throttled"
- „a swallowed query error would have orphaned the files"
- „the chooser would have erased symbols it did not know"

Ein grüner Test ist kein Beweis, solange niemand geprüft hat, **ob er rot werden kann**. Die
Gegenprobe — die Funktion absichtlich kaputtmachen und zusehen, ob der Test es merkt — hat in
diesem Projekt mehr Fehler gefunden als jedes Feature-Debugging.

Nicht jeder Befund wurde übernommen. Die abgelehnten stehen mit ihrer Begründung im jeweiligen
Thread; ein Reviewer, der die Absicht hinter einer Stelle nicht kennt, liegt manchmal daneben,
und das gehört dann dokumentiert statt stillschweigend umgesetzt.
