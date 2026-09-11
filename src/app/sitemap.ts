import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

/**
 * Die Sitemap — genau eine Adresse.
 *
 * Der erste Entwurf führte auch `/anmelden` und `/registrieren` auf. Das war
 * ein Widerspruch mit sich selbst: Beide Seiten tragen ausdrücklich
 * `noindex`, weil sie keinem Suchenden etwas bringen und nur verwässern,
 * wofür die Startseite gefunden werden soll. Eine Sitemap ist die Aussage
 * „bitte indexieren" — für Seiten, die daneben „bitte nicht" sagen.
 *
 * Aufgefallen ist es bei der Lighthouse-Messung: Sie bewertete `/anmelden`
 * mit 0,63 bei SEO, wegen genau dieses `noindex`. Der Wert war richtig, die
 * Messung an dieser Seite falsch — und die Sitemap ebenfalls.
 *
 * Alles unter `/app` fehlt aus demselben Grund und zusätzlich, weil ein
 * Besucher dort nur eine Weiterleitung sähe.
 *
 * Keine `lastModified`-Daten: Diese Seite ändert sich mit dem Code, nicht mit
 * den Daten. Ein Zeitstempel, der bei jedem Abruf „jetzt" sagt, ist eine
 * Behauptung, der niemand mehr glaubt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl(), changeFrequency: 'monthly', priority: 1 }]
}
