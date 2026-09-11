# Lighthouse

Gemessene Werte, nicht behauptete. Reproduzierbar mit:

```
pnpm supabase:start
pnpm lighthouse
```

Das Skript baut die Produktionsfassung, startet sie, misst **dreimal je Adresse** und bricht bei
einem Wert unter 90 ab. In CI läuft derselbe Befehl als eigener Job; die Berichte liegen
anschließend als Artefakt am Lauf.

## Stand 11.09.2026

| Adresse     | Performance | Accessibility | Best Practices |   SEO |
| ----------- | ----------: | ------------: | -------------: | ----: |
| `/`         |         100 |           100 |            100 |   100 |
| `/anmelden` |         100 |           100 |            100 | 63 \* |

Kennzahlen der Startseite (Median aus drei Läufen, Desktop):

| Messwert                 |   Wert |
| ------------------------ | -----: |
| First Contentful Paint   | 0,22 s |
| Largest Contentful Paint | 0,56 s |
| Total Blocking Time      |   0 ms |
| Cumulative Layout Shift  |      0 |

\* **Die 63 sind gewollt.** `/anmelden` trägt ausdrücklich `noindex`, und Lighthouse bewertet
genau das ab. Eine Anmeldeseite bringt keinem Suchenden etwas und verwässert, wofür die
Startseite gefunden werden soll. Die SEO-Kategorie wird für diese Adresse deshalb nicht
geprüft — die drei anderen schon, denn Ladezeit und Bedienbarkeit gelten dort genauso.

Das steht so in `lighthouserc.json` als `assertMatrix`, damit die Ausnahme im Code sichtbar ist
und nicht in einem Kopf.

## Warum die Startseite so schnell ist

Nicht durch Optimierung, sondern durch Arbeitsteilung:

- **Sie ist statisch.** Kein Datenbankzugriff, kein Rendern pro Aufruf.
- **Das einzige Client-Bündel ist der Theme-Umschalter.** Der Chat-Client und der
  Abschnittsbetrachter liegen ausschließlich hinter `/app` und kosten niemanden, der nur
  nachsehen will, was das hier ist.
- **Die Schriften sind selbst gehostet** (`next/font`). Kein Verbindungsaufbau zu einem fremden
  Server vor dem ersten Text — und kein Third-Party in der Datenschutzbetrachtung.
- **Kein Layoutsprung**, weil es kein Bild gibt, dessen Maße erst nach dem Laden feststehen.

## Was gemessen wird und was nicht

Gemessen wird, was öffentlich ist. Der angemeldete Bereich hat andere Ziele: Dort liegt der
schwere Teil der Anwendung, und ohne Sitzung wäre die Messung ohnehin die der Anmeldeseite.

Dass eine authentifizierte Route bei diesen Kategorien nicht 100 erreichen würde, ist kein
Versäumnis, sondern die Folge derselben Entscheidung, die die Startseite schnell macht.

## Ein Fund aus der ersten Messung

Der erste Lauf ergab bei „Best Practices" 96 statt 100. Die Ursache war ein 404 auf
`/favicon.ico` — ein Fehler in der Browser-Konsole, den nie jemand zu Gesicht bekommt, und
trotzdem ein Fehler. `src/app/icon.tsx` erzeugt das Symbol jetzt aus den Marken-Tokens.

Der zweite Lauf deckte einen Widerspruch auf, den kein Test gefunden hätte: `sitemap.ts` führte
`/anmelden` und `/registrieren` auf, obwohl beide `noindex` tragen. Eine Sitemap ist die Aussage
„bitte indexieren" — für Seiten, die daneben „bitte nicht" sagen. Sie nennt jetzt nur noch die
Startseite, und `e2e/d1-landing-seo` hält das fest.
