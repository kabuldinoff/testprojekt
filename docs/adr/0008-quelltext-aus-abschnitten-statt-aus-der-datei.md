# 0008 — Der Quellenbetrachter liest die Abschnitte, nicht die Originaldatei

**Datum:** 2026-09-12 · **Status:** angenommen

## Kontext

`README.md` und `CLAUDE.md` versprechen seit der ersten Zeile denselben Satz: Ein Klick öffnet
die Quelle an der Stelle, aus der die Antwort stammt. Gebaut war davon die Hälfte — der Klick auf
einen Beleg klappte die belegte Passage im Wortlaut auf, aber es gab keinen Weg ins Dokument.

Eine dokumentierte Zusage, die das Produkt nicht einlöst, wiegt schwerer als ein fehlendes
Merkmal: Sie ist das Erste, was jemand prüft, der das Repository liest.

Dazu kam ein zweiter Mangel, der im Gebrauch früher auffällt: Eine einmal angelegte Quelle ließ
sich nicht mehr entfernen. Notizen und Notebooks konnte man löschen, Quellen nicht — und ein
Datenbank-Trigger begrenzt ein Notebook auf zwanzig davon. Wer zweimal dieselbe Datei hochlud,
hatte eine Einbahnstraße.

## Entscheidung

**Der Betrachter setzt den Text aus `source_chunks` zusammen, nicht aus der Datei in Storage.**

Die Abschnitte tragen `char_start`, `char_end` und `page_number` und überdecken den Quelltext
vollständig. `src/lib/sources/reassemble.ts` rechnet daraus die Seiten zurück und liefert zu
jedem Abschnitt den Zeichenbereich, an dem er im Ergebnis steht — damit ist die Markierung eines
Belegs ein Nachschlagen und keine Textsuche.

**Gelöscht wird die Datei vor der Zeile.**

## Alternativen, und warum sie es nicht wurden

**Die Originaldatei aus Storage lesen.** Naheliegend, und für vier der fünf Quellarten richtig.
Die fünfte kippt es: Ein URL-Import legt nichts ab, sein Inhalt wird beim Verarbeiten geholt und
existiert danach nur noch als Abschnitte. Der Betrachter bräuchte also zwei Wege, und der
seltenere wäre der ungetestete.

Der zweite Grund ist der bessere: Die Abschnitte sind das, worauf die Antworten beruhen. Ein PDF
im Originallayout danebenzustellen hieße, zwei Wahrheiten zu zeigen — und auf die Frage „warum
steht in der Antwort etwas anderes als im Dokument" gäbe es keine gute Antwort.

**Einen PDF-Betrachter einbinden.** `pdfjs-dist` wiegt rund ein Megabyte und wäre allein für das
Originallayout da — siehe oben. Es löste außerdem nur PDFs, nicht Text, Markdown oder Webseiten.

**Die Überlappung aus `char_start`/`char_end` allein abziehen.** Die Spalten stehen in der
Tabelle, die Rechnung wäre eine Zeile. Sie ist trotzdem falsch: Gespeichert wird
`text.slice(charStart, charEnd).trim()`, und der abgeschnittene Leerraum fehlt in der Rechnung.
Ein bis zwei Zeichen daneben heißt hier ein angeschnittenes Wort, an jeder Abschnittsgrenze.

**Die Überlappung im Text suchen — das längste gemeinsame Stück.** Das war der erste Entwurf und
er ist an drei Tests gescheitert. Bei wiederkehrendem Text passt jedes Ende auf jeden Anfang: In
einem Dokument mit einer Kopfzeile auf jeder Seite gewinnt ein viel zu langer Treffer, und der
Betrachter verschluckt einen halben Absatz.

Gebaut ist deshalb die Kombination: Die gespeicherte Länge sagt, **wo** gesucht wird, der Text
sagt, **wie viel** das Trimmen genommen hat. Gesucht wird nur in einem Fenster von acht Zeichen
darunter — Trimmen entfernt nur, also liegt die Antwort nie darüber.

**Die Zeile vor der Datei löschen.** Beide Reihenfolgen können in der Mitte scheitern, und die
Frage ist nur, welcher Rest sich besser anfühlt:

|              | bleibt zurück               | findet der Nutzer selbst heraus?                    |
| ------------ | --------------------------- | --------------------------------------------------- |
| Zeile zuerst | Datei ohne Zeile im Bucket  | nein — nur ein Aufräumlauf fände sie                |
| Datei zuerst | Quelle ohne Datei, sichtbar | ja — ein zweiter Klick auf „Entfernen" bereinigt es |

Ein Zustand, aus dem man selbst herausfindet, schlägt einen, der unsichtbar Speicher verbraucht.

## Konsequenzen

- Keine Migration. Die DELETE-Policy auf `sources`, die Storage-Löschpolicy und
  `grant select on source_chunks to authenticated` stehen seit Scheibe 4; `source_chunks` hängt
  per `on delete cascade` an der Quelle. Es fehlte ausschließlich die Oberfläche.
- Die Route `/api/sources/[sourceId]/text` liefert den **vollständigen** Inhalt einer Quelle —
  von allen Endpunkten der, bei dem eine fehlende Prüfung am teuersten wäre. Sie steht deshalb
  mit in `e2e/b2-upload-ingest`, wo ein zweiter Nutzer sie mit gültigem Token anspricht.
- Die Antwortgröße ist durch die Eingabegrenzen gedeckelt (500.000 Zeichen eingefügter Text,
  10 MB Datei) und bleibt unter dem 4,5-MB-Limit von Vercel. Eine Seitenaufteilung wäre
  Vorratshaltung für einen Fall, den die Eingabe bereits ausschließt.
- Eine gelöschte Quelle nimmt ihre Belege **nicht** mit: Die Passage liegt als Momentaufnahme in
  der Nachricht. Der Kommentar in `citations.ts`, der das seit Scheibe 5 begründet, hat damit
  endlich den Fall, für den er geschrieben wurde — `e2e/b6` prüft ihn.

## Bewusst nicht enthalten

- **Kein Bearbeiten des Quelltexts.** Eine Quelle ist das Abbild eines Dokuments zu einem
  Zeitpunkt. Wer sie ändert, entwertet jedes gespeicherte Zitat darauf, ohne dass es auffiele.
  Löschen und neu anlegen ist der ehrliche Weg.
- **Kein Papierkorb.** Löschen ist endgültig, dafür mit Rückfrage — dasselbe `<details>`-Muster
  wie beim Notebook, kein `confirm()`.
- **Keine Volltextsuche im Betrachter.** Der Browser hat eine.
