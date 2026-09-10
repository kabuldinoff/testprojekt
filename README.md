# Notabene

A research assistant for your own documents. Create a notebook, add sources — PDF, text,
Markdown, a URL, or pasted text — and ask questions about them. Every answer carries clickable
inline citations, and a click opens the source at the exact passage it came from. The studio
turns the selected sources into a two-voice audio overview.

Built with **Next.js 16, TypeScript and Supabase**.

## Repository layout

| Path                   | Purpose                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `src/app/`             | Routes. Everything under `(app)/` is authenticated and `noindex`; the rest is public and static. |
| `src/app/globals.css`  | Design tokens for both themes, mapped into Tailwind via `@theme inline`.                         |
| `src/components/`      | Reusable components. Orchestration only.                                                         |
| `src/lib/`             | Pure core — no network, no database, no browser. Unit tested in `__tests__/`.                    |
| `e2e/`                 | Playwright specs, numbered to match `docs/testplan.md`.                                          |
| `supabase/migrations/` | Hand-written SQL. Every policy and index carries its reason.                                     |
| `design/`              | The design canvas. Open `design/canvas.html` in a browser.                                       |
| `docs/adr/`            | Why things are the way they are, including what was deliberately left out.                       |

## Getting started

Requires Node 22.12+ and pnpm 10.

```bash
pnpm install
pnpm exec playwright install chromium   # once, for the end-to-end suite
cp .env.example .env.local              # then fill in the values
pnpm dev
```

The end-to-end suite runs against a **local** Supabase stack, never a real project — it creates
accounts and writes rows. Docker is required:

```bash
pnpm supabase:start   # the first run pulls a few images
pnpm test:e2e
```

`scripts/e2e.mjs` reads the credentials out of the running stack and refuses to start if there
is none, so the suite cannot accidentally point at production. The local ports sit on `5442x`
rather than Supabase's default `5432x`, so a second local Supabase project on the same machine
does not collide.

> The Playwright browser download is a separate step on purpose. It fetches a pinned Chromium
> build of a few hundred megabytes, so it does not belong in `pnpm install` — and it needs to
> succeed only on machines that actually run the end-to-end suite.

## Commands

| Command               | What it does                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`            | Development server                                                            |
| `pnpm verify`         | `format:check` + `lint` + `typecheck` + `test` — the gate before every commit |
| `pnpm test`           | Vitest over the pure functions in `src/lib/`                                  |
| `pnpm test:e2e`       | Local Supabase stack → production build → Playwright                          |
| `pnpm supabase:start` | Local Postgres, Auth and Storage in Docker                                    |
| `pnpm supabase:reset` | Wipe the local database and replay every migration                            |
| `pnpm format`         | Prettier, writing                                                             |

`pnpm typecheck` runs `next typegen` first. Without it the generated route types (`LayoutProps`,
`PageProps`) do not exist yet and `tsc` fails on a fresh clone.

## Environment

| File           | How it is created          | What goes in it                                   |
| -------------- | -------------------------- | ------------------------------------------------- |
| `.env.example` | Committed                  | The list of required variables, with empty values |
| `.env.local`   | Copy of the above, by hand | Real keys. Never committed.                       |

## Conventions

- Code, identifiers and commit messages in English. UI text, error messages and test names in
  German.
- Anything decidable without I/O lives in `src/lib/` as a pure function with a unit test next to
  it. Components and route handlers stay orchestration-only.
- Components use semantic utilities (`bg-surface`, `text-ink`) exclusively — never a hex value
  and never a `dark:` prefix. Dark is the default theme.
- Comments explain _why_, never _what_. Every non-obvious constant is named and justified.
- Conventional Commits. One coherent slice per commit; work lands through pull requests.

## Security invariants

- Row Level Security on every table, with real policies — never "deny-all plus a check in the
  application".
- The `service_role` client is reachable only from the ingestion worker, and an import-graph
  test fails if that stops being true.
- Database functions exposed through PostgREST are `SECURITY INVOKER`, so RLS still applies
  inside them.
- Missing access returns 404, never 403 — a 403 confirms the resource exists.
- Errors are persisted, never silently swallowed.

`CLAUDE.md` carries the reasoning behind all of these, and the platform limits that forced them.
