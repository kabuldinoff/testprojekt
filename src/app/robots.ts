import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

/**
 * `robots.txt` als Route statt als Datei in `public/`.
 *
 * Der Grund ist die Adresse der Sitemap: Sie muss absolut sein, und die kennt
 * eine statische Datei nicht. So steht sie in Produktion, in der Vorschau und
 * lokal jeweils richtig drin, ohne dass jemand daran denken muss.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Der angemeldete Bereich gehört nicht in einen Index. Er ist ohnehin
      // geschützt — ein Crawler bekäme nur die Anmeldeseite zu sehen —, aber
      // genau die will man dort auch nicht als Treffer haben.
      //
      // `robots.txt` ist dabei die Bitte, nicht die Grenze: Die Grenze sind
      // Middleware, Layout-Prüfung und RLS. Zusätzlich trägt jede Seite unter
      // /app ein `noindex` im Kopf, das auch dann wirkt, wenn jemand die
      // Adresse direkt verlinkt.
      disallow: ['/app/', '/api/', '/auth/']
    },
    sitemap: `${siteUrl()}/sitemap.xml`
  }
}
