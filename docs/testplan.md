# Testplan

Was die Automatisierung nicht abdeckt — und wie die automatisierten Prüfungen nummeriert sind.
Die Nummern hier entsprechen den Dateinamen in `e2e/`, damit ein roter Lauf sofort einem
Prüfpunkt zugeordnet werden kann.

## Automatisiert

| ID  | Datei                       | Prüft                                                                                                                   |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| a0  | `e2e/a0-foundation.spec.ts` | Dark ist Default ohne Blitz, Umschalter in beide Richtungen, Wahl überlebt Reload, selbst gehostete Schriften kommen an |

Geplant, in der Reihenfolge der Umsetzung: `a1-auth`, `a2-rls-isolation`, `b1-notebook-crud`,
`b2-upload-ingest`, `b3-chat-citations`, `b4-audio-overview`, `c1-responsive`, `c2-a11y`,
`d1-landing-seo`, `d2-design-tokens`.

Dazu Vitest über die reinen Funktionen in `src/lib/`; `pnpm verify` führt Formatprüfung, Lint,
Typen und Unit-Tests nacheinander aus.

## Manuell

Diese Punkte lassen sich nicht sinnvoll automatisieren oder prüfen etwas, das nur ein Mensch
beurteilen kann.

**Fundament**

1. Frischer Clone, `pnpm install`, `cp .env.example .env.local`, `pnpm dev` — läuft die App ohne
   weitere Schritte an?
2. Erste Ansicht im Inkognito-Fenster: erscheint sie sofort dunkel, ohne hellen Blitz?
3. Netzwerkdrossel auf „Slow 3G": keine Layout-Sprünge, sichtbare Ladezustände.
4. Nur mit der Tastatur durch die Seite: ist der Fokus jederzeit sichtbar und die Reihenfolge
   nachvollziehbar?
5. Beide Designs auf einem echten Telefon ansehen — Kontrast im Hellen wirkt am Monitor anders
   als in der Hand.

Die produktbezogenen Punkte (Zitate an der richtigen Textstelle, abgewählte Quellen,
Anbieterwechsel, Fehlerpfad der Sprachausgabe, Mandantentrennung) kommen mit den jeweiligen
Scheiben hinzu.
