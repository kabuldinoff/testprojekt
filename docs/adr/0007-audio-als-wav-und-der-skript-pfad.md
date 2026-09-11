# 0007 — Audio bleibt WAV, und das Skript wird vor der Vertonung gespeichert

**Datum:** 2026-09-11 · **Status:** angenommen

## Kontext

Der Audio-Überblick ist das auffälligste Merkmal des Produkts und zugleich die unzuverlässigste
Kette darin: Ein Sprachmodell schreibt ein Gespräch, eine zweite Schnittstelle liest es mit zwei
Stimmen vor, das Ergebnis wird abgelegt und ausgeliefert. Jeder dieser Schritte kann scheitern,
und der teuerste scheitert am ehesten — das Tageskontingent der Sprachausgabe ist das knappste
im ganzen Projekt.

Die ursprüngliche Planung sah vor, das erzeugte Audio nach MP3 zu wandeln. Die Rechnung dahinter:
24 kHz, 16 Bit, Mono ergeben rund 2,88 MB je Minute, ein Gigabyte Speicher im kostenlosen Tarif
wäre also nach etwa 34 zehnminütigen Überblicken voll.

## Was das Messen an der Planung geändert hat

**Der WAV-Container ist schon da.** Die Google-API liefert rohes PCM (`audio/l16; rate=24000`),
und die Planung sah vor, den 44-Byte-Header selbst zu schreiben. Nachgemessen: Das AI SDK tut das
bereits — die Ausgabe beginnt mit `RIFF` und meldet sich als `audio/wav`. Ein Arbeitsschritt, der
nicht existiert.

**Die Größenrechnung stimmt, die Schlussfolgerung nicht mehr.** Und die Einheiten gehören dabei
sauber getrennt, sonst wird die Kapazitätsplanung zu optimistisch:

24 kHz × 16 Bit × Mono sind **48.000 Byte je Sekunde**, also 2.880.000 Byte je Minute — das sind
**2,88 MB dezimal** oder **2,75 MiB**. Drei Minuten ergeben 8.640.000 Byte: **8,64 MB** bzw.
**8,24 MiB**.

Supabase rechnet das Kontingent in dezimalen Einheiten: 1 GB sind 1.000.000.000 Byte, also passen
**rund 115** dreiminütige Überblicke hinein — nicht 34, wie die Planung mit zehnminütigen
Überblicken rechnete. Für ein Produkt, das eine Bewerbung begleitet, ist das keine Grenze.

Die Größengrenze des Buckets steht in Byte (`12582912`, also 12 MiB) und lässt damit Spielraum
über die 8,64 MB hinaus, ohne dass ein Fehler unbegrenzt Platz kostet.

## Entscheidung

**WAV, mit einem Deckel von drei Minuten.** Kein MP3-Encoder.

Der Deckel wirkt über die Skriptlänge: `MAX_SCRIPT_CHARS = 2400`, hergeleitet aus einer
gemessenen Ausgabe (196 Zeichen Skript ergaben 14,3 Sekunden Audio, also rund 13,7 Zeichen je
Sekunde). Die Grenze steht damit dort, wo sie wirkt — vor dem teuren Aufruf, nicht danach.

**Wann MP3 richtig wäre:** Sobald Überblicke aufbewahrt statt ersetzt werden, sobald sie länger
als drei Minuten sein dürfen, oder sobald jemand sie regelmäßig über Mobilfunk abruft. Dann ist
`lamejs` der Weg — reines JavaScript, weil es auf Vercel Serverless kein ffmpeg gibt. Bis dahin
wären es eine Abhängigkeit, ein Dekodier-/Kodier-Umweg und CPU-Zeit in einer Funktion mit
Laufzeitgrenze, um Platz zu sparen, der nicht knapp ist.

## Der zweite Teil: `script_only`

Der Zustandsautomat hat einen Ausgang mehr als der der Quellen:

```
pending → processing → ready
                    ↘ script_only
                    ↘ failed
```

**Das Skript wird gespeichert, bevor die Vertonung beginnt.** Diese Reihenfolge ist die ganze
Entscheidung. Schlägt die Sprachausgabe fehl — und ein erschöpftes Kontingent äußert sich als
429, erfahrungsgemäß während einer Vorführung —, ist der Text bereits da und wird als lesbares
Transkript angezeigt.

Die Alternative wäre gewesen, den Fehler als Fehler zu behandeln und es erneut zu versuchen. Das
wäre falsch in beide Richtungen: Ein erschöpftes Tageskontingent ist in fünf Minuten nicht
behoben, also hätte der Nutzer nach drei Versuchen eine Fehlermeldung statt eines Textes, den er
längst hätte lesen können.

Deshalb gibt es bei diesem Ausgang auch **keinen weiteren Versuch** und keine rote Meldung: Der
Nutzer hat etwas bekommen, nur nicht alles.

## Was bewusst nicht gebaut wurde

**Genau zwei Sprecher**, nicht konfigurierbar. Die Multi-Speaker-Schnittstelle nimmt zwei
entgegen und mehr nicht; ein Drei-Personen-Format ist keine Gestaltungsfrage, sondern technisch
ausgeschlossen.

**Kein Zwischenspeichern nach Skript-Hash.** Ein zweiter Klick erzeugt neu und ersetzt. Der
Grund: Die Quellen ändern sich, und ein Überblick, der einen alten Stand zeigt, weil sein Hash
noch passt, wäre schlimmer als einer, der eine Minute braucht.

**Keine eigene Abspielleiste.** Das eingebaute `<audio controls>` ist über die Tastatur
bedienbar, kennt die Systemlautstärke und die Wiedergabegeschwindigkeit. Eine nachgebaute Leiste
müsste all das erst wieder haben.

## Konsequenzen

- Ein Überblick belegt bis zu **8,64 MB** (8,24 MiB). Bei einer Größenordnung von hundert
  Notebooks ist der Speicher der erste Engpass — dann greift die Rechnung oben.
- Ausgeliefert wird über Signed URLs mit einer Stunde Gültigkeit. Nicht durch eine Function:
  Vercel begrenzt Antwortkörper auf 4,5 MB, ein dreiminütiger Überblick liegt darüber.
- Die Modell-ID der Sprachausgabe ist eine Preview-Version und steht in `GEMINI_TTS_MODEL`.
  Bei diesem Modelltyp ist das keine Vorsicht, sondern absehbar nötig.
