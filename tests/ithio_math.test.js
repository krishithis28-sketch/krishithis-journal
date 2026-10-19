/* Node tests for the Ithio card period math (no browser / no Supabase). */
const assert = require('node:assert');
const { computeSummary, isoWeekBounds } = require('../ithio.js');

const ROWS = [
  { trade_date: '2026-11-01', capital: 50000, gross_pnl: 35, charges: 10, net_pnl: 25, trades: 1, wins: 1, losses: 0, rejects: 0 },
  { trade_date: '2026-09-30', capital: 50000, gross_pnl: 110, charges: 10, net_pnl: 100, trades: 1, wins: 1, losses: 0, rejects: 0 },
  { trade_date: '2026-10-20', capital: 50000, gross_pnl: -90, charges: 10, net_pnl: -100, trades: 1, wins: 0, losses: 1, rejects: 2 },
  { trade_date: '2026-10-19', capital: 50000, gross_pnl: 260, charges: 10, net_pnl: 250, trades: 2, wins: 2, losses: 0, rejects: 0 },
  { trade_date: '2026-10-26', capital: 50000, gross_pnl: 85, charges: 10, net_pnl: 75, trades: 1, wins: 1, losses: 0, rejects: 0 },
  { trade_date: '2026-10-18', capital: 50000, gross_pnl: -40, charges: 10, net_pnl: -50, trades: 1, wins: 0, losses: 1, rejects: 1 },
  { trade_date: '2026-10-25', capital: 50000, gross_pnl: 60, charges: 10, net_pnl: 50, trades: 1, wins: 1, losses: 0, rejects: 0 },
];

// --- day / week / month / all (anchor = latest row, 2026-11-01) -------------
let s = computeSummary(ROWS, 'day');
assert.strictEqual(s.asOf, '2026-11-01');
assert.strictEqual(s.days, 1);
assert.strictEqual(s.net, 25);
assert.strictEqual(s.capital, 50000);
assert.strictEqual(s.returnPct, 0.05);

s = computeSummary(ROWS, 'week');
assert.deepStrictEqual(isoWeekBounds('2026-11-01'), ['2026-10-26', '2026-11-01']);
assert.strictEqual(s.start, '2026-10-26');
assert.strictEqual(s.end, '2026-11-01');
assert.strictEqual(s.days, 2);
assert.strictEqual(s.net, 100);              // 75 + 25

s = computeSummary(ROWS, 'month');
assert.strictEqual(s.start, '2026-11-01');
assert.strictEqual(s.days, 1);
assert.strictEqual(s.net, 25);

s = computeSummary(ROWS, 'all');
assert.strictEqual(s.days, 7);
assert.strictEqual(s.net, 350);              // 100-50+250-100+50+75+25
assert.strictEqual(s.wins, 6);
assert.strictEqual(s.losses, 2);
assert.strictEqual(s.overall.wins, 6);
assert.strictEqual(s.overall.losses, 2);
assert.strictEqual(s.returnPct, 0.7);

// --- explicit anchor: 2026-10-19 ------------------------------------------
s = computeSummary(ROWS, 'day', '2026-10-19');
assert.strictEqual(s.net, 250);
assert.strictEqual(s.latest.net, 250);

s = computeSummary(ROWS, 'week', '2026-10-19');
assert.strictEqual(s.start, '2026-10-19');
assert.strictEqual(s.end, '2026-10-25');
assert.strictEqual(s.net, 200);              // 250 - 100 + 50

s = computeSummary(ROWS, 'month', '2026-10-19');
assert.strictEqual(s.start, '2026-10-01');
assert.strictEqual(s.days, 5);               // 18, 19, 20, 25, 26
assert.strictEqual(s.net, 225);              // -50 + 250 - 100 + 50 + 75

// --- net fallback + numeric strings + sorting ------------------------------
s = computeSummary([
  { trade_date: '2026-10-21', gross_pnl: '100.50', charges: '0.50', trades: '2', wins: '1', losses: '1' },
  { trade_date: '2026-10-20', gross_pnl: 10, charges: 2, net_pnl: 8, trades: 1, wins: 1, losses: 0 },
], 'all');
assert.strictEqual(s.net, 108);              // (100.5-0.5) + 8
assert.strictEqual(s.asOf, '2026-10-21');
assert.strictEqual(s.days, 2);

// --- latest capital wins ---------------------------------------------------
s = computeSummary([
  { trade_date: '2026-10-19', capital: 50000, net_pnl: 100, trades: 1, wins: 1, losses: 0 },
  { trade_date: '2026-10-20', capital: 60000, net_pnl: 100, trades: 1, wins: 1, losses: 0 },
], 'all');
assert.strictEqual(s.capital, 60000);
assert.ok(Math.abs(s.returnPct - 0.3333) < 0.0001); // 200/60000*100

// --- empty / invalid -------------------------------------------------------
s = computeSummary([], 'day');
assert.strictEqual(s.asOf, null);
assert.strictEqual(s.net, 0);
assert.strictEqual(s.returnPct, 0);
assert.strictEqual(s.capital, 50000);
assert.strictEqual(s.days, 0);
assert.strictEqual(s.overall.wins, 0);

s = computeSummary([{ trade_date: 'not-a-date', net_pnl: 999 }], 'all');
assert.strictEqual(s.net, 0);
assert.strictEqual(s.asOf, null);

console.log('ithio math: all tests passed');
