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
node tests/ithio_story.test.js
node tests/ithio_story_render.test.js
```

## Ithio share card (`ithio-story.html`)

A standalone, fixed-size card for a **daily Instagram post**. It is a separate page —
`index.html` and the journal card are untouched. It reads the same `ithio_daily` rows and
reuses `IthioMath.computeSummary()`, so the card can never disagree with the journal.

Live: <https://krishithis28-sketch.github.io/krishithis-journal/ithio-story.html>

- **9:16** `1080x1920` (story/reel cover) — default
- **1:1** `1080x1080` (feed post)

Content order (same for both sizes): wordmark + date → period chip → big signed ₹ net with
the return pill → wins / losses / win-rate / sessions → cumulative-net sparkline of the last
N sessions → month-to-date, all-time and latest-day rows → `₹50,000 capital · net of est.
charges` + handle + *"Personal trading journal. Not investment advice."*

### URL parameters

| param | default | meaning |
|---|---|---|
| `date` | latest row | as-of day. **Clamps to the last trading day on or before it**, so a weekend/holiday date shows the previous session (safe for backfilling old posts). |
| `period` | `day` | `day` \| `week` (ISO, Mon–Sun) \| `month` \| `all` |
| `format` | `story` | `story` (1080x1920) \| `square` (1080x1080) |
| `style` | `midnight` | template: `midnight` \| `paper` \| `neon` \| `bloom` \| `broadsheet` \| `minimal` (legacy `?theme=dark`/`light` maps to `midnight`/`paper`) |
| `sessions` | `20` | sparkline window |
| `clean` | — | `1` hides the control bar (screenshot / headless) |
| `handle` | — | e.g. `?handle=@krish` adds a footer line |
| `month` | as-of month | `YYYY-MM` for the Month row; the picker writes it |
| `capital` | `100000` | starting capital; the CAPITAL field shows this plus cumulative net |
| `detail` | `card` | preset: `card` (journal replica) \| `compact` \| `pro` \| `analyst` (see *Sections*) |
| `blocks` | preset | comma list, wins over `detail`: `tag,hero,stats,journal,equity,strip,risk,risk2,streaks,cost,spark,rows` |
| `tag` | `SEESAW · NIFTY OPTIONS · INTRADAY` | descriptor beside the period chip; `?tag=` (blank) hides it |
| `probe` | — | `1` writes the layout self-measurement into `document.title` (used by `tools/probe-layout.js`) |

### Sections

Every section is an independent block; a `detail` preset is just a named set of them.

| block | what it shows |
|---|---|
| `journal` | **the journal card verbatim**: CAPITAL · LATEST · NET (big) · `+x.xx%` pill · `Overall 33W · 26L` |
| `hero` | the poster-style NET headline with its return pill |
| `stats` | WINS / LOSSES / WIN RATE / SESSIONS strip |
| `tag` | strategy/instrument descriptor under the DAY chip |
| `equity` | **cumulative net from the first stored session**, with `MAX DD −₹x (−y%)` called out |
| `strip` | last N sessions as signed bars, height ∝ \|net\| relative to the biggest day, plus a `5 Nov → 13 Nov` axis |
| `risk` | 4 tiles: **DAY PF**, **MAX DD**, **SHARPE**, **R:R** |
| `risk2` | 2 wider tiles: **GREEN DAYS %**, **AVG DAY** |
| `streaks` | current green/red run + longest run each way |
| `cost` | charges ₹ and **% of gross**, total trades, **expectancy per trade** |
| `spark` | the 20-session cumulative sparkline |
| `rows` | MONTH TO DATE / ALL TIME / LATEST DAY |

Presets: `card` = `tag,journal,rows` (default — the journal card, nothing invented) · `compact` =
`hero,stats,spark,rows` · `pro` = `tag,hero,stats,equity,strip,risk,rows` · `analyst` = `pro` +
`risk2,streaks,cost`. On a DAY card the LATEST DAY row hides itself (it repeats the hero).

### Auto-fit (why the card can never clip)

The card is a fixed 1080×1920 (or 1080×1080) box, so a section that doesn't fit would silently
cut the footer. After every render `autoFit()` measures `scrollHeight` against `clientHeight` and,
while it overflows, hides the lowest-priority visible section in this order:

```
cost → streaks → risk2 → spark → strip → stats → tag → risk → equity
```

`hero`, `journal` and `rows` are never dropped — those are the card's reason to exist. When
something is shed the reason is written to `#hint` (and to `body[data-fit]`), so it's never silent.
On 9:16 every preset fits untouched; on 1:1 `analyst` sheds `cost,streaks,risk2`.

### Layout regression check

`?probe=1` puts `overflow=<px> h=<px> w=<px> blocks=… dropped=…` into `document.title`, and
`tools/probe-layout.js` walks **every style × preset × format** (48 cases) through headless Edge
over the DevTools protocol and fails if any case clips:

```bash
python -m http.server 8080 --directory .
node tools/probe-layout.js            # 48 cases, 0 problem(s)
```

Run that after any CSS change. It caught a real 232px overflow in the 1:1 analyst card.

### Caching

`ithio-story.html` is served `no-store`, and the script tag carries a version
(`ithio-story.js?v=N`). Bump `?v=` whenever the JS changes, otherwise a browser can keep running
the previous file — which is exactly how a stale copy shows `—` placeholders and a clipped footer.

### How the metrics are defined

All of it is derived from the stored per-day rows — **day-level, not trade-level** — so it can
never contradict the journal. Nothing new is stored in Supabase.

| metric | formula |
|---|---|
| DAY PF | Σ net of green days ÷ Σ \|net\| of red days (∞ when there is no red day) |
| MAX DD | deepest peak-to-trough of the cumulative net curve, as % of capital |
| SHARPE | mean daily net ÷ sample σ of daily net × √252 (rf = 0, annualised) |
| R:R | average green day ÷ average red day |
| GREEN DAYS | green sessions ÷ (green + red); no-trade days excluded |
| AVG DAY | mean net per session (including no-trade days) |
| expectancy | total net ÷ total trades (wins + losses from the row) |
| charges drag | estimated charges ÷ **gross profit** (Σ of green-day gross, so losing days can't flatter it) |

These are honest summaries of a small sample, not an audited track record: Sharpe on ~20
sessions is noisy, and R:R uses day aggregates because per-trade P&L sizes aren't stored.

### Templates

One layout, six skins — all driven by CSS custom properties in `ithio-story.html`, so a new
skin is ~20 lines of tokens and nothing else changes:

| # | `?style=` | look |
|---|---|---|
| 1 | `midnight` | deep navy + violet aura, mint/rose numbers — default, closest to a fintech app |
| 2 | `paper` | cream ledger, faint paper grain, serif labels with sans numerals — editorial |
| 3 | `neon` | near-black with a cyan grid, monospace type, glowing hero and sparkline — terminal |
| 4 | `bloom` | pastel lilac→peach gradient, frosted tile, big soft shadow — most Instagram-native |
| 5 | `broadsheet` | ink navy, white type, poster-scale hero, heavy rules — magazine cover |
| 6 | `minimal` | pure white, sharp hairlines, one accent — clean and safe for a mixed feed |

### Controls

Buttons: period, `←`/`→` session, `9:16`/`1:1`, template picker, **Download PNG** (html2canvas;
if the CDN is blocked, use the browser screenshot). Keyboard: `←` `→` session, `↑` `↓`
period. Every change rewrites the URL, so a card you like is a shareable link.

### Headless / automation

`<body>` carries `data-ready="1"` after the first successful render (`data-ready="error"`
with a message in `#hint` on failure), so a screenshot job waits deterministically:

```
document.querySelector('body[data-ready="1"]')   // or Playwright: waitForSelector
```

`tools/ithio-card.js` does exactly that (Playwright, no server needed — it opens the local
file) and writes `cards/ithio-<date>-9x16.png` + `-1x1.png`. `.github/workflows/ithio-card.yml`
runs it **on GitHub** after the bot's EOD write (15:40 IST, Mon–Fri), so it never touches the
VPS and needs no machine running:

```bash
node tools/ithio-card.js                 # today (IST), both formats
CARD_DATE=2026-11-13 node tools/ithio-card.js
```

### Filling the 9:16 lower half

The card is 1080×1920 and the journal fields only fill the top third, so the `card` preset carries
the **month calendar heatmap** underneath: Monday-first weeks, every day tinted green/red by that
day's net with the amount inside, plus `+₹4,244 · 6G · 2R` in the header. It follows the month
picker, so the calendar and the numbers always describe the same month.

It uses no fixed cell height: in card mode the grid is `flex: 1 1 auto` with `grid-auto-rows: 1fr`,
so a 5-week month and a 6-week month both fit exactly with no overflow and no dead band. In 1:1 it
is hidden (no room).

These blocks exist but are **not in any preset** — they are candidates, enable them explicitly with
`?blocks=` when you want to try one on a post (see *Ideas* below):

| block | renders |
|---|---|
| `equity` | cumulative net line since day one + `MAX DD −₹x (−y%)` |
| `monthbars` | last 6 months as bars with ₹ values |
| `bestworst` | `BEST DAY +₹8,268 · 4 Nov` / `WORST DAY −₹8,834 · 9 Nov` |
| `goal` | `?goal=200000` → progress bar `₹1,00,000 → ₹2,00,000 · 3.5%` |

e.g. `?blocks=journal,calendar,equity,rows`.

### The card preset

`card` = `journal, calendar, donut, watermark, rows` — and nothing else. 9:16 shows all of it; in
1:1 the calendar hides (`display:none`) and the win-rate row takes the freed space, so a square
post is journal → ring + handle → month/all-time rows.

| block | renders |
|---|---|
| `journal` | CAPITAL · LATEST (+ %) · NET in the brand tone, then `Overall 33W 26L` chips |
| `calendar` | month heatmap for the picked month, `+₹4,244 · 6 green · 2 red` |
| `donut` + `candles` | one row: win-rate ring (percentage inside, all-time) then an **equity candlestick chart** |
| `rows` | the picked month, then ALL TIME |
| footer badge | `@the_wounded_trader` as a pill in the footer (`?handle=` overrides) |

### The equity candles

Candles of the **book's equity**, not of an option's price. We store one net per day, so:

```
open  = equity before the first session in the bucket
close = equity after the last session in the bucket
high  = best equity reached on any close inside the bucket
low   = worst equity reached on any close inside the bucket
```

A daily candle therefore has no wick (high = max(open, close)); weekly and monthly candles get real
wicks from the daily closes inside them. That distinction matters if anyone assumes it's price data.

- **Granularity follows the period selector**: DAY → daily candles, WEEK → weekly (`W45` labels),
  MONTH → monthly (`Oct`, `Nov`). `ALL` uses daily up to 40 sessions, then weekly.
- **Y axis is ₹ in lakhs** (`1.22L` … `0.95L`) with a dashed **₹1.00L starting line**, so every
  candle sits above or below the capital you began with.
- X labels are day-of-month, ISO week, or month name; ~5 labels are shown regardless of count.
- Candles are capped at `?sessions=` (default 20), keeping the most recent.

Content is top-aligned and nothing stretches, so the bottom of the card is deliberately left empty
for now (≈150 + 160 px in 9:16). In 1:1 the calendar hides and the same stack is used.

The strategy tag (`SEESAW · …`) is no longer part of the card; add `?blocks=…,tag` if you want it.

### What the month picker does — and doesn't do

Picking a month changes **only** the Month row and the calendar. The header date, NET, LATEST and
**ALL TIME stay put**: `ALL TIME` always ends at the latest stored session (`lastRowDate()`), so it
reads `ALL TIME · 19 DAYS +₹3,517 +3.52%` no matter which month you are browsing.

The row reads `Month: Nov 2026` and is a button. Clicking it opens a list of every month that has
rows (newest first). Picking one **travels to that month**: the period switches to MONTH, the
header shows that month's range, and NET / LATEST / CAPITAL / calendar all describe it. The URL
carries `?month=YYYY-MM`, and `?month=` on its own implies `period=month`.

With no `?month=`, the row defaults to the month of the as-of day, so a plain reload always shows
the current month. The anchor lands on the last day in that month that **actually traded** — a
no-trade row would otherwise render LATEST as `₹0`. A month with no rows shows `—`.

The list is a **fixed-position overlay**, not an absolutely-positioned child: the card has
`overflow: hidden`, so a menu opening under the last row was being clipped and appeared to do
nothing when clicked. It is measured against the button's rect, flips above the row when there
isn't room below, is hidden while exporting (`body.capturing`), and the caret disappears in
`?clean=1` so screenshots stay tidy.

The month is measured as its own block: `net ÷ equity on the first trading day of that month`,
which is why October shows `+4.24%` while November shows `−0.70%` on the same card.

### Metric panel and chips

CAPITAL / LATEST / NET share **one gradient panel** (`--tile-grad`) split by hairlines, rather
than three separate tiles — closer to the journal's portfolio card. Each cell is a flex column
with `align-items: flex-start`, so the `%` chip under LATEST hugs its own text (sized by an
id rule, `#jLatestPct` 24px, because `setTone` rewrites `className` and would drop a size class).

`Overall` is followed by **two separate chips**: `33W` on a green tint and `26L` on a red tint.

### Numbers policy

**Capital compounds.** The card starts from **₹1,00,000** and CAPITAL always shows the live
equity — `₹1,00,000 + cumulative net up to the as-of day` — so it moves every session. Override
the base with `?capital=` (e.g. `?capital=200000`).

**Percentages are period returns on the equity the period started with**, not on today's
capital: `net ÷ (start capital + net of every session before the period)`. For a DAY card that
is the return on yesterday's closing equity; for MONTH it is the return on the equity on the
1st. This is why a month can be −0.70% when the raw loss is −₹728 on a ₹1.03L book.

**LATEST** is always the as-of session, whatever period is selected, and it carries the
green/red tone plus its own `%` beneath it. **NET** is the selected period's net in the
template's brand tone, a shade darker (`--net`), deliberately *not* green/red — the colour
signal lives on LATEST and on the `Overall` chip (`33W` green, `26L` red).

**ALL TIME** counts in the unit of the selected period: `19 DAYS` for DAY, `4 WEEKS` for WEEK,
`2 MONTHS` for MONTH. **MONTH TO DATE** is the calendar month of the as-of day, the 1st through
month end.

**The header date is the range the numbers cover**: a single day (`13 Nov 2026`), a week or
month (`9 – 15 Nov 2026`, `1 – 30 Nov 2026`), or the whole history.

Removed on request: the separate LATEST DAY row (it duplicated the hero) and the
`₹50,000 capital · net of est. charges` footer line. Only "Personal trading journal. Not
investment advice." remains.