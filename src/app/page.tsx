import Link from 'next/link'

import { ThemeToggle } from '@/components/theme-toggle'
import { buttonClasses } from '@/components/ui/button'
import { Wordmark } from '@/components/wordmark'
import { PROVIDERS } from '@/lib/llm/registry'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from '@/lib/site'

/**
 * Die öffentliche Startseite.
 *
 * ── Warum hier fast kein JavaScript läuft ─────────────────────────────────
 *
 * Diese Seite ist vollständig server-gerendert. Das einzige Client-Bündel ist
 * der Theme-Umschalter; alles andere sind Links und Text. Das ist keine
 * Sparsamkeit um ihrer selbst willen, sondern die Arbeitsteilung, auf der die
 * Lighthouse-Werte beruhen: Der Chat-Client und der Abschnittsbetrachter
 * liegen ausschließlich hinter `/app`, wo sie niemanden kosten, der nur
 * nachsehen will, was das hier ist.
 *
 * Gestaltung nach `design/canvas.html`, Artboard „Landing Page": Pill-Leiste
 * mit Schatten, zentrierte Überschrift mit kursivem Serif-Akzent auf genau
 * einem Wort, Verlauf im Hintergrund.
 */

export const metadata = {
  alternates: { canonical: '/' }
}

/**
 * Strukturierte Daten für Suchmaschinen und für die Modelle, die inzwischen
 * mitlesen.
 *
 * Als `SoftwareApplication`, weil es das am ehesten trifft — eine Anwendung,
 * die man im Browser benutzt. `offers` mit Preis 0 ist keine Marketingaussage,
 * sondern die ehrliche Angabe: Es gibt keine Bezahlschranke, weil es nichts zu
 * bezahlen gibt.
 */
function strukturierteDaten() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: siteUrl(),
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Web',
    inLanguage: 'de',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    featureList: [
      'Belegte Antworten mit Sprung zur Quellstelle',
      'PDF, Text, Markdown, Webseiten und eingefügter Text als Quellen',
      'Zweistimmiger Audio-Überblick',
      'Indexierung in der EU'
    ]
  }
}

const SCHRITTE = [
  {
    titel: 'Quellen hinzufügen',
    text: 'PDF, Text, Markdown, eine Webadresse oder einfach eingefügter Text. Jede Quelle wird zerlegt und durchsuchbar gemacht — der Fortschritt ist sichtbar, auch wenn etwas schiefgeht.'
  },
  {
    titel: 'Fragen stellen',
    text: 'Die Antwort entsteht ausschließlich aus den ausgewählten Quellen. Steht dort nichts, sagt sie das — statt zu raten.'
  },
  {
    titel: 'Belege prüfen',
    text: 'Jede Aussage trägt eine Nummer. Ein Klick zeigt die Passage, auf der sie beruht — im Wortlaut, auch wenn die Quelle später gelöscht wird.'
  }
]

export default function Home() {
  return (
    <div className="min-h-dvh bg-canvas">
      {/*
        Das Skript für strukturierte Daten steht im Markup und nicht im
        `<head>` über die Metadata-API: Next hat dafür keinen Platz, und die
        Position ist Suchmaschinen gleichgültig — sie lesen das ganze
        Dokument.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(strukturierteDaten()) }}
      />

      <div className="relative isolate overflow-hidden">
        {/*
          Der Verlauf liegt als eigenes Element hinter dem Inhalt und nicht als
          Hintergrund auf dem Container: So kann er über den Rand hinausragen,
          ohne die Seite breiter zu machen. `aria-hidden`, weil er nichts
          bedeutet.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]"
          style={{ background: 'var(--glow)' }}
        />

        <header className="mx-auto flex max-w-5xl justify-center px-4 pt-5">
          {/*
            Die Leiste ist breit und die Mitte bleibt leer: Links steht, wer
            man ist, rechts, was man tun kann. Ein zusammengeschobener Block
            ließe beides gleich wichtig erscheinen.

            Der Umschalter steht direkt beim Zeichen und nicht bei den
            Einstiegen — er gehört zur Darstellung, nicht zur Handlung.

            Auf schmalen Geräten weicht als Erstes der Wortteil des Zeichens:
            Die Plakette allein ist wiedererkennbar, weil sie dieselbe ist wie
            im Browser-Tab. Beide Einstiege bleiben dagegen stehen — sie sind
            der Zweck der Leiste, und einen davon zu verstecken hieße, jemanden
            mit Konto den Umweg über die Registrierung gehen zu lassen.
          */}
          <nav
            aria-label="Hauptnavigation"
            className="flex w-full max-w-3xl items-center gap-2 rounded-pill border border-hairline bg-surface py-2 pr-2 pl-3 shadow-pop sm:gap-3 sm:pl-4"
          >
            <Wordmark href="/" hideWordBelowSm />
            <ThemeToggle />
            <span className="flex-1" />
            <Link
              href="/anmelden"
              className="rounded-pill px-2 py-1 text-sm whitespace-nowrap text-muted-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:px-3"
            >
              Anmelden
            </Link>
            {/*
              `whitespace-nowrap`: Ohne das brach die Beschriftung auf schmalen
              Geräten in zwei Zeilen um, und der Knopf wuchs aus der runden
              Leiste heraus.
            */}
            <Link
              href="/registrieren"
              className={buttonClasses({ size: 'compact', className: 'whitespace-nowrap' })}
            >
              Kostenlos starten
            </Link>
          </nav>
        </header>

        <main>
          <section className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center sm:pt-24">
            <h1 className="mx-auto max-w-[16ch] text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
              Deine Quellen, <span className="font-serif italic text-muted-ink">verstanden</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[56ch] text-lg text-pretty text-muted-ink">
              {SITE_DESCRIPTION}
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/registrieren" className={buttonClasses()}>
                Kostenlos starten
              </Link>
              <Link href="/anmelden" className={buttonClasses({ variant: 'secondary' })}>
                Ich habe schon ein Konto
              </Link>
            </div>
          </section>
        </main>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-24">
        <section aria-labelledby="so-gehts">
          <h2 id="so-gehts" className="sr-only">
            So funktioniert es
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {SCHRITTE.map((schritt, i) => (
              <li
                key={schritt.titel}
                className="rounded-card border border-hairline bg-surface p-5 shadow-card"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-7 items-center justify-center rounded-pill bg-brand-50 text-sm font-bold tabular-nums text-brand-600"
                >
                  {i + 1}
                </span>
                <h3 className="mt-3 font-bold">{schritt.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-ink">{schritt.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/*
          Der Audio-Überblick steht zwischen den drei Schritten und dem
          Datenfluss, weil er beides verbindet: Er ist das, was aus den
          Quellen entsteht, und er ist der Grund, warum die Anbieterwahl nicht
          folgenlos ist — vertonen kann nur einer von beiden.
        */}
        <section aria-labelledby="audio" className="mt-20">
          <div className="rounded-card border border-hairline bg-surface p-6 shadow-card sm:p-8">
            <p className="text-xs font-bold tracking-wide text-accent-ink uppercase">Studio</p>
            <h2 id="audio" className="mt-2 text-2xl font-extrabold tracking-tight text-balance">
              Lieber <span className="font-serif italic text-muted-ink">hören</span> als lesen
            </h2>
            <p className="mt-3 max-w-[62ch] text-muted-ink">
              Aus den ausgewählten Quellen entsteht ein zweistimmiges Gespräch, das die Kernpunkte
              durchgeht — etwa eine Minute, zum Anhören unterwegs. Das Transkript steht daneben,
              sprecherweise und zum Mitlesen.
            </p>
            <p className="mt-3 max-w-[62ch] text-sm text-muted-ink">
              Auch hier gilt die Regel des Hauses: Gesprochen wird nur, was in den Quellen steht.
              Und wenn die Sprachausgabe einmal nicht verfügbar ist, bekommen Sie den Text trotzdem
              — statt eines Ladebalkens, der nie fertig wird.
            </p>
          </div>
        </section>

        {/*
          Der Abschnitt, der dieses Produkt von einem Chatfenster
          unterscheidet. Die Sätze kommen aus derselben Registry, aus der auch
          das Datenfluss-Panel in der Anwendung liest — damit auf der
          Startseite nichts stehen kann, was drinnen nicht gilt.
        */}
        <section aria-labelledby="datenfluss" className="mt-20">
          <h2 id="datenfluss" className="text-2xl font-extrabold tracking-tight text-balance">
            Wo Ihre Daten <span className="font-serif italic text-muted-ink">wirklich</span> liegen
          </h2>
          <p className="mt-3 max-w-[60ch] text-muted-ink">
            Die Indexierung Ihrer Quellen läuft fest über einen europäischen Anbieter. Für die
            Antworten können Sie wählen — und Sie sehen dabei, was das jeweils bedeutet. Genau
            dieser Text steht auch in der Anwendung neben der Auswahl.
          </p>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {Object.values(PROVIDERS).map((anbieter) => (
              <div
                key={anbieter.id}
                className="rounded-card border border-hairline bg-surface p-5 shadow-card"
              >
                <dt className="font-bold">{anbieter.label}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-ink">{anbieter.dataFlow}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8 text-sm text-muted-ink">
          <Wordmark href="/" />
          {/*
            Auf schmalen Geräten rutscht die Zeile unter das Zeichen und nimmt
            die ganze Breite; „Anmelden" bleibt dadurch oben auf Höhe des
            Zeichens. Vorher brach alles der Reihe nach um, und der Einstieg
            landete als dritte Zeile unter einem Fließtext.
          */}
          <span className="order-last w-full sm:order-none sm:w-auto">{SITE_TAGLINE}</span>
          <Link
            href="/anmelden"
            className="ml-auto rounded-control hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Anmelden
          </Link>
        </div>
      </footer>
    </div>
  )
}
