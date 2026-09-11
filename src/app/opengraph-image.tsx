import { ImageResponse } from 'next/og'

import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site'

/**
 * Das Vorschaubild, das erscheint, wenn jemand den Link teilt.
 *
 * Es wird zur Build-Zeit erzeugt und dann statisch ausgeliefert — kein Aufruf
 * zur Laufzeit, also auch keine Kosten und keine Latenz.
 *
 * Bewusst ohne die Projektschriften: `ImageResponse` kann `next/font` nicht
 * benutzen, die Dateien müssten von Hand geladen und mitgegeben werden. Das
 * wäre Aufwand für eine Fläche, auf der niemand die Schriftart prüft — und
 * ein Ladefehler beim Build wäre teurer als der optische Gewinn. Die Farben
 * sind dagegen die echten und stammen aus derselben Palette wie die
 * Anwendung.
 */
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/** Die dunkle Ausprägung der Palette, weil Dark der Default ist. */
const INK = '#EDF1F7'
const MUTED = '#A8B0BE'
const CANVAS = '#0E1424'
const SURFACE = '#1B2640'
const BRAND = '#5B8DEF'

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: CANVAS,
        // Derselbe Verlauf wie im Hero der Startseite.
        backgroundImage: `radial-gradient(700px 380px at 50% -10%, rgba(91,141,239,0.45), transparent 60%)`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            background: BRAND
          }}
        />
        <div style={{ color: MUTED, fontSize: 28, letterSpacing: '0.02em' }}>{SITE_NAME}</div>
      </div>

      <div
        style={{
          marginTop: 28,
          color: INK,
          fontSize: 82,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
          maxWidth: 900
        }}
      >
        {SITE_TAGLINE}
      </div>

      <div
        style={{
          marginTop: 28,
          color: MUTED,
          fontSize: 30,
          lineHeight: 1.4,
          maxWidth: 860
        }}
      >
        {SITE_DESCRIPTION}
      </div>

      <div
        style={{
          marginTop: 48,
          display: 'flex',
          alignSelf: 'flex-start',
          padding: '12px 22px',
          borderRadius: 999,
          background: SURFACE,
          color: MUTED,
          fontSize: 24
        }}
      >
        Next.js · TypeScript · Supabase
      </div>
    </div>,
    size
  )
}
