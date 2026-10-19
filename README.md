# krishithis-journal

Personal portfolio journal (stocks, Swingio, Sellio) with a daily **Ithio** summary for the automated SeeSaw options book.

Live: https://krishithis28-sketch.github.io/krishithis-journal/

## Ithio

- Front end: `index.html` + `ithio.js` (pure period math, Node-tested).
- Data: Supabase `public.ithio_daily` — one **aggregate** row per trading day
  (`trade_date`, `capital`, `gross_pnl`, `charges`, `net_pnl`, `return_pct`, `wins`,
  `losses`, `source`, `notes`).
- No fills, order ids, candles, positions or broker data are stored there.
- The SeeSaw bot upserts the row at EOD (live only; paper is skipped). The journal is read-only.
- Ithio capital/P&L are separate from the portfolio totals.
- Charges are estimated with a configurable buffer (default +10%) and stored net.

### One-time schema

Run [`supabase/ithio_daily.sql`](supabase/ithio_daily.sql) once in the Supabase SQL Editor
(project `csksswotuhopqlfqilgg`). It creates only `public.ithio_daily`; existing `trades` /
`monthly_sip` tables are untouched.

### Tests

```bash
node tests/ithio_math.test.js
node tests/ithio_render.test.js
```