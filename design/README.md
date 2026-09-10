# Design Canvas

`canvas.html` — eine einzelne, self-contained HTML-Datei. Kein Build, kein Framework:
im Browser öffnen.

```bash
open design/canvas.html
```

## Wozu

Diese Datei entstand **vor der ersten React-Komponente**. Farben, Typografie,
Komponenten, die drei Viewports und alle Leer-, Lade- und Fehlerzustände waren
festgelegt, bevor Code geschrieben wurde. Das ist billiger als dieselben Fragen später
in dreißig Komponenten einzeln zu beantworten — und es ist der Grund, warum es im
Produktcode keinen einzigen `dark:`-Prefix gibt: die Palette ist einmal definiert und
wird unter `.dark` überschrieben.

Jedes Artboard trägt eine Begründung, warum es so aussieht.

## Herkunft der Farbwerte

Die Werte sind nicht geschätzt, sondern per `getComputedStyle` aus den Referenzseiten
ausgelesen:

| Quelle          | Übernommen                                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| relationflow.io | Primärblau `#2563EB`, Hover `#1D4ED8`, Tinte `#0E1424`, Radien 16 / 12 / 999 px, der dunkle Verlauf `#0E1424 → #1B2640`, der kursive Serif-Akzent auf einem einzelnen Wort der Headline |
| kiberatung.de   | Akzentgold `#FAEF70`, Gold-auf-Hell `#8A8030`                                                                                                                                           |
| NotebookLM      | Der weiche Verlaufshintergrund und die großzügigen Panel-Radien                                                                                                                         |

Satoshi (RelationFlow) ist lizenzpflichtig; ersetzt durch **Plus Jakarta Sans**
(SIL OFL, geometrisch-humanistisch, optisch sehr nah). Serif-Akzent: **Lora**.

## Gold-Disziplin

Gold ist Akzent, nicht Zweitfarbe. Erlaubt an genau drei Stellen: aktives
Zitat-Highlight, „Quelle bereit"-Badge, Studio-Akzentlinie. Die Regel steht in
`CLAUDE.md`, weil ein Akzent ohne Regel innerhalb von zwei Wochen zur zweiten
Primärfarbe wird.

## Verbindlichkeit

Der Canvas ist keine Skizze, sondern die Referenz. `e2e/d2-design-tokens.spec.ts` liest
im laufenden Build `getComputedStyle` aus und prüft Hex-Werte, Radien und
Font-Familien **in beiden Modi** — Abweichung vom Canvas ist ein roter Test.
