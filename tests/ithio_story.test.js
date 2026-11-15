/* Ithio story card — pure-helper tests (no DOM, no network).
 * Run: node tests/ithio_story.test.js
 */
const assert = require('node:assert');
const Story = require('../ithio-story.js');
const IthioMath = require('../ithio.js');

const ROWS = [
  { trade_date: '2026-11-05', capital: 50000, gross_pnl: 900, charges: 90, net_pnl: 810, wins: 2, losses: 1 },
  { trade_date: '2026-11-06', capital: 50000, gross_pnl: -400, charges: 80, net_pnl: -480, wins: 0, losses: 2 },
  { trade_date: '2026-11-10', capital: 50000, gross_pnl: 520, charges: 70, net_pnl: 450, wins: 2, losses: 1 },
  { trade_date: '2026-11-12', capital: 50000, gross_pnl: 300, charges: 60, net_pnl: 240, wins: 1, losses: 0 },
  { trade_date: '2026-11-13', capital: 50000, gross_pnl: 940, charges: 92, net_pnl: 848, wins: 3, losses: 1 },
];

/* ---- formatting ------------------------------------------------------- */
assert.strictEqual(Story.signedMoney(848), '+₹848');
assert.strictEqual(Story.signedMoney(-1234), '\u2212₹1,234');
assert.strictEqual(Story.signedMoney(0), '₹0');
assert.strictEqual(Story.signedMoney(null), '₹0');
assert.strictEqual(Story.signedMoney('garbage'), '₹0');
assert.strictEqual(Story.signedPct(1.696), '+1.70%');
assert.strictEqual(Story.signedPct(-3.2), '\u22123.20%');
assert.strictEqual(Story.signedPct(0), '0.00%');
assert.strictEqual(Story.signedPct(undefined), '0.00%');
assert.strictEqual(Story.winRate(3, 1), '75%');
assert.strictEqual(Story.winRate(0, 0), '\u2014');
assert.strictEqual(Story.prettyDay('2026-11-13'), '13 Nov 2026');
assert.strictEqual(Story.prettyDay('nope'), '\u2014');
assert.strictEqual(Story.monthLabel('2026-11-13'), 'NOV 2026');

/* ---- normalize: parity with the journal's IthioMath ------------------- */
const a = Story.normalize(ROWS.slice().reverse());
const b = IthioMath.normalizeRows(ROWS.slice().reverse());
assert.strictEqual(a.length, b.length);
a.forEach((r, i) => {
  assert.strictEqual(r.trade_date, b[i].trade_date);
  assert.strictEqual(r.net_pnl, b[i].net_pnl);
  assert.strictEqual(r.capital, b[i].capital);
});
assert.strictEqual(Story.normalize([{ trade_date: '2026-11-13', gross_pnl: 100, charges: 10 }])[0].net_pnl, 90);
assert.strictEqual(Story.normalize([{ trade_date: 'oops' }, null, undefined]).length, 0);

/* ---- pickAnchor: weekend requests show the previous session ---------- */
assert.strictEqual(Story.pickAnchor(ROWS, '2026-11-12'), '2026-11-12');
assert.strictEqual(Story.pickAnchor(ROWS, '2026-11-14'), '2026-11-13'); // Saturday -> Fri close
assert.strictEqual(Story.pickAnchor(ROWS, '2026-11-08'), '2026-11-06'); // Sunday -> Fri
assert.strictEqual(Story.pickAnchor(ROWS, ''), '2026-11-13');           // default = latest
assert.strictEqual(Story.pickAnchor(ROWS, '2020-01-01'), '2026-11-05'); // before history -> earliest
assert.strictEqual(Story.pickAnchor([], '2026-11-13'), null);
assert.strictEqual(Story.pickAnchor(ROWS, 'garbage'), '2026-11-13');

/* ---- stepDay clamps at both ends ------------------------------------- */
assert.strictEqual(Story.stepDay(ROWS, '2026-11-13', -1), '2026-11-12');
assert.strictEqual(Story.stepDay(ROWS, '2026-11-05', -1), '2026-11-05');
assert.strictEqual(Story.stepDay(ROWS, '2026-11-13', 1), '2026-11-13');
assert.strictEqual(Story.stepDay(ROWS, '2026-11-06', 1), '2026-11-10');

/* ---- weekBounds: parity with the journal's isoWeekBounds ------------- */
['2026-11-13', '2026-11-09', '2026-11-08', '2026-01-01'].forEach((d) => {
  assert.deepStrictEqual(Story.weekBounds(d), IthioMath.isoWeekBounds(d), d);
});

/* ---- periodRows ------------------------------------------------------ */
assert.strictEqual(Story.periodRows(ROWS, 'day', '2026-11-13').length, 1);
assert.strictEqual(Story.periodRows(ROWS, 'month', '2026-11-13').length, 5);
assert.strictEqual(Story.periodRows(ROWS, 'week', '2026-11-13').length, 3); // Mon 9 .. Sun 15
assert.strictEqual(Story.periodRows(ROWS, 'all', '2026-11-13').length, 5);
assert.strictEqual(Story.periodRows([], 'all', '2026-11-13').length, 0);

/* ---- cumSeries: running net, windowed, anchor-bounded ---------------- */
const cs = Story.cumSeries(ROWS, '2026-11-13', 3);   // tail = 450, 240, 848
assert.deepStrictEqual(cs.values, [450, 690, 1538]);
assert.strictEqual(cs.from, '2026-11-10');
assert.strictEqual(cs.to, '2026-11-13');

const allCs = Story.cumSeries(ROWS, '2026-11-13', 99);
assert.deepStrictEqual(allCs.values, [810, 330, 780, 1020, 1868]);
assert.strictEqual(allCs.values.length, 5);

const early = Story.cumSeries(ROWS, '2026-11-10', 99);  // nothing after 11-10
assert.deepStrictEqual(early.values, [810, 330, 780]);
assert.strictEqual(early.to, '2026-11-10');

/* ---- sparkPath: geometry is safe for degenerate series --------------- */
const flat = Story.sparkPath([5, 5, 5], 100, 40, 0);
assert.strictEqual(flat.flat, true);
assert.strictEqual(flat.points.length, 3);
assert.ok(flat.points.every((p) => Math.abs(p[1] - 20) < 1e-9), 'flat series sits mid-height');
assert.strictEqual(flat.up, true);

const up = Story.sparkPath([0, 10], 100, 40, 0);
assert.strictEqual(up.up, true);
assert.ok(up.points[1][1] < up.points[0][1], 'higher value draws higher on screen');
assert.strictEqual(up.d.startsWith('M'), true);

const down = Story.sparkPath([10, 0], 100, 40, 0);
assert.strictEqual(down.up, false);

const one = Story.sparkPath([7], 100, 40, 0);
assert.strictEqual(one.points.length, 1);
assert.ok(Math.abs(one.points[0][0] - 50) < 1e-9, 'single point is centred');

const none = Story.sparkPath([], 100, 40, 0);
assert.strictEqual(none.d, '');
assert.strictEqual(none.points.length, 0);

/* ---- readOpts: sane defaults + validation --------------------------- */
const d = Story.readOpts('');
assert.deepStrictEqual(
  [d.period, d.format, d.style, d.sessions, d.clean, d.date],
  ['day', 'story', 'bloom', 20, false, '']
);
const o = Story.readOpts('?date=2026-11-13&period=month&format=square&style=neon&sessions=12&clean=1&handle=@krish');
assert.strictEqual(o.period, 'month');
assert.strictEqual(o.format, 'square');
assert.strictEqual(o.style, 'neon');
assert.strictEqual(o.sessions, 12);
assert.strictEqual(o.clean, true);
assert.strictEqual(o.handle, '@krish');
assert.strictEqual(o.date, '2026-11-13');
const bad = Story.readOpts('?period=year&format=reel&style=neon2&sessions=abc');
assert.strictEqual(bad.period, 'day');
assert.strictEqual(bad.format, 'story');
assert.strictEqual(bad.style, 'bloom');   // unknown template -> default, never a crash
assert.strictEqual(bad.sessions, 20);

/* ---- style picker: every documented template resolves --------------- */
assert.deepStrictEqual(Story.STYLES,
  ['midnight', 'paper', 'neon', 'bloom', 'broadsheet', 'minimal']);
Story.STYLES.forEach((s) => {
  assert.strictEqual(Story.pickStyle(s, ''), s);
  assert.ok(Story.STYLE_LABEL[s], `missing label for ${s}`);
});
assert.strictEqual(Story.pickStyle('NEON', ''), 'neon');       // case-insensitive
assert.strictEqual(Story.pickStyle('', 'dark'), 'midnight');   // legacy ?theme= alias
assert.strictEqual(Story.pickStyle('', 'light'), 'paper');
assert.strictEqual(Story.pickStyle('', ''), 'bloom');          // bloom is the default
assert.strictEqual(Story.pickStyle('', 'neon'), 'bloom');      // theme is not a template
assert.strictEqual(Story.DEFAULT_STYLE, 'bloom');
assert.strictEqual(Story.readOpts('?theme=dark').style, 'midnight');
assert.strictEqual(Story.readOpts('?theme=light').style, 'paper');

/* ---- toQuery: what the headless renderer will call ------------------ */
assert.strictEqual(Story.toQuery(d, null), 'period=day');
assert.strictEqual(
  Story.toQuery({ period: 'month', format: 'square', style: 'neon', sessions: 12, handle: '@krish' }, '2026-11-13'),
  'date=2026-11-13&period=month&format=square&style=neon&sessions=12&handle=%40krish'
);
// the default style is omitted from the URL, other styles are written
assert.strictEqual(Story.toQuery({ period: 'day', style: 'bloom' }, null), 'period=day');
assert.strictEqual(Story.toQuery({ period: 'day', style: 'midnight' }, null), 'period=day&style=midnight');

/* ---- chip labels ---------------------------------------------------- */
assert.deepStrictEqual(Story.PERIOD_CHIP, { day: 'DAY', week: 'WEEK', month: 'MONTH', all: 'ALL TIME' });

/* ---- analyze(): the trader metrics, hand-checked on ROWS -------------
 * nets: +810, -480, +450, +240, +848  → net 1868, gross 2260, charges 392
 */
const an = Story.analyze(ROWS, '2026-11-13');
assert.strictEqual(an.sessions, 5);
assert.strictEqual(an.net, 1868);
assert.strictEqual(an.gross, 2260);
assert.strictEqual(an.charges, 392);
assert.strictEqual(an.trades, 13);              // 3+2 + 3+1 + 4
assert.strictEqual(an.green, 4);
assert.strictEqual(an.red, 1);
assert.strictEqual(an.flat, 0);
assert.ok(Math.abs(an.greenPct - 80) < 1e-9);
assert.ok(Math.abs(an.avgDay - 373.6) < 1e-9);
assert.strictEqual(an.best, 848);
assert.strictEqual(an.bestDay, '2026-11-13');
assert.strictEqual(an.worst, -480);
assert.strictEqual(an.worstDay, '2026-11-06');
// profit factor = 2348 winning days / 480 losing days
assert.ok(Math.abs(an.pf - (2348 / 480)) < 1e-9);
assert.strictEqual(an.pfInf, false);
// R:R = avg win day 587 / avg loss day 480
assert.ok(Math.abs(an.rr - (587 / 480)) < 1e-9);
// peak 1020 -> trough 330 is the deepest drawdown: 690? no — 810 -> 330 = 480
assert.strictEqual(an.maxDD, 480);
assert.ok(Math.abs(an.maxDDpct - (480 / 50000) * 100) < 1e-9);
assert.strictEqual(an.curDD, 0);                // at a new high on the last day
assert.strictEqual(an.longestG, 3);             // 450, 240, 848
assert.strictEqual(an.longestR, 1);
assert.strictEqual(an.streak, 3);
assert.strictEqual(an.streakSign, 1);
assert.ok(Math.abs(an.expectancy - 1868 / 13) < 1e-9);
// charges are measured against gross PROFIT (900+520+300+940), not signed gross
assert.strictEqual(an.grossWin, 2660);
assert.ok(Math.abs(an.chargesPct - (392 / 2660) * 100) < 1e-9);
assert.strictEqual(an.first, '2026-11-05');
assert.strictEqual(an.last, '2026-11-13');
assert.strictEqual(an.capital, 50000);
// volatility/Sharpe: sample sd of the five day-nets, annualised by sqrt(252)
assert.ok(an.vol > 0);
assert.ok(Math.abs(an.sharpe - (an.avgDay / an.vol) * Math.sqrt(252)) < 1e-9);
// anchor-bounded: nothing after 11-12 counts
const anEarly = Story.analyze(ROWS, '2026-11-12');
assert.strictEqual(anEarly.sessions, 4);
assert.strictEqual(anEarly.net, 1020);
assert.strictEqual(anEarly.last, '2026-11-12');
// no rows at all must not throw or divide by zero
const anEmpty = Story.analyze([], null);
assert.strictEqual(anEmpty.sessions, 0);
assert.strictEqual(anEmpty.sharpe, 0);
assert.strictEqual(anEmpty.pf, 0);
assert.strictEqual(anEmpty.first, null);

/* all-green history: profit factor is infinite, not NaN */
const anAllWin = Story.analyze([
  { trade_date: '2026-11-12', net_pnl: 100, wins: 1, losses: 0 },
  { trade_date: '2026-11-13', net_pnl: 100, wins: 1, losses: 0 },
], '2026-11-13');
assert.strictEqual(anAllWin.pfInf, true);
assert.strictEqual(anAllWin.maxDD, 0);
assert.strictEqual(anAllWin.longestG, 2);
assert.strictEqual(anAllWin.rr, 0);             // no losing day to divide by

/* ---- equitySeries(): cumulative from zero, from the first session ---- */
const eq = Story.equitySeries(ROWS, '2026-11-13');
assert.deepStrictEqual(eq.values, [810, 330, 780, 1020, 1868]);
assert.strictEqual(eq.from, '2026-11-05');
assert.strictEqual(eq.to, '2026-11-13');

/* ---- stripBars(): signed, magnitude-relative, windowed --------------- */
const sb = Story.stripBars(ROWS, '2026-11-13', 20);
assert.strictEqual(sb.length, 5);
assert.strictEqual(sb[0].sign, 1);
assert.strictEqual(sb[1].sign, -1);
assert.strictEqual(sb[4].h, 1);                 // biggest |net| defines the scale
assert.ok(Math.abs(sb[1].h - 480 / 848) < 1e-9);
assert.strictEqual(Story.stripBars(ROWS, '2026-11-13', 2).length, 2);
assert.strictEqual(Story.stripBars([], null, 5).length, 0);

/* ---- detail presets / blocks ---------------------------------------- */
assert.deepStrictEqual(Story.DETAIL, ['card', 'compact', 'pro', 'analyst']);
assert.strictEqual(Story.DEFAULT_DETAIL, 'card');   // journal-card replica is the default
assert.strictEqual(Story.pickDetail('analyst'), 'analyst');
assert.strictEqual(Story.pickDetail('nope'), 'card');
// card = journal + month calendar + win-rate ring + watermark
assert.deepStrictEqual(Story.resolveBlocks({ detail: 'card' }),
  ['journal', 'calendar', 'donut', 'candles', 'rows']);
assert.deepStrictEqual(Story.resolveBlocks({}),
  ['journal', 'calendar', 'donut', 'candles', 'rows']);
// the strategy tag is no longer on the card
assert.ok(Story.resolveBlocks({ detail: 'card' }).indexOf('tag') < 0);
assert.deepStrictEqual(Story.resolveBlocks({ detail: 'compact' }),
  ['hero', 'stats', 'spark', 'rows']);
assert.deepStrictEqual(Story.resolveBlocks({ detail: 'pro' }),
  ['tag', 'hero', 'stats', 'equity', 'strip', 'risk', 'rows']);
assert.ok(Story.resolveBlocks({ detail: 'analyst' }).indexOf('streaks') >= 0);
assert.ok(Story.resolveBlocks({ detail: 'analyst' }).indexOf('cost') >= 0);
// ?blocks= wins over the preset, and unknown names are dropped
assert.deepStrictEqual(Story.resolveBlocks({ detail: 'pro', blocks: 'equity,risk' }),
  ['equity', 'risk']);
assert.deepStrictEqual(Story.resolveBlocks({ detail: 'pro', blocks: 'nope' }),
  ['tag', 'hero', 'stats', 'equity', 'strip', 'risk', 'rows']);
assert.deepStrictEqual(Story.resolveBlocks({ blocks: 'rows,equity' }), ['rows', 'equity']);
assert.deepStrictEqual(Story.resolveBlocks({ blocks: 'journal,spark' }), ['journal', 'spark']);
// every block a preset names must be a real block
Story.DETAIL.forEach((d) => {
  Story.resolveBlocks({ detail: d }).forEach((b) => {
    assert.ok(Story.BLOCKS.indexOf(b) >= 0, `preset ${d} names unknown block ${b}`);
  });
});

/* ---- detail/tag survive the URL round-trip -------------------------- */
const dopts = Story.readOpts('?detail=analyst&tag=SEE%C2%B7SAW&blocks=equity,rows');
assert.strictEqual(dopts.detail, 'analyst');
assert.strictEqual(dopts.tag, 'SEE\u00b7SAW');
assert.strictEqual(dopts.blocks, 'equity,rows');
assert.strictEqual(Story.readOpts('').tag, Story.DEFAULT_TAG);
assert.strictEqual(Story.readOpts('?tag=').tag, '');           // explicit blank hides the tag

/* ---- autoFit: never clip the footer --------------------------------- */
// least-important first, and the headline (hero/journal/rows) is never dropped
assert.deepStrictEqual(Story.DROP_ORDER.slice(0, 4), ['cost', 'streaks', 'risk2', 'spark']);
assert.ok(Story.DROP_ORDER.indexOf('rows') < 0, 'rows must never be dropped');
assert.ok(Story.DROP_ORDER.indexOf('journal') < 0, 'the journal replica must never be dropped');

/* ---- compounding capital + period accounting ------------------------ */
// ₹1,00,000 base; capital shown is live equity = base + cumulative net
const pDay = Story.periodStats(ROWS, 'day', '2026-11-13', 100000);
assert.strictEqual(pDay.net, 848);
// the day started from 100000 + (810-480+450+240) = 101020
assert.strictEqual(pDay.startEquity, 101020);
assert.strictEqual(pDay.equity, 101868);
assert.ok(Math.abs(pDay.pct - 0.84) < 1e-9, String(pDay.pct));   // rounded to 2dp
assert.strictEqual(pDay.days, 1);
assert.strictEqual(pDay.start, '2026-11-13');
assert.strictEqual(pDay.latestNet, 848);
assert.ok(Math.abs(pDay.latestPct - 0.84) < 1e-9, String(pDay.latestPct));

const pMonth = Story.periodStats(ROWS, 'month', '2026-11-13', 100000);
assert.strictEqual(pMonth.net, 1868);
assert.strictEqual(pMonth.start, '2026-11-01');       // 1st of the month
assert.strictEqual(pMonth.end, '2026-11-30');         // through month end
assert.strictEqual(pMonth.startEquity, 100000);
assert.strictEqual(pMonth.equity, 101868);
assert.strictEqual(pMonth.days, 5);

const pWeek = Story.periodStats(ROWS, 'week', '2026-11-13', 100000);
assert.strictEqual(pWeek.net, 1538);                  // 11-10, 11-12, 11-13
assert.strictEqual(pWeek.start, '2026-11-09');        // Monday
assert.strictEqual(pWeek.startEquity, 100330);        // 100000 + 810 - 480
assert.strictEqual(pWeek.days, 3);

const pAll = Story.periodStats(ROWS, 'all', '2026-11-13', 100000);
assert.strictEqual(pAll.net, 1868);
assert.strictEqual(pAll.start, '2026-11-05');
assert.strictEqual(pAll.end, '2026-11-13');

// an explicit capital override changes the percentages, not the rupees
const pAlt = Story.periodStats(ROWS, 'day', '2026-11-13', 200000);
assert.strictEqual(pAlt.net, 848);
assert.ok(Math.abs(pAlt.pct - 0.42) < 1e-9, String(pAlt.pct));   // 848/201020 = 0.42%

// empty history must not divide by zero
const pEmpty = Story.periodStats([], 'day', '2026-11-13', 100000);
assert.strictEqual(pEmpty.net, 0);
assert.strictEqual(pEmpty.pct, 0);
assert.strictEqual(pEmpty.equity, 100000);
assert.strictEqual(pEmpty.latestDay, null);

/* ---- ALL TIME counts in the selected period's unit ------------------- */
assert.deepStrictEqual(Story.allTimeCount(ROWS, 'day', '2026-11-13'), { n: 5, unit: 'DAYS' });
assert.deepStrictEqual(Story.allTimeCount(ROWS, 'week', '2026-11-13'), { n: 2, unit: 'WEEKS' });
assert.deepStrictEqual(Story.allTimeCount(ROWS, 'month', '2026-11-13'), { n: 1, unit: 'MONTH' });
assert.deepStrictEqual(Story.allTimeCount(ROWS, 'all', '2026-11-13'), { n: 5, unit: 'DAYS' });
assert.deepStrictEqual(Story.allTimeCount([], 'day', null), { n: 0, unit: 'DAYS' });

/* ---- header date is a range when the period spans days --------------- */
assert.strictEqual(Story.prettyRange('2026-11-13', '2026-11-13'), '13 Nov 2026');
assert.strictEqual(Story.prettyRange('2026-11-09', '2026-11-15'), '9 \u2013 15 Nov 2026');
assert.strictEqual(Story.prettyRange('2026-10-28', '2026-11-03'), '28 Oct \u2013 3 Nov 2026');
assert.strictEqual(Story.prettyRange('2025-12-31', '2026-01-02'), '31 Dec 2025 \u2013 2 Jan 2026');
assert.strictEqual(Story.prettyRange(null, '2026-11-13'), '13 Nov 2026');

/* ---- month bounds ---------------------------------------------------- */
assert.deepStrictEqual(Story.monthBounds('2026-11-13'), ['2026-11-01', '2026-11-30']);
assert.deepStrictEqual(Story.monthBounds('2026-02-10'), ['2026-02-01', '2026-02-28']);
assert.deepStrictEqual(Story.monthBounds('2024-02-10'), ['2024-02-01', '2024-02-29']);

/* ---- month picker: any month as its own block ------------------------ */
const mNov = Story.monthStats(ROWS, '2026-11', 100000);
assert.strictEqual(mNov.net, 1868);
assert.strictEqual(mNov.days, 5);
assert.strictEqual(mNov.startEquity, 100000);
assert.ok(Math.abs(mNov.pct - 1.87) < 1e-9, String(mNov.pct));
assert.strictEqual(mNov.start, '2026-11-05');
assert.strictEqual(mNov.end, '2026-11-13');

// an older month is measured from the equity it opened with
const ROWS2 = ROWS.concat([
  { trade_date: '2026-12-02', capital: 50000, gross_pnl: 500, charges: 50, net_pnl: 450, wins: 2, losses: 0 },
]);
const mDec = Story.monthStats(ROWS2, '2026-12', 100000);
assert.strictEqual(mDec.net, 450);
assert.strictEqual(mDec.startEquity, 101868);        // after November's +1868
assert.ok(Math.abs(mDec.pct - 0.44) < 1e-9, String(mDec.pct));

// a month with no rows is empty, not a crash and not zero-divided
const mOct = Story.monthStats(ROWS2, '2026-10', 100000);
assert.strictEqual(mOct.days, 0);
assert.strictEqual(mOct.net, 0);
assert.strictEqual(mOct.pct, 0);
assert.strictEqual(mOct.start, null);

/* picker options: months with data, newest first */
assert.deepStrictEqual(Story.monthList(ROWS2), ['2026-12', '2026-11']);
assert.deepStrictEqual(Story.monthList(ROWS), ['2026-11']);
assert.deepStrictEqual(Story.monthList([]), []);

assert.strictEqual(Story.prettyMonth('2026-11'), 'Nov 2026');
assert.strictEqual(Story.prettyMonth('2026-01'), 'Jan 2026');
assert.strictEqual(Story.prettyMonth('nope'), '\u2014');
assert.strictEqual(Story.prettyMonth('2026-13'), '\u2014');

/* ?month= round-trips and rejects junk */
assert.strictEqual(Story.readOpts('?month=2026-10').month, '2026-10');
assert.strictEqual(Story.readOpts('?month=october').month, '');
assert.strictEqual(Story.readOpts('').month, '');
assert.ok(Story.toQuery({ period: 'day', month: '2026-10' }, null).includes('month=2026-10'));

/* ---- calendar heatmap + month travel --------------------------------- */
const grid = Story.monthGrid(ROWS, '2026-11');
assert.strictEqual(grid.weeks, 6);                    // Mon 26 Oct .. Mon 30 Nov
assert.strictEqual(grid.cells.length, 36);
assert.strictEqual(grid.cells[0].date, '2026-10-26'); // Monday before the 1st
assert.strictEqual(grid.cells[0].inMonth, false);
assert.strictEqual(grid.days, 5);
assert.strictEqual(grid.green, 4);
assert.strictEqual(grid.red, 1);
assert.strictEqual(grid.net, 1868);
assert.strictEqual(grid.label, 'NOV 2026');

const nov5 = grid.cells.filter((c) => c.date === '2026-11-05')[0];
assert.strictEqual(nov5.net, 810);
assert.strictEqual(nov5.sign, 1);
assert.strictEqual(nov5.inMonth, true);
const nov6 = grid.cells.filter((c) => c.date === '2026-11-06')[0];
assert.strictEqual(nov6.sign, -1);
// days with no row are inside the month but carry no net
const nov7 = grid.cells.filter((c) => c.date === '2026-11-07')[0];
assert.strictEqual(nov7.inMonth, true);
assert.strictEqual(nov7.net, null);
assert.strictEqual(nov7.sign, 0);

const emptyMonth = Story.monthGrid(ROWS, '2026-09');
assert.strictEqual(emptyMonth.days, 0);
assert.strictEqual(emptyMonth.net, 0);
assert.strictEqual(emptyMonth.label, 'SEP 2026');
assert.strictEqual(Story.monthGrid(ROWS, 'junk').cells.length, 0);

/* picking a month travels to that month's last session */
assert.strictEqual(Story.lastDayInMonth(ROWS, '2026-11'), '2026-11-13');
assert.strictEqual(Story.lastDayInMonth(ROWS, '2026-10'), null);
assert.strictEqual(Story.lastDayInMonth(ROWS, 'junk'), null);

/* ---- ALL TIME must ignore the month pick ----------------------------- */
// lastRowDate is the fixed end of "all time"
assert.strictEqual(Story.lastRowDate(ROWS), '2026-11-13');
assert.strictEqual(Story.lastRowDate([]), null);
const allA = Story.periodStats(ROWS, 'all', Story.lastRowDate(ROWS), 100000);
const allB = Story.periodStats(ROWS, 'all', Story.lastRowDate(ROWS), 100000);
assert.strictEqual(allA.net, allB.net);              // month selection can't move it
assert.strictEqual(allA.net, 1868);
// ... while the month block does follow the pick
assert.strictEqual(Story.monthStats(ROWS, '2026-11', 100000).net, 1868);
assert.strictEqual(Story.monthStats(ROWS.concat([
  { trade_date: '2026-10-05', net_pnl: 500, wins: 1, losses: 0 },
]), '2026-10', 100000).net, 500);

/* ---- equity candles: OHLC from the equity path ----------------------- */
const cdDay = Story.candleSeries(ROWS, 'day', '2026-11-13', 100000, 30);
assert.strictEqual(cdDay.axis, 'day');
assert.strictEqual(cdDay.candles.length, 5);
assert.strictEqual(cdDay.start, 100000);
// first day: 100000 -> 100810, so it is a pure up body with no wick
assert.deepStrictEqual(
  [cdDay.candles[0].open, cdDay.candles[0].close, cdDay.candles[0].high, cdDay.candles[0].low],
  [100000, 100810, 100810, 100000]);
// second day loses 480
assert.strictEqual(cdDay.candles[1].open, 100810);
assert.strictEqual(cdDay.candles[1].close, 100330);
assert.strictEqual(cdDay.candles[1].low, 100330);
// the last candle ends at the live equity
assert.strictEqual(cdDay.candles[4].close, 101868);
assert.strictEqual(cdDay.candles[4].label, '13');
assert.strictEqual(cdDay.min, 100000);
assert.strictEqual(cdDay.max, 101868);

// weekly candles: wicks come from the daily closes inside the bucket
const cdWeek = Story.candleSeries(ROWS, 'week', '2026-11-13', 100000, 30);
assert.strictEqual(cdWeek.axis, 'week');
assert.strictEqual(cdWeek.candles.length, 2);          // w/c 3 Nov and w/c 9 Nov
assert.strictEqual(cdWeek.candles[0].open, 100000);
assert.strictEqual(cdWeek.candles[0].close, 100330);   // +810 −480
assert.strictEqual(cdWeek.candles[0].high, 100810);    // intra-week peak on a close
assert.strictEqual(cdWeek.candles[0].low, 100000);     // the week opened at the low
assert.strictEqual(cdWeek.candles[1].close, 101868);
assert.strictEqual(cdWeek.candles[1].low, 100330);     // never went below the week open
assert.ok(/^W\d+$/.test(cdWeek.candles[1].label), cdWeek.candles[1].label);

// monthly candles
const cdMonth = Story.candleSeries(ROWS, 'month', '2026-11-13', 100000, 30);
assert.strictEqual(cdMonth.axis, 'month');
assert.strictEqual(cdMonth.candles.length, 1);
assert.strictEqual(cdMonth.candles[0].label, 'Nov');
assert.strictEqual(cdMonth.candles[0].close, 101868);

// limit keeps the most recent candles
assert.strictEqual(Story.candleSeries(ROWS, 'day', '2026-11-13', 100000, 2).candles.length, 2);
// empty history is safe and still shows the ₹1L line
const cdEmpty = Story.candleSeries([], 'day', null, 100000, 20);
assert.strictEqual(cdEmpty.candles.length, 0);
assert.strictEqual(cdEmpty.min, 100000);
assert.strictEqual(cdEmpty.max, 100000);
// axis labels
assert.strictEqual(Story.lakhLabel(101868), '1.02L');
assert.strictEqual(Story.lakhLabel(100000), '1.00L');
assert.ok(/^W\d+$/.test(Story.isoWeek('2026-11-13')));

/* ---- demo candles are only a density preview ------------------------- */
const demo40 = Story.demoCandles(40, 100000);
assert.strictEqual(demo40.candles.length, 40);
assert.strictEqual(demo40.axis, 'demo');
demo40.candles.forEach((c) => {
  assert.ok(c.high >= Math.max(c.open, c.close), 'high >= body top');
  assert.ok(c.low <= Math.min(c.open, c.close), 'low <= body bottom');
});
// deterministic: same seed, so a shorter run is a strict prefix of a longer one
assert.deepStrictEqual(Story.demoCandles(40, 100000).candles[10], demo40.candles[10]);
assert.deepStrictEqual(Story.demoCandles(30, 100000).candles[10], demo40.candles[10]);
assert.notStrictEqual(Story.demoCandles(30, 100000).candles.length,
  Story.demoCandles(40, 100000).candles.length);
assert.strictEqual(Story.demoCandles(0, 100000).candles.length, 1);   // clamped
assert.strictEqual(Story.demoCandles(9999, 100000).candles.length, 400);
assert.strictEqual(Story.CANDLE_MAX, 30);

/* ---- badge colour combos are opt-in, default keeps the violet chip ---- */
assert.deepStrictEqual(Story.BADGES, ['violet', 'inkred', 'mono', 'paperred', 'dot']);
assert.strictEqual(Story.DEFAULT_BADGE, 'dot');
assert.strictEqual(Story.pickBadge('INKRED'), 'inkred');
assert.strictEqual(Story.pickBadge('paperred'), 'paperred');
assert.strictEqual(Story.pickBadge('neon'), 'dot');         // unknown -> default
assert.strictEqual(Story.pickBadge(''), 'dot');
assert.strictEqual(Story.readOpts('').badge, 'dot');
assert.strictEqual(Story.readOpts('?badge=mono').badge, 'mono');
assert.ok(Story.toQuery({ period: 'day', badge: 'inkred' }, null).includes('badge=inkred'));
assert.ok(!Story.toQuery({ period: 'day', badge: 'dot' }, null).includes('badge='));

console.log('ithio story: all tests passed');
