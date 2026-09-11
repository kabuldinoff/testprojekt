import { ImageResponse } from 'next/og'

/**
 * Das Symbol in der Browser-Leiste.
 *
 * Erzeugt statt als Binärdatei abgelegt, damit es aus denselben Farben kommt
 * wie alles andere: Ändert sich die Marke, ändert sich hier eine Zeile, statt
 * dass jemand ein PNG neu exportieren muss.
 *
 * Es gab dieses Symbol zunächst nicht, und das war messbar: Lighthouse zog
 * vier Punkte bei „Best Practices" ab, weil der Browser `/favicon.ico`
 * anfragte und einen 404 protokollierte. Ein Fehler in der Konsole, den
 * niemand je zu Gesicht bekommt — und trotzdem ein Fehler.
 *
 * 32 Pixel: die Größe, in der das Symbol tatsächlich erscheint. Größer
 * erzeugen und herunterskalieren lassen bringt bei einem einzelnen Buchstaben
 * nichts außer Bytes.
 */
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // --canvas und --brand-600 der dunklen Ausprägung: Dark ist der
        // Default, und in der Browser-Leiste steht das Symbol meist auf
        // dunklem Grund.
        background: '#0E1424',
        color: '#5B8DEF',
        fontSize: 24,
        fontWeight: 700,
        borderRadius: 7
      }}
    >
      N
    </div>,
    size
  )
}
