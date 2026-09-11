#!/usr/bin/env node
/**
 * Ein Ersatz für die AI-Anbieter, nur für die End-to-End-Tests.
 *
 * ── Warum überhaupt ───────────────────────────────────────────────────────
 *
 * Gegen die echten Anbieter zu testen scheitert an drei Dingen gleichzeitig:
 *
 * 1. **Nicht überprüfbar.** Ein echtes Modell formuliert jedes Mal anders.
 *    Man kann prüfen, dass *irgendetwas* kam — nicht, dass Beleg [1] auf den
 *    richtigen Ausschnitt zeigt. Genau das ist aber die Eigenschaft, an der
 *    dieses Produkt hängt.
 * 2. **Kosten und Kontingent.** Jeder CI-Lauf verbrauchte das kostenlose
 *    Tageskontingent, das für die Vorführung gebraucht wird.
 * 3. **Geheimnisse im öffentlichen Repo.** CI bräuchte echte Schlüssel.
 *
 * Getestet wird deshalb das *System*, nicht der Anbieter: Suche, Nummerierung,
 * Belegprüfung, Speicherung, Darstellung. Was das Modell daraus macht, ist
 * nicht Gegenstand einer Zusicherung, die dieses Projekt geben kann.
 *
 * Die Naht ist `baseURL` — beide SDKs nehmen sie entgegen. Im Betrieb ist die
 * Variable nicht gesetzt und die Voreinstellung des SDK gilt.
 *
 * ── Die Einbettung ist absichtlich keine Zufallszahl ──────────────────────
 *
 * Ein zufälliger Vektor machte die semantische Suche zu Rauschen, und der
 * Test bewiese nur, dass die Volltextsuche funktioniert. Stattdessen wird ein
 * Wortsack aufgebaut: jedes Wort landet über seine Prüfsumme in einer
 * Dimension. Zwei Texte mit gemeinsamen Wörtern bekommen dadurch einen hohen
 * Kosinuswert — grob, aber deterministisch und in der richtigen Richtung.
 */
import { createServer } from 'node:http'

const DIMENSIONS = 1024
const PORT = Number(process.env.AI_STUB_PORT ?? 54430)

/** Deterministische Prüfsumme (FNV-1a), damit Läufe vergleichbar bleiben. */
function hash(word) {
  let h = 0x811c9dc5
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

function embed(text) {
  const v = new Array(DIMENSIONS).fill(0)
  for (const wort of String(text)
    .toLowerCase()
    .match(/\p{L}+/gu) ?? []) {
    v[hash(wort) % DIMENSIONS] += 1
  }
  // Auf Einheitslänge bringen: Kosinusabstand vergleicht Richtungen, und ein
  // langer Abschnitt soll nicht allein wegen seiner Länge näher liegen.
  const laenge = Math.hypot(...v) || 1
  return v.map((x) => x / laenge)
}

/**
 * Baut die Antwort aus dem, was tatsächlich im Kontext steht.
 *
 * Damit prüft der Test eine echte Zuordnung: der Beleg zeigt auf einen
 * Ausschnitt, den es gibt, und die Oberfläche muss dessen Wortlaut zeigen.
 *
 * Zwei Sonderfälle steuert die Frage selbst, damit die Tests auch die
 * unangenehmen Pfade erreichen:
 *   „ERFINDE"     → das Modell belegt mit [9], obwohl es nur wenige
 *                   Ausschnitte gibt. Der erfundene Beleg muss verschwinden.
 *   „OHNE BELEG"  → eine Antwort ganz ohne Nummer.
 */
function antwort(prompt) {
  if (prompt.includes('ERFINDE')) return 'Eine unbelegte Behauptung [9].'
  if (prompt.includes('OHNE BELEG')) return 'Dazu steht nichts in den ausgewählten Quellen.'

  const treffer = /^\[1\] \([^)]*\)\n(.+)$/m.exec(prompt)
  if (!treffer) return 'Dazu steht nichts in den ausgewählten Quellen.'

  return `Laut den Quellen: ${treffer[1].slice(0, 60)} [1].`
}

function readBody(req) {
  return new Promise((resolve) => {
    let roh = ''
    req.on('data', (c) => (roh += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(roh))
      } catch {
        resolve({})
      }
    })
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const body = await readBody(req)

  // ── Mistral: Einbettung ──────────────────────────────────────────────────
  if (url.pathname.endsWith('/embeddings')) {
    const eingaben = Array.isArray(body.input) ? body.input : [body.input ?? '']
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        id: 'stub',
        model: body.model ?? 'mistral-embed',
        data: eingaben.map((text, index) => ({
          object: 'embedding',
          index,
          embedding: embed(text)
        })),
        usage: { prompt_tokens: eingaben.length, total_tokens: eingaben.length }
      })
    )
    return
  }

  // ── Mistral: Chat (SSE, OpenAI-Form) ────────────────────────────────────
  if (url.pathname.endsWith('/chat/completions')) {
    const prompt = (body.messages ?? []).map((m) => m.content).join('\n')
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const text = antwort(String(prompt))
    res.write(
      `data: ${JSON.stringify({
        id: 'stub',
        object: 'chat.completion.chunk',
        model: body.model ?? 'stub',
        choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }]
      })}\n\n`
    )
    res.write(
      `data: ${JSON.stringify({
        id: 'stub',
        object: 'chat.completion.chunk',
        model: body.model ?? 'stub',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })}\n\n`
    )
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  // ── Google: generateContent, strömend ───────────────────────────────────
  if (url.pathname.includes(':streamGenerateContent')) {
    const prompt = JSON.stringify(body.contents ?? [])
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(
      `data: ${JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: antwort(prompt) }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
      })}\n\n`
    )
    res.write(
      `data: ${JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
      })}\n\n`
    )
    res.end()
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: `Kein Stub für ${req.method} ${url.pathname}` }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ai-stub] hört auf http://127.0.0.1:${PORT}`)
})
