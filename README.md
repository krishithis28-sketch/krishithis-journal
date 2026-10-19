# krishithis-journal

Personal portfolio journal (stocks, Swingio, Sellio) with a daily **Ithio** summary for the automated SeeSaw options book.

Live: https://krishithis28-sketch.github.io/krishithis-journal/

## Ithio

- Front end: `index.html` + `ithio.js` (pure period math, Node-tested).
- Data: Supabase `public.ithio_daily` — one **aggregate** row per trading day
  (`trade_date`, `capital`, `gross_pnl`, `charges`, `net_pnl`, `return_pct`, `wins`,
  `losses`, `source`, `notes`).
- No fills, order ids, candles, positions or broker data are stored there.
- The SeeSaw bot upserts the row at EOD (live only; paper is skipped). **The Ithio card
  is read-only; the bot is its only writer.** The rest of the journal keeps its own
  edit flow.
- Ithio capital/P&L are separate from the portfolio totals.
- Charges are estimated with a configurable buffer (default +10%); the stored `net_pnl`
  is gross minus charges.

### Card periods and fields

The card anchors on the **latest row** (not necessarily today; weekends/holidays show
the last trading day):

- **D** — latest trading day
- **W** — ISO week containing the latest row
- **M** — calendar month containing the latest row
- **ALL** — every stored row

`days` counts unique trading days with a row. **Capital** is the latest row's capital;
**Latest** is the latest day's `net_pnl`; **Net** is the sum of `net_pnl` over the
selected period; the return pill is period net ÷ latest capital. The `W · L` pill is
**all-time**, not period-specific.

### Front-end config

`index.html` defines `SUPABASE_URL` and `SUPABASE_ANON_KEY` (publishable key; safe to
expose). The card fetches `ithio_daily` on page load — there is no realtime subscription —
so refresh after the bot's EOD run (~15:25). The page is static; commit/push `main` to
deploy via GitHub Pages, then hard-refresh after UI changes.

### Security / RLS

The anon/publishable key is public and, as of this writing, can read/write
`ithio_daily` (RLS is deferred). Never store broker/API secrets in this table. If RLS is
enabled later, keep `select` for the journal and move bot writes to a service role or a
security-definer RPC. See the table's SQL comments.

### One-time schema

Run [`supabase/ithio_daily.sql`](supabase/ithio_daily.sql) once in the Supabase SQL Editor
(project `csksswotuhopqlfqilgg`). It creates only `public.ithio_daily`; existing `trades` /
`monthly_sip` tables are untouched.

### Tests

```bash
node tests/ithio_math.test.js
node tests/ithio_render.test.js
```