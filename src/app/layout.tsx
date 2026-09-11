import type { Metadata, Viewport } from 'next'

import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from '@/lib/site'
import { Lora, Plus_Jakarta_Sans } from 'next/font/google'

import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

// Beide Schriften werden von next/font zur Build-Zeit selbst gehostet. Das spart
// den Round-Trip zu Google (Lighthouse), erzeugt eine size-adjust-Fallback-Face
// gegen Layout-Sprünge — und es kontaktiert im Betrieb keinen Dritten, was bei
// einem Produkt mit Datenschutz-Versprechen kein Nebendetail ist.
//
// Plus Jakarta Sans steht hier anstelle von Satoshi: Satoshi ist nicht frei
// lizenziert, Plus Jakarta Sans (SIL OFL) ist geometrisch-humanistisch und
// optisch sehr nah. Lora trägt den kursiven Serif-Akzent, der auf der
// Landing Page auf genau einem Wort der Headline liegt.
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap'
})

const lora = Lora({
  subsets: ['latin'],
  style: ['italic'],
  variable: '--font-lora',
  display: 'swap'
})

export const metadata: Metadata = {
  /**
   * Ohne `metadataBase` erzeugt Next relative Adressen für Open-Graph-Bilder
   * und kanonische Links. Die funktionieren dort nicht: Sie werden von fremden
   * Servern gelesen — Slack, LinkedIn, Suchmaschinen —, und ein `/og.png` ohne
   * Host zeigt für die auf sich selbst.
   */
  metadataBase: new URL(siteUrl()),

  /**
   * Die Vorlage hängt den Produktnamen an jeden Seitentitel, ohne dass ihn
   * jede Seite wiederholen muss. `default` gilt dort, wo eine Seite keinen
   * eigenen Titel setzt.
   */
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,

  openGraph: {
    type: 'website',
    locale: 'de_DE',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: '/'
  },

  // `summary_large_image`, weil das Bild 1200×630 ist. Mit `summary` würde es
  // auf ein kleines Quadrat beschnitten, und die Schrift darin unlesbar.
  twitter: { card: 'summary_large_image' },

  // Der Standard für alles Öffentliche. Seiten unter /app setzen ihn
  // ausdrücklich um — siehe src/app/app/layout.tsx.
  robots: { index: true, follow: true }
}

export const viewport: Viewport = {
  // Die zwei Werte entsprechen --canvas in beiden Themes. Sie färben die
  // Browser-Leiste auf Mobilgeräten, damit die Seite nicht in einem fremden
  // Balken hängt.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0E1424' },
    { media: '(prefers-color-scheme: light)', color: '#F7F4EE' }
  ]
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning ist hier notwendig und nicht faul: next-themes
    // setzt die Theme-Klasse per Inline-Script vor der Hydration, damit kein
    // heller Blitz entsteht. Server und Client unterscheiden sich dadurch
    // genau in diesem einen Attribut.
    <html lang="de" suppressHydrationWarning className={`${plusJakarta.variable} ${lora.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
