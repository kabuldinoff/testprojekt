# 0006 — Die AI-Anbieter werden im End-to-End-Test ersetzt

**Datum:** 2026-09-10 · **Status:** angenommen

## Kontext

Der Chat ist die Stelle, an der dieses Produkt sein Versprechen einlöst oder bricht: Jede
Aussage trägt eine Nummer, und diese Nummer zeigt auf eine bestimmte Stelle in einem bestimmten
Dokument. Ein Beleg, der ins Leere führt, ist schlimmer als gar keiner — er sieht aus wie
Sorgfalt.

Genau diese Eigenschaft lässt sich gegen ein echtes Modell nicht prüfen. Ein Modell formuliert
jedes Mal anders; ein Test kann dann feststellen, dass _irgendetwas_ zurückkam, aber nicht, dass
Beleg `[1]` auf den Ausschnitt zeigt, den das Modell tatsächlich vorgelegt bekommen hat. Ein
grüner Test dieser Art sagt nichts über die Zusicherung aus, um die es geht.

Dazu zwei praktische Gründe:

- **Kontingent.** Jeder CI-Lauf verbrauchte das kostenlose Tageskontingent, das für die
  Vorführung gebraucht wird. Gemessene Grenzen stehen in `.env.example`.
- **Geheimnisse.** Das Repository ist öffentlich (ADR 0005). Echte Schlüssel als
  Actions-Secrets wären zwar technisch möglich, aber sie in einem öffentlichen Repository für
  Testläufe auszugeben, ist die falsche Richtung.

## Entscheidung

Die End-to-End-Suite läuft gegen `scripts/ai-stub.mjs` statt gegen Google und Mistral. Die Naht
ist `baseURL` — beide SDKs nehmen sie entgegen; im Betrieb ist die Variable nicht gesetzt und
die Voreinstellung des SDK gilt.

Der Stub ist kein Zufallsgenerator, und das ist der wesentliche Teil:

- **Die Einbettung ist ein Wortsack.** Jedes Wort landet über eine Prüfsumme in einer Dimension,
  der Vektor wird auf Einheitslänge gebracht. Zwei Texte mit gemeinsamen Wörtern bekommen
  dadurch einen hohen Kosinuswert. Ein Zufallsvektor hätte den semantischen Zweig zu Rauschen
  gemacht, und der Test hätte nur noch die Volltextsuche bewiesen.
- **Die Antwort stammt aus dem Kontext.** Der Stub liest den Anfang von Ausschnitt 1 und gibt
  ihn mit `[1]` belegt zurück. Damit ist die Zuordnung _überprüfbar_ statt plausibel: der Test
  klickt den Beleg an und vergleicht die angezeigte Passage mit dem Text, den er selbst
  hochgeladen hat.
- **Zwei Stichwörter steuern die unangenehmen Pfade.** `ERFINDE` lässt den Stub mit `[9]`
  belegen, obwohl es so viele Ausschnitte nicht gibt; `OHNE BELEG` liefert eine Antwort ganz
  ohne Nummer. Beides sind reale Verhaltensweisen echter Modelle, die sich sonst nicht
  zuverlässig herbeiführen lassen.

Getestet wird damit ausdrücklich **das System, nicht der Anbieter**: Suche, Nummerierung,
Belegprüfung, Speicherung, Darstellung. Was ein Modell inhaltlich aus den Ausschnitten macht,
ist keine Zusicherung, die dieses Projekt geben kann.

## Was das gefunden hat

Der Ansatz hat sich beim ersten Lauf bezahlt gemacht. Der Test `ein erfundener Beleg
verschwindet aus der Antwort` war rot, und zwar zu Recht: Die Bereinigung erfundener Nummern
lief nur serverseitig beim Speichern. Während des Strömens zeigte die Oberfläche den rohen Text
— `[9]` blieb sichtbar und verschwand erst nach dem Neuladen. Zwei verschiedene Antworten auf
dieselbe Frage.

Behoben durch `rewriteMarkers()` in `src/lib/chat/citations.ts`, das beide Seiten benutzen. Mit
einem echten Modell wäre dieser Fehler nicht aufgefallen, weil sich `[9]` nicht auf Kommando
erzeugen lässt.

## Alternativen

**Gegen die echten Anbieter testen.** Verworfen: nicht überprüfbar, verbraucht Kontingent,
braucht Schlüssel in CI. Die Zusicherung, um die es geht, wäre gerade nicht abgedeckt.

**Aufzeichnen und abspielen (VCR).** Aufgezeichnete Antworten wären realistischer. Sie müssten
aber bei jeder Änderung am System-Prompt oder an der Zerlegung neu aufgenommen werden, und eine
veraltete Aufzeichnung ist ein grüner Test über totem Code. Für zwei Endpunkte ist der Stub
weniger Aufwand und ehrlicher in dem, was er behauptet.

**Nur Unit-Tests.** Die reinen Funktionen sind gut abgedeckt (`chat-citations`, `chat-prompt`).
Sie sagen aber nichts darüber, ob die Nummern, die die Route vergibt, dieselben sind, die die
Oberfläche auflöst — und genau dort saß der Fehler.

## Konsequenzen

- Die Suite läuft ohne Zugangsdaten, in CI wie lokal, und kostet nichts.
- Der Weg zu den echten Anbietern ist **nicht** automatisiert abgedeckt. Er wird von Hand
  geprüft; `docs/testplan.md` führt ihn als Punkt, und der Durchstich gegen beide Modelle steht
  in `_intern/04-kosten.md` mit Datum.
- `GOOGLE_BASE_URL` und `MISTRAL_BASE_URL` sind eine Naht, die in Produktion nicht gesetzt sein
  darf. Wer sie setzt, lenkt die Anfragen um — das ist beabsichtigt und in `src/lib/env.ts`
  kommentiert.
