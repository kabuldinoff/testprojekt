import type { Page } from '@playwright/test'

/**
 * Führt etwas aus und wartet, bis die ausgelöste Server Action geantwortet hat.
 *
 * ── Warum es das gibt ─────────────────────────────────────────────────────
 *
 * Server Actions antworten auf ein POST an dieselbe Adresse. Die Oberfläche
 * zeigt die Änderung aber oft sofort — bei der Anbieterwahl etwa
 * optimistisch, bevor der Server geantwortet hat. Ein Test, der auf die
 * sichtbare Änderung prüft und danach weiterarbeitet, prüft dann sein eigenes
 * Timing statt der Speicherung.
 *
 * Genau das ist zweimal passiert: In `b4` wartete der Test darauf, dass ein
 * Fieldset wieder bedienbar ist — was sofort zutreffen kann, weil es
 * anfangs bedienbar *ist*. In `b5` schickte der Test seine Anfrage, bevor der
 * Anbieterwechsel in der Datenbank stand, und bekam 202 statt 409. Beide
 * Male war der Code richtig und der Test falsch.
 *
 * Deshalb steht das Warten hier an einer Stelle, mit der Begründung daneben,
 * statt zweimal nachgebaut zu werden.
 */
export async function mitServerAction(page: Page, aktion: () => Promise<void>): Promise<void> {
  const antwort = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url() === page.url()
  )
  await aktion()
  await antwort
}
