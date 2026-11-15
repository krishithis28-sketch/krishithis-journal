/* Ithio story card — one-screenshot performance card (1080x1920 story / 1080x1080 square).
 *
 * Lives beside index.html and never touches it: index.html is the journal, this
 * page is the shareable card. Numbers come from the same Supabase rows and the
 * same IthioMath.computeSummary() as the journal card, so the two cannot disagree.
 *
 * URL parameters (everything a daily renderer/screenshot needs):
 *   ?date=2026-11-13      as-of day; falls back to the last trading day <= it
 *   ?period=day|week|month|all
 *   ?format=story|square  1080x1920 (default) or 1080x1080
 *   ?style=midnight|paper|neon|bloom|broadsheet|minimal   card template
 *   ?sessions=20          sparkline window, in sessions
 *   ?clean=1              hide the control bar (screenshot / headless mode)
 *   ?handle=@krish        optional handle line in the footer
 *
 * The page sets <body data-ready="1"> after the first successful render, so a
 * headless screenshot can wait on it deterministically.
 *
 * Pure helpers are unit-tested in Node (tests/ithio_story.test.js); init() only
 * runs when a DOM exists.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.IthioStory = api;
    if (root.document) {
      if (root.document.readyState === "loading") {
        root.document.addEventListener("DOMContentLoaded", function () { api.init(); });
      } else {
        api.init();
      }
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_CAPITAL = 50000;
  var DEFAULT_START_CAPITAL = 100000;   // the card's own starting capital (₹1,00,000)
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var INR0 = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  });

  function num(v, fallback) {
    if (v === null || v === undefined || v === "") return fallback;
    var n = Number(v);
    return isFinite(n) ? n : fallback;
  }

  function round2(v) {
    return Math.round((num(v, 0) + Number.EPSILON) * 100) / 100;
  }

  function isDay(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").slice(0, 10));
  }

  /* ---- formatting ------------------------------------------------------ */

  function money(v) {
    return INR0.format(Math.round(num(v, 0)));
  }

  // '+₹848' / '−₹1,234' / '₹0'  (U+2212 minus, same glyph as the journal card)
  function signedMoney(v) {
    var n = Math.round(num(v, 0));
    if (n === 0) return money(0);
    return (n > 0 ? "+" : "\u2212") + money(Math.abs(n));
  }

  function signedPct(v) {
    var n = num(v, 0);
    if (Math.abs(n) < 0.005) return "0.00%";
    return (n > 0 ? "+" : "\u2212") + Math.abs(n).toFixed(2) + "%";
  }

  function winRate(wins, losses) {
    var w = num(wins, 0), l = num(losses, 0), t = w + l;
    if (!(t > 0)) return "\u2014";
    return Math.round((w / t) * 100) + "%";
  }

  function prettyDay(day) {
    var s = String(day || "").slice(0, 10);
    if (!isDay(s)) return "\u2014";
    var d = new Date(s + "T00:00:00Z");
    if (isNaN(d.getTime())) return "\u2014";
    return d.getUTCDate() + " " + MON[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  function monthLabel(day) {
    var s = String(day || "").slice(0, 10);
    if (!isDay(s)) return "\u2014";
    var d = new Date(s + "T00:00:00Z");
    if (isNaN(d.getTime())) return "\u2014";
    return MON[d.getUTCMonth()].toUpperCase() + " " + d.getUTCFullYear();
  }

  /* ---- row helpers (parity with IthioMath.normalizeRows) ---------------- */

  function normalize(rows) {
    var out = [], src = rows || [];
    for (var i = 0; i < src.length; i++) {
      var x = src[i] || {};
      var day = String(x.trade_date || "").slice(0, 10);
      if (!isDay(day)) continue;
      var gross = num(x.gross_pnl, 0);
      var charges = num(x.charges, 0);
      var net = (x.net_pnl === null || x.net_pnl === undefined || x.net_pnl === "")
        ? gross - charges
        : num(x.net_pnl, gross - charges);
      out.push({
        trade_date: day,
        capital: num(x.capital, DEFAULT_CAPITAL),
        gross_pnl: gross,
        charges: charges,
        net_pnl: net,
        wins: num(x.wins, 0),
        losses: num(x.losses, 0)
      });
    }
    out.sort(function (a, b) {
      return a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : 0;
    });
    return out;
  }

  function tradingDays(rows) {
    var all = normalize(rows), seen = {}, out = [];
    for (var i = 0; i < all.length; i++) {
      if (!seen[all[i].trade_date]) { seen[all[i].trade_date] = 1; out.push(all[i].trade_date); }
    }
    return out;
  }

  /* As-of day: an exact match wins; otherwise the last day <= wanted (so asking
   * for a weekend/holiday shows the previous session, not today); otherwise the
   * earliest day we have. Keeps backfilling old posts honest. */
  function pickAnchor(rows, wanted) {
    var days = tradingDays(rows);
    if (!days.length) return null;
    if (!isDay(wanted)) return days[days.length - 1];
    var w = String(wanted).slice(0, 10);
    for (var i = 0; i < days.length; i++) if (days[i] === w) return w;
    var best = null;
    for (var j = 0; j < days.length; j++) if (days[j] <= w) best = days[j];
    return best || days[0];
  }

  function stepDay(rows, anchor, dir) {
    var days = tradingDays(rows);
    if (!days.length) return null;
    var cur = pickAnchor(rows, anchor);
    var i = days.indexOf(cur);
    if (i < 0) return days[days.length - 1];
    var n = i + (dir > 0 ? 1 : -1);
    if (n < 0) n = 0;
    if (n > days.length - 1) n = days.length - 1;
    return days[n];
  }

  function weekBounds(day) {
    var d = new Date(String(day).slice(0, 10) + "T00:00:00Z");
    var diff = (d.getUTCDay() + 6) % 7;            // days since Monday
    var start = new Date(d.getTime());
    start.setUTCDate(d.getUTCDate() - diff);
    var end = new Date(start.getTime());
    end.setUTCDate(start.getUTCDate() + 6);
    var f = function (x) { return x.toISOString().slice(0, 10); };
    return [f(start), f(end)];
  }

  function periodRows(rows, period, anchor) {
    var all = normalize(rows);
    if (!all.length) return [];
    var a = String(anchor || "").slice(0, 10);
    if (period === "all") return all;
    if (period === "month") {
      var mk = a.slice(0, 7);
      return all.filter(function (r) { return r.trade_date.slice(0, 7) === mk; });
    }
    if (period === "week") {
      var b = weekBounds(a);
      return all.filter(function (r) { return r.trade_date >= b[0] && r.trade_date <= b[1]; });
    }
    return all.filter(function (r) { return r.trade_date === a; });
  }

  /* ---- sparkline ------------------------------------------------------- */

  // Cumulative net of the last `sessions` rows ending at `anchor`.
  function cumSeries(rows, anchor, sessions) {
    var all = normalize(rows).filter(function (r) { return !anchor || r.trade_date <= anchor; });
    var want = num(sessions, 20);
    var n = want > 0 ? Math.floor(want) : 20;
    var tail = all.slice(Math.max(0, all.length - n));
    var run = 0;
    var values = tail.map(function (r) { run += r.net_pnl; return round2(run); });
    return {
      values: values,
      from: tail.length ? tail[0].trade_date : null,
      to: tail.length ? tail[tail.length - 1].trade_date : null
    };
  }

  function sparkPath(values, w, h, pad) {
    var v = (values || []).map(function (x) { return num(x, 0); });
    w = num(w, 100); h = num(h, 30); pad = num(pad, 0);
    if (!v.length) return { d: "", points: [], flat: true, up: true, min: 0, max: 0 };
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v);
    var flat = min === max;
    var span = flat ? 1 : max - min;
    var innerW = Math.max(0, w - 2 * pad), innerH = Math.max(0, h - 2 * pad);
    var n = v.length;
    var x = function (i) { return pad + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1)); };
    var y = function (val) {
      return flat ? pad + innerH / 2 : pad + innerH - ((val - min) / span) * innerH;
    };
    var points = v.map(function (val, i) { return [x(i), y(val)]; });
    var d = points.map(function (p, i) {
      return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
    }).join(" ");
    return { d: d, points: points, flat: flat, up: v[n - 1] >= v[0], min: min, max: max };
  }

  /* ---- period accounting on a COMPOUNDING ₹1L base ---------------------
   * CAPITAL shown on the card is the live equity: start capital plus the
   * cumulative net up to the anchor day, so it moves every session.
   * A period's % return divides by the equity the period STARTED with, which
   * is why it isn't just net ÷ today's capital. */
  function sumNet(list) {
    var t = 0;
    for (var i = 0; i < list.length; i++) t += num(list[i].net_pnl, 0);
    return t;
  }

  function sumField(list, key) {
    var t = 0;
    for (var i = 0; i < list.length; i++) t += num(list[i][key], 0);
    return t;
  }

  function monthBounds(day) {
    var s = String(day || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(s)) return [null, null];
    var first = s + "-01";
    var d = new Date(first + "T00:00:00Z");
    var end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return [first, end.toISOString().slice(0, 10)];
  }

  function periodBounds(rows, period, anchor) {
    var all = rows || [];
    var a = String(anchor || "").slice(0, 10);
    if (period === "all") return all.length ? [all[0].trade_date, a] : [a, a];
    if (period === "week") return weekBounds(a);
    if (period === "month") return monthBounds(a);
    return [a, a];
  }

  function periodStats(rows, period, anchor, startCapital) {
    var cap = num(startCapital, DEFAULT_START_CAPITAL);
    if (!(cap > 0)) cap = DEFAULT_START_CAPITAL;
    var all = normalize(rows);
    var a = String(anchor || (all.length ? all[all.length - 1].trade_date : "")).slice(0, 10);
    var upTo = all.filter(function (r) { return !a || r.trade_date <= a; });
    var out = {
      startCapital: cap, startEquity: cap, equity: cap,
      net: 0, pct: 0, start: null, end: null, days: 0,
      wins: 0, losses: 0, latestNet: 0, latestPct: 0, latestDay: null
    };
    if (!upTo.length) return out;

    var b = periodBounds(upTo, period, a);
    var inP = upTo.filter(function (r) { return r.trade_date >= b[0] && r.trade_date <= b[1]; });
    var before = upTo.filter(function (r) { return r.trade_date < b[0]; });
    var startEquity = cap + sumNet(before);
    var net = sumNet(inP);
    var seen = {};

    out.start = b[0];
    out.end = b[1];
    out.startEquity = round2(startEquity);
    out.equity = round2(startEquity + net);
    out.net = round2(net);
    out.pct = startEquity > 0 ? round2((net / startEquity) * 100) : 0;
    out.wins = sumField(inP, "wins");
    out.losses = sumField(inP, "losses");
    for (var i = 0; i < inP.length; i++) seen[inP[i].trade_date] = 1;
    out.days = Object.keys(seen).length;

    // LATEST is always the anchor session, whatever the selected period
    var last = upTo[upTo.length - 1];
    var prev = cap + sumNet(upTo.filter(function (r) { return r.trade_date < last.trade_date; }));
    out.latestDay = last.trade_date;
    out.latestNet = round2(last.net_pnl);
    out.latestPct = prev > 0 ? round2((last.net_pnl / prev) * 100) : 0;
    return out;
  }

  /* ALL TIME counts in the unit of the selected period (days / weeks / months). */
  function allTimeCount(rows, period, anchor) {
    var all = normalize(rows).filter(function (r) { return !anchor || r.trade_date <= anchor; });
    var seen = {}, unit = "DAYS";
    if (period === "week") unit = "WEEKS";
    else if (period === "month") unit = "MONTHS";
    for (var i = 0; i < all.length; i++) {
      var k = all[i].trade_date;
      if (period === "week") k = weekBounds(k)[0];
      else if (period === "month") k = k.slice(0, 7);
      seen[k] = 1;
    }
    var n = Object.keys(seen).length;
    if (n === 1) unit = unit.slice(0, -1);
    return { n: n, unit: unit };
  }

  /* ANY month as a self-contained block, independent of the as-of day. */
  function monthStats(rows, monthKey, startCapital) {
    var cap = num(startCapital, DEFAULT_START_CAPITAL);
    if (!(cap > 0)) cap = DEFAULT_START_CAPITAL;
    var key = String(monthKey || "").slice(0, 7);
    var all = normalize(rows);
    var inM = all.filter(function (r) { return r.trade_date.slice(0, 7) === key; });
    var out = {
      month: key, net: 0, pct: 0, wins: 0, losses: 0, days: 0,
      startEquity: cap, equity: cap, start: null, end: null
    };
    if (!inM.length) return out;
    var before = all.filter(function (r) { return r.trade_date < inM[0].trade_date; });
    var startEquity = cap + sumNet(before);
    var net = sumNet(inM);
    var seen = {};
    out.startEquity = round2(startEquity);
    out.equity = round2(startEquity + net);
    out.net = round2(net);
    out.pct = startEquity > 0 ? round2((net / startEquity) * 100) : 0;
    out.wins = sumField(inM, "wins");
    out.losses = sumField(inM, "losses");
    out.start = inM[0].trade_date;
    out.end = inM[inM.length - 1].trade_date;
    for (var i = 0; i < inM.length; i++) seen[inM[i].trade_date] = 1;
    out.days = Object.keys(seen).length;
    return out;
  }

  /* Candles of the BOOK's equity, not of an option's price.
   *
   * We store one net per day, so a candle is built from the equity path:
   *   open  = equity before the first session in the bucket
   *   close = equity after the last session in the bucket
   *   high  = best equity reached on any close inside the bucket
   *   low   = worst equity reached on any close inside the bucket
   * A daily candle therefore has no wick (high = max(open,close)); a weekly or
   * monthly candle gets real wicks from the daily closes inside it. */
  function candleSeries(rows, period, anchor, startCapital, limit) {
    var cap = num(startCapital, DEFAULT_START_CAPITAL);
    if (!(cap > 0)) cap = DEFAULT_START_CAPITAL;
    var all = normalize(rows).filter(function (r) { return !anchor || r.trade_date <= anchor; });
    var out = { axis: "day", start: cap, candles: [], min: cap, max: cap };
    if (!all.length) return out;

    var mode = period === "week" ? "week" : (period === "month" ? "month" : "day");
    if (period === "all" && all.length > 40) mode = "week";
    out.axis = mode;

    var groups = [], index = {};
    for (var i = 0; i < all.length; i++) {
      var d = all[i].trade_date;
      var key = d;
      if (mode === "week") key = weekBounds(d)[0];
      else if (mode === "month") key = d.slice(0, 7);
      if (index[key] === undefined) { index[key] = groups.length; groups.push({ key: key, rows: [] }); }
      groups[index[key]].rows.push(all[i]);
    }

    var eq = cap, candles = [];
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      var open = eq, hi = eq, lo = eq;
      for (var r = 0; r < grp.rows.length; r++) {
        eq += num(grp.rows[r].net_pnl, 0);
        if (eq > hi) hi = eq;
        if (eq < lo) lo = eq;
      }
      candles.push({
        key: grp.key,
        open: round2(open),
        close: round2(eq),
        high: round2(Math.max(open, hi)),
        low: round2(Math.min(open, lo)),
        net: round2(eq - open),
        days: grp.rows.length,
        label: candleLabel(grp.key, mode)
      });
    }

    var maxN = num(limit, 0) > 0 ? Math.floor(num(limit, 0)) : (mode === "day" ? 22 : 14);
    out.candles = candles.slice(Math.max(0, candles.length - maxN));
    var mn = cap, mx = cap;
    for (var k = 0; k < out.candles.length; k++) {
      if (out.candles[k].low < mn) mn = out.candles[k].low;
      if (out.candles[k].high > mx) mx = out.candles[k].high;
    }
    out.min = round2(mn);
    out.max = round2(mx);
    return out;
  }

  /* ISO week number, for the x-axis label. */
  function isoWeek(day) {
    var d = new Date(String(day).slice(0, 10) + "T00:00:00Z");
    if (isNaN(d.getTime())) return "";
    var dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow + 3);          // Thursday of this week
    var jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    var jdow = (jan4.getUTCDay() + 6) % 7;
    jan4.setUTCDate(jan4.getUTCDate() - jdow + 3);
    return "W" + (1 + Math.round((d - jan4) / (7 * 86400000)));
  }

  function candleLabel(key, mode) {
    if (mode === "month") {
      var m = Number(String(key).slice(5, 7));
      return (m >= 1 && m <= 12) ? MON[m - 1] : "";
    }
    if (mode === "week") return isoWeek(key);
    return String(Number(String(key).slice(8, 10)));
  }

  /* ₹ in lakhs, for the y axis of the equity candles. */
  function lakhLabel(v) {
    var n = num(v, 0);
    return (n / 100000).toFixed(2) + "L";
  }

  var CANDLE_MAX = 30;   // never draw more bars than this in the chart box

  /* Synthetic candles for eyeballing density only (`?demo=40`). Deterministic,
   * so the same count always looks the same. NEVER used without ?demo=. */
  function demoCandles(n, startCapital) {
    var cap = num(startCapital, DEFAULT_START_CAPITAL);
    if (!(cap > 0)) cap = DEFAULT_START_CAPITAL;
    var count = Math.max(1, Math.min(400, Math.floor(num(n, 30))));
    var seed = 1337;
    var rnd = function () {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    var out = { axis: "demo", start: cap, candles: [], min: cap, max: cap };
    var eq = cap, mn = cap, mx = cap;
    for (var i = 0; i < count; i++) {
      var open = eq;
      var close = open + (rnd() - 0.46) * 2600;
      var high = Math.max(open, close) + rnd() * 900;
      var low = Math.min(open, close) - rnd() * 900;
      out.candles.push({
        key: "d" + i, open: round2(open), close: round2(close),
        high: round2(high), low: round2(low), net: round2(close - open),
        days: 1, label: String(i + 1)
      });
      eq = close;
      if (low < mn) mn = low;
      if (high > mx) mx = high;
    }
    out.min = round2(mn);
    out.max = round2(mx);
    return out;
  }

  /* Latest stored session — ALL TIME always ends here, whatever month is picked. */
  function lastRowDate(rows) {
    var all = normalize(rows);
    return all.length ? all[all.length - 1].trade_date : null;
  }

  /* Months that actually have rows, newest first — the picker's options. */
  function monthList(rows) {
    var all = normalize(rows), seen = {}, out = [];
    for (var i = 0; i < all.length; i++) {
      var k = all[i].trade_date.slice(0, 7);
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    }
    return out.sort().reverse();
  }

  function prettyMonth(monthKey) {
    var k = String(monthKey || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) return "\u2014";
    var m = Number(k.slice(5, 7));
    if (!(m >= 1 && m <= 12)) return "\u2014";
    return MON[m - 1] + " " + k.slice(0, 4);
  }

  /* Last N months as bars — the audience-friendly "how has it been going" strip. */
  function monthBars(rows, limit, startCapital) {
    var keys = monthList(rows).slice(0, num(limit, 6)).reverse();   // oldest → newest
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var s = monthStats(rows, keys[i], startCapital);
      out.push({
        month: keys[i],
        label: MON[Number(keys[i].slice(5, 7)) - 1],
        net: s.net,
        pct: s.pct,
        days: s.days
      });
    }
    return out;
  }

  /* Progress from the starting capital toward a target (?goal=200000). */
  function goalProgress(equity, startCapital, target) {
    var start = num(startCapital, DEFAULT_START_CAPITAL) || DEFAULT_START_CAPITAL;
    var aim = num(target, 0);
    var eq = num(equity, start);
    var out = {
      start: start, equity: eq, target: aim > start ? aim : 0,
      gained: round2(eq - start), pct: 0, capped: 0, left: 0
    };
    if (!out.target) return out;
    out.pct = ((eq - start) / (out.target - start)) * 100;
    out.capped = Math.max(0, Math.min(100, out.pct));
    out.left = round2(Math.max(0, out.target - eq));
    return out;
  }

  /* Last trading day inside a month — used when the picker travels to a month.
   * Prefers a day that actually traded; a no-trade row would make LATEST ₹0. */
  function lastDayInMonth(rows, monthKey) {
    var key = String(monthKey || "").slice(0, 7);
    var any = null, traded = null;
    var all = normalize(rows);
    for (var i = 0; i < all.length; i++) {
      if (all[i].trade_date.slice(0, 7) !== key) continue;
      any = all[i].trade_date;
      if (num(all[i].wins, 0) + num(all[i].losses, 0) > 0) traded = all[i].trade_date;
    }
    return traded || any;
  }

  /* Calendar grid for one month: Monday-first weeks, cells tinted by that day's net.
   * This is what fills the lower half of a 9:16 card with something worth reading. */
  function monthGrid(rows, monthKey) {
    var key = String(monthKey || "").slice(0, 7);
    var out = {
      month: key, label: prettyMonth(key).toUpperCase(), cells: [], weeks: 0,
      net: 0, green: 0, red: 0, days: 0, first: null, last: null
    };
    if (!/^\d{4}-\d{2}$/.test(key)) return out;

    var byDay = {};
    var all = normalize(rows);
    for (var i = 0; i < all.length; i++) {
      if (all[i].trade_date.slice(0, 7) !== key) continue;
      byDay[all[i].trade_date] = all[i].net_pnl;
    }

    var b = monthBounds(key + "-01");
    if (!isDay(b[0])) return out;
    out.first = b[0];
    out.last = b[1];

    var d = new Date(b[0] + "T00:00:00Z");
    var startDow = (d.getUTCDay() + 6) % 7;          // Monday = 0
    d.setUTCDate(d.getUTCDate() - startDow);
    var end = new Date(b[1] + "T00:00:00Z");
    var guard = 0;

    while (d <= end && guard++ < 42) {
      var iso = d.toISOString().slice(0, 10);
      var inMonth = iso >= b[0] && iso <= b[1];
      var has = Object.prototype.hasOwnProperty.call(byDay, iso);
      var net = has ? byDay[iso] : null;
      out.cells.push({
        date: iso, day: d.getUTCDate(), inMonth: inMonth, net: net,
        sign: net === null ? 0 : (net > 0 ? 1 : (net < 0 ? -1 : 0))
      });
      if (inMonth && has) {
        out.net += net;
        out.days++;
        if (net > 0) out.green++; else if (net < 0) out.red++;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    out.net = round2(out.net);
    out.weeks = Math.ceil(out.cells.length / 7);
    return out;
  }

  /* Header date: a single day, or the from–to range the numbers cover. */
  function prettyRange(start, end) {
    if (!isDay(start) && !isDay(end)) return "\u2014";
    if (!isDay(start)) return prettyDay(end);
    var s = String(start).slice(0, 10), e = String(end || start).slice(0, 10);
    if (s === e) return prettyDay(s);
    var sd = new Date(s + "T00:00:00Z"), ed = new Date(e + "T00:00:00Z");
    if (s.slice(0, 7) === e.slice(0, 7)) {
      return sd.getUTCDate() + " \u2013 " + ed.getUTCDate() + " " +
        MON[ed.getUTCMonth()] + " " + ed.getUTCFullYear();
    }
    if (s.slice(0, 4) === e.slice(0, 4)) {
      return sd.getUTCDate() + " " + MON[sd.getUTCMonth()] + " \u2013 " +
        ed.getUTCDate() + " " + MON[ed.getUTCMonth()] + " " + ed.getUTCFullYear();
    }
    return prettyDay(s) + " \u2013 " + prettyDay(e);
  }

  /* ---- analytics: what a trader actually reads off a performance card --- */

  /* Every number here is derived ONLY from the stored per-day rows
   * (net_pnl, gross_pnl, charges, wins, losses, capital), so it can never
   * disagree with the journal. Day-level, not trade-level: labels say so
   * (e.g. "DAY PF" = gross winning days / gross losing days). */
  function analyze(rows, anchor, startCapital) {
    var all = normalize(rows).filter(function (r) { return !anchor || r.trade_date <= anchor; });
    var n = all.length;
    var out = {
      sessions: n, trades: 0, net: 0, gross: 0, charges: 0,
      green: 0, red: 0, flat: 0, greenPct: 0,
      avgDay: 0, avgWin: 0, avgLoss: 0, rr: 0, pf: 0, pfInf: false,
      expectancy: 0, vol: 0, sharpe: 0, sortino: 0,
      maxDD: 0, maxDDpct: 0, curDD: 0, curDDpct: 0,
      longestG: 0, longestR: 0, streak: 0, streakSign: 0,
      best: 0, bestDay: null, worst: 0, worstDay: null,
      annualPct: 0, chargesPct: 0, grossWin: 0, capital: DEFAULT_CAPITAL,
      first: n ? all[0].trade_date : null,
      last: n ? all[n - 1].trade_date : null
    };
    if (!n) return out;

    var cap = num(startCapital, 0) > 0
      ? num(startCapital, DEFAULT_CAPITAL)
      : num(all[n - 1].capital, DEFAULT_CAPITAL);
    if (!(cap > 0)) cap = DEFAULT_CAPITAL;
    out.capital = cap;

    var upSum = 0, downSum = 0, upN = 0, downN = 0, dn2 = 0, grossWin = 0;
    var eq = 0, peak = 0, runSign = 0, run = 0;
    var best = null, worst = null;

    for (var i = 0; i < n; i++) {
      var r = all[i], v = num(r.net_pnl, 0);

      out.net += v;
      out.gross += num(r.gross_pnl, 0);
      out.charges += num(r.charges, 0);
      out.trades += num(r.wins, 0) + num(r.losses, 0);
      if (num(r.gross_pnl, 0) > 0) grossWin += num(r.gross_pnl, 0);

      if (v > 0) { out.green++; upSum += v; upN++; }
      else if (v < 0) { out.red++; downSum += -v; downN++; dn2 += v * v; }
      else { out.flat++; }

      if (best === null || v > best) { best = v; out.best = v; out.bestDay = r.trade_date; }
      if (worst === null || v < worst) { worst = v; out.worst = v; out.worstDay = r.trade_date; }

      eq += v;
      if (eq > peak) peak = eq;
      if (peak - eq > out.maxDD) out.maxDD = peak - eq;

      var sign = v > 0 ? 1 : (v < 0 ? -1 : 0);
      if (sign === 0) { runSign = 0; run = 0; }
      else if (sign === runSign) { run++; }
      else { runSign = sign; run = 1; }
      if (runSign === 1 && run > out.longestG) out.longestG = run;
      if (runSign === -1 && run > out.longestR) out.longestR = run;
      if (i === n - 1) { out.streak = run; out.streakSign = runSign; }
    }

    out.curDD = peak - eq;
    out.avgDay = out.net / n;
    out.avgWin = upN ? upSum / upN : 0;
    out.avgLoss = downN ? downSum / downN : 0;
    out.rr = out.avgLoss > 0 ? out.avgWin / out.avgLoss : 0;
    if (downSum > 0) out.pf = upSum / downSum;
    else out.pfInf = upSum > 0;
    out.expectancy = out.trades > 0 ? out.net / out.trades : 0;
    // no-trade days (net 0) are not "red" — they're days the bot sat out
    var tradedDays = out.green + out.red;
    out.greenPct = tradedDays > 0 ? (out.green / tradedDays) * 100 : 0;
    out.maxDDpct = (out.maxDD / cap) * 100;
    out.curDDpct = (out.curDD / cap) * 100;
    out.annualPct = (out.avgDay / cap) * 252 * 100;
    // charges against gross PROFIT — dividing by signed gross is meaningless
    // once a losing day is in the sum
    out.chargesPct = grossWin > 0 ? (out.charges / grossWin) * 100 : 0;
    out.grossWin = grossWin;

    if (n > 1) {
      var ss = 0;
      for (var j = 0; j < n; j++) {
        var d = num(all[j].net_pnl, 0) - out.avgDay;
        ss += d * d;
      }
      out.vol = Math.sqrt(ss / (n - 1));
      if (out.vol > 0) out.sharpe = (out.avgDay / out.vol) * Math.sqrt(252);
    }
    if (dn2 > 0) out.sortino = (out.avgDay / Math.sqrt(dn2 / n)) * Math.sqrt(252);

    return out;
  }

  /* Cumulative net from the first stored session — the equity curve. */
  function equitySeries(rows, anchor) {
    var all = normalize(rows).filter(function (r) { return !anchor || r.trade_date <= anchor; });
    var run = 0;
    var values = all.map(function (r) { run += num(r.net_pnl, 0); return round2(run); });
    return {
      values: values,
      from: all.length ? all[0].trade_date : null,
      to: all.length ? all[all.length - 1].trade_date : null
    };
  }

  /* Last-N sessions as signed bars: magnitude relative to the biggest |net|,
   * so one monster day can't flatten the rest of the strip. */
  function stripBars(rows, anchor, n) {
    var all = normalize(rows).filter(function (r) { return !anchor || r.trade_date <= anchor; });
    var want = num(n, 20);
    var take = all.slice(Math.max(0, all.length - (want > 0 ? Math.floor(want) : 20)));
    var max = 0;
    take.forEach(function (r) { max = Math.max(max, Math.abs(num(r.net_pnl, 0))); });
    return take.map(function (r) {
      var v = num(r.net_pnl, 0);
      return {
        date: r.trade_date,
        net: round2(v),
        h: max > 0 ? Math.abs(v) / max : 0,
        sign: v > 0 ? 1 : (v < 0 ? -1 : 0)
      };
    });
  }


  var PERIOD_CHIP = { day: "DAY", week: "WEEK", month: "MONTH", all: "ALL TIME" };

  /* Blocks are independent sections; a "detail" preset just picks a set.
   * ?blocks=equity,risk always wins over the preset. */
  var BLOCKS = ["tag", "hero", "stats", "journal", "calendar", "donut", "candles",
                "equity", "monthbars", "bestworst", "goal", "strip", "risk", "risk2",
                "streaks", "cost", "spark", "rows"];
  var PRESETS = {
    card:    ["journal", "calendar", "donut", "candles", "rows"],
    compact: ["hero", "stats", "spark", "rows"],
    pro:     ["tag", "hero", "stats", "equity", "strip", "risk", "rows"],
    analyst: ["tag", "hero", "stats", "equity", "strip", "risk", "risk2",
              "streaks", "cost", "rows"]
  };
  var DETAIL = ["card", "compact", "pro", "analyst"];
  var DEFAULT_DETAIL = "card";
  var DEFAULT_TAG = "SEESAW \u00b7 NIFTY OPTIONS \u00b7 INTRADAY";
  var DEFAULT_HANDLE = "@the_wounded_trader";

  function pickDetail(raw) {
    var s = String(raw || "").toLowerCase();
    return DETAIL.indexOf(s) >= 0 ? s : DEFAULT_DETAIL;
  }

  function resolveBlocks(opts) {
    var o = opts || {};
    var raw = String(o.blocks || "");
    if (raw) {
      var wanted = raw.split(",").map(function (x) { return x.trim().toLowerCase(); });
      var valid = wanted.filter(function (x) { return BLOCKS.indexOf(x) >= 0; });
      if (valid.length) return valid;
    }
    return (PRESETS[o.detail] || PRESETS[DEFAULT_DETAIL]).slice();
  }

  var STYLES = ["midnight", "paper", "neon", "bloom", "broadsheet", "minimal"];
  var STYLE_LABEL = {
    midnight: "1 · Midnight", paper: "2 · Paper", neon: "3 · Neon",
    bloom: "4 · Bloom", broadsheet: "5 · Broadsheet", minimal: "6 · Minimal"
  };
  var THEME_ALIAS = { dark: "midnight", light: "paper" };   // old ?theme= links keep working
  var DEFAULT_STYLE = "bloom";
  var BADGES = ["violet", "inkred", "mono", "paperred", "dot"];
  var DEFAULT_BADGE = "dot";

  function pickBadge(raw) {
    var s = String(raw || "").toLowerCase();
    return BADGES.indexOf(s) >= 0 ? s : DEFAULT_BADGE;
  }

  function pickStyle(raw, theme) {
    var s = String(raw || "").toLowerCase();
    if (STYLES.indexOf(s) >= 0) return s;
    var t = THEME_ALIAS[String(theme || "").toLowerCase()];
    return t || DEFAULT_STYLE;
  }

  function readOpts(search) {
    var p = new URLSearchParams(search || "");
    var o = {
      date: p.get("date") || "",
      period: p.get("period") || "day",
      format: p.get("format") || "story",
      style: pickStyle(p.get("style"), p.get("theme")),
      detail: pickDetail(p.get("detail")),
      blocks: p.get("blocks") || "",
      month: /^\d{4}-\d{2}$/.test(p.get("month") || "") ? p.get("month") : "",
      goal: num(p.get("goal"), 0),
      tag: p.get("tag") === null ? DEFAULT_TAG : (p.get("tag") || ""),
      sessions: num(p.get("sessions"), 20),
      capital: num(p.get("capital"), DEFAULT_START_CAPITAL),
      clean: p.get("clean") === "1",
      probe: p.get("probe") === "1",
      handle: p.get("handle") || "",
      demo: num(p.get("demo"), 0),
      badge: pickBadge(p.get("badge"))
    };
    if (["day", "week", "month", "all"].indexOf(o.period) < 0) o.period = "day";
    if (["story", "square"].indexOf(o.format) < 0) o.format = "story";
    return o;
  }

  /* ---- browser --------------------------------------------------------- */

  var SUPABASE_URL = "https://csksswotuhopqlfqilgg.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_a6--vkPhS3EjVF8DYQMUPQ_HQ1bwDIm";
  var FIELDS = "trade_date,capital,gross_pnl,charges,net_pnl,wins,losses";

  var state = { rows: [], opts: null, anchor: null };

  function $(id) { return document.getElementById(id); }
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  function setTone(id, cls, base) {
    var e = $(id);
    if (!e) return;
    var v = (base ? base + " " : "") + cls;
    // SVGElement.className is a read-only SVGAnimatedString: assigning to it
    // throws in every real browser (the Node test stub hid this for a while).
    if (typeof e.className === "string") e.className = v;
    else e.setAttribute("class", v);
  }

  function toneClass(v) {
    var n = num(v, 0);
    return n > 0 ? "pos" : n < 0 ? "neg" : "zero";
  }

  function hint(msg) { var e = $("hint"); if (e) e.textContent = msg || ""; }

  /* The synthetic preview must never be reachable on the public site: a card that
   * can render invented numbers is a reputational hazard for a public track record. */
  function isLocalOrigin() {
    try {
      var loc = (typeof window !== "undefined" && window.location) || null;
      if (!loc) return false;
      var proto = String(loc.protocol || "");
      var host = String(loc.hostname || "");
      return proto === "file:" || host === "" || host === "localhost" ||
             host === "127.0.0.1" || host === "[::1]" || host === "::1";
    } catch (e) { return false; }
  }

  function fetchRows(url, key) {
    var base = String(url || SUPABASE_URL).replace(/\/+$/, "");
    var k = key || SUPABASE_ANON_KEY;
    var q = base + "/rest/v1/ithio_daily?select=" + FIELDS + "&order=trade_date.asc";
    return fetch(q, { headers: { apikey: k, Authorization: "Bearer " + k } })
      .then(function (r) {
        if (!r.ok) throw new Error("Supabase HTTP " + r.status);
        return r.json();
      });
  }

  function toQuery(opts, anchor) {
    var o = opts || {};
    var p = new URLSearchParams();
    if (anchor) p.set("date", anchor);
    p.set("period", o.period || "day");
    if ((o.format || "story") !== "story") p.set("format", o.format);
    if ((o.style || DEFAULT_STYLE) !== DEFAULT_STYLE) p.set("style", o.style);
    if ((o.detail || DEFAULT_DETAIL) !== DEFAULT_DETAIL) p.set("detail", o.detail);
    if (o.blocks) p.set("blocks", o.blocks);
    if (o.month) p.set("month", o.month);
    if ((o.badge || DEFAULT_BADGE) !== DEFAULT_BADGE) p.set("badge", o.badge);
    if (o.tag !== undefined && o.tag !== DEFAULT_TAG) p.set("tag", o.tag || "");
    if (num(o.sessions, 20) !== 20) p.set("sessions", String(o.sessions));
    if (o.clean) p.set("clean", "1");
    if (o.handle) p.set("handle", o.handle);
    return p.toString();
  }

  /* A fixed 1080x{1080,1920} box can't hold every combination, and silently
   * clipping the footer is the worst outcome. So after render the card measures
   * itself and drops the least important visible section until it fits. */
  var DROP_ORDER = ["cost", "streaks", "risk2", "spark", "strip", "candles", "donut",
                    "stats", "tag", "calendar", "risk", "equity", "monthbars",
                    "bestworst", "goal"];

  /* block name -> element id (camelCase ids can't be derived by capitalising) */
  var BLOCK_ID = {
    bestworst: "blkBestWorst",
    monthbars: "blkMonthBars",
    risk: "blkRisk",
    risk2: "blkRisk2",
    donut: "blkDonut",
    candles: "blkCandles"
  };

  function blockEl(name) {
    var id = BLOCK_ID[name] || ("blk" + name.charAt(0).toUpperCase() + name.slice(1));
    return $(id);
  }

  function autoFit() {
    var card = $("card");
    var dropped = [];
    if (!card || typeof card.scrollHeight !== "number" ||
        typeof card.clientHeight !== "number") return dropped;
    for (var i = 0; i < DROP_ORDER.length; i++) {
      if (card.scrollHeight <= card.clientHeight) break;
      var name = DROP_ORDER[i];
      var box = blockEl(name);
      if (box && !box.hidden) {
        box.hidden = true;
        dropped.push(name);
      }
    }
    return dropped;
  }

  /* Draw an equity candle chart into #candleSvg: x axis with time labels,
   * y axis with a price range that fits the bars, no ₹1L reference line. */
  /* drawCandles no longer writes a header — the chart header was removed */
  function drawCandles(cs, isDemo) {
    var svg = $("candleSvg");
    if (!svg) return;
    var W = 720, H = 220, PADL = 2, PADR = 64, PADT = 12, PADB = 26;
    var pw = W - PADL - PADR, ph = H - PADT - PADB;
    var lo = cs.min, hi = cs.max;
    if (!(hi > lo)) { hi = lo + 1000; lo -= 1000; }
    var padY = (hi - lo) * 0.08;
    lo -= padY; hi += padY;
    var yOf = function (v) { return PADT + ph - ((v - lo) / (hi - lo)) * ph; };
    var n = cs.candles.length || 1;
    var slot = pw / n;
    var bw = Math.max(2, Math.min(26, slot * 0.62));
    var parts = [];

    // y axis (right) + x axis (bottom)
    var ax = PADL + pw, ay = PADT + ph;
    parts.push('<line class="ax" x1="' + ax + '" y1="' + PADT + '" x2="' + ax + '" y2="' + ay + '"/>');
    parts.push('<line class="ax" x1="' + PADL + '" y1="' + ay + '" x2="' + ax + '" y2="' + ay + '"/>');

    for (var i = 0; i < cs.candles.length; i++) {
      var c = cs.candles[i];
      var cx = PADL + slot * i + slot / 2;
      var cls = c.close >= c.open ? "up" : "down";
      parts.push('<line class="wick ' + cls + '" x1="' + cx.toFixed(1) + '" y1="' +
        yOf(c.high).toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' +
        yOf(c.low).toFixed(1) + '"/>');
      var top = Math.min(yOf(c.open), yOf(c.close));
      var hgt = Math.max(2, Math.abs(yOf(c.close) - yOf(c.open)));
      parts.push('<rect class="body ' + cls + '" x="' + (cx - bw / 2).toFixed(1) +
        '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + hgt.toFixed(1) + '" rx="1.5"/>');
    }

    // x labels below the axis
    var step = Math.max(1, Math.ceil(n / 5));
    for (var li = 0; li < n; li += step) {
      var lx = PADL + slot * li + slot / 2;
      parts.push('<text class="xl" x="' + lx.toFixed(1) + '" y="' + (H - 7) +
        '" text-anchor="middle">' + cs.candles[li].label + "</text>");
    }

    // y labels just outside the axis: top / middle / bottom of the fitted range
    var mid = (lo + hi) / 2, tx = ax + 9;
    [hi, mid, lo].forEach(function (v, k) {
      var yy = k === 0 ? yOf(v) + 12 : (k === 1 ? yOf(v) + 4 : yOf(v) - 2);
      parts.push('<text class="yl" x="' + tx + '" y="' + yy.toFixed(1) + '">' + lakhLabel(v) + "</text>");
    });

    svg.innerHTML = parts.join("");
  }

  function render() {
    if (!state.anchor || !window.IthioMath) return false;
    var o = state.opts, anchor = state.anchor;
    var rows = state.rows;
    var s = window.IthioMath.computeSummary(rows, o.period, anchor);
    // compounding model: capital = ₹1,00,000 + cumulative net up to the anchor
    var ps = periodStats(rows, o.period, anchor, o.capital);
    var allPs = periodStats(rows, "all", lastRowDate(rows), o.capital);
    var atc = allTimeCount(rows, o.period, lastRowDate(rows));
    var cap = num(ps.equity, o.capital);          // live capital, moves every day

    document.body.dataset.style = o.style;
    document.body.dataset.badge = o.badge;
    document.body.dataset.detail = o.detail;
    document.body.classList.toggle("square", o.format === "square");
    document.body.classList.toggle("clean", !!o.clean);
    document.body.classList.toggle("flat", num(ps.net, 0) === 0);

    // header shows the range the numbers cover (single day, or from–to)
    setText("storyDate", prettyRange(ps.start, ps.end));
    setText("storyChip", PERIOD_CHIP[o.period] || "DAY");
    setText("dayLabel", prettyRange(ps.start, ps.end));

    setText("heroNet", signedMoney(ps.net));
    setTone("heroNet", toneClass(ps.net), "heroNet");
    setText("heroPct", signedPct(ps.pct));
    setTone("heroPct", toneClass(ps.pct), "pill");

    setText("winsN", num(s.overall.wins, 0) + "W");
    setText("lossesN", num(s.overall.losses, 0) + "L");
    setText("wrN", winRate(s.overall.wins, s.overall.losses));
    setText("daysN", String(num(s.overall.days, 0)) + (num(s.overall.days, 0) === 1 ? " day" : " days"));

    // month row: any month from the picker, defaulting to the as-of month
    var monthKey = o.month || anchor.slice(0, 7);
    var ms = monthStats(rows, monthKey, o.capital);
    setText("monthName", prettyMonth(monthKey));
    setText("mtdNet", ms.days ? signedMoney(ms.net) : "\u2014");
    setTone("mtdNet", ms.days ? toneClass(ms.net) : "zero", "v");
    setText("mtdPct", ms.days ? signedPct(ms.pct) : "\u2014");
    setTone("mtdPct", ms.days ? toneClass(ms.pct) : "zero", "p");

    // month picker options (only months that actually have rows)
    var menuEl = $("monthMenu");
    if (menuEl) {
      var months = monthList(rows), mhtml = "";
      for (var mi = 0; mi < months.length; mi++) {
        mhtml += '<button type="button" class="mopt' +
          (months[mi] === monthKey ? " active" : "") + '" data-month="' + months[mi] + '">' +
          prettyMonth(months[mi]) + "</button>";
      }
      menuEl.innerHTML = mhtml;
      menuEl.hidden = true;
    }

    // calendar heatmap for the selected month — fills the lower half usefully
    var g = monthGrid(rows, monthKey);
    var dow = ["M", "T", "W", "T", "F", "S", "S"];
    var dhtml = "";
    for (var di = 0; di < 7; di++) dhtml += "<span>" + dow[di] + "</span>";
    var cellsHtml = "";
    for (var ci = 0; ci < g.cells.length; ci++) {
      var cell = g.cells[ci];
      if (!cell.inMonth) { cellsHtml += '<span class="calCell out"></span>'; continue; }
      var cls = cell.sign > 0 ? "pos" : (cell.sign < 0 ? "neg" : "flat");
      cellsHtml += '<span class="calCell ' + cls + '"><b>' + cell.day + "</b><i>" +
        (cell.net === null ? "" : signedMoney(cell.net)) + "</i></span>";
    }
    var gridEl = $("calGrid");
    if (gridEl) gridEl.innerHTML = cellsHtml;
    var dowEl = $("calDow");
    if (dowEl) dowEl.innerHTML = dhtml;
    setText("calLabel", g.label);
    var calNote = $("calNote");
    if (calNote) {
      if (g.days) {
        calNote.innerHTML = '<span class="cg">' + g.green + " green</span> \u00b7 " +
          '<span class="cr">' + g.red + " red</span>";
      } else {
        calNote.textContent = "no trades";
      }
    }

    // all time counts in the unit of the selected period (days / weeks / months)
    setText("allLabel", "ALL TIME \u00b7 " + atc.n + " " + atc.unit);
    setText("allNet", signedMoney(allPs.net));
    setTone("allNet", toneClass(allPs.net), "v");
    setText("allPct", signedPct(allPs.pct));
    setTone("allPct", toneClass(allPs.pct), "p");

    var series = cumSeries(rows, anchor, o.sessions);
    var sp = sparkPath(series.values, 920, 200, 6);
    var line = $("sparkLine"), area = $("sparkArea");
    if (line) {
      line.setAttribute("d", sp.d || "M6 100 L914 100");
      setTone("sparkLine", sp.up ? "pos" : "neg", "line");
    }
    if (area) {
      if (sp.points.length > 1) {
        var f = sp.points[0], l = sp.points[sp.points.length - 1];
        area.setAttribute("d", sp.d + " L" + l[0].toFixed(1) + " 200 L" + f[0].toFixed(1) + " 200 Z");
      } else {
        area.setAttribute("d", "");
      }
      setTone("sparkArea", sp.up ? "pos" : "neg", "area");
    }
    setText("sessN", String(series.values.length));
    setText("sparkNote", series.values.length
      ? signedMoney(series.values[series.values.length - 1]) + " since " + prettyDay(series.from)
      : "not enough history");

    /* ---- sections: each one switchable, presets pick a set --------------- */
    var on = resolveBlocks(o);
    var wanted = function (b) { return on.indexOf(b) >= 0; };
    var tagText = (o.tag === undefined || o.tag === null) ? DEFAULT_TAG : o.tag;
    BLOCKS.forEach(function (b) {
      var box = blockEl(b);
      if (box) box.hidden = !wanted(b);
    });
    var tagBox = $("blkTag");
    if (tagBox) tagBox.hidden = !wanted("tag") || !tagText;
    setText("tagLine", tagText);

    var a = analyze(rows, anchor, o.capital);

    /* journal-card replica — the journal's fields, with a compounding capital:
     * CAPITAL = live equity, LATEST = the day's net + its % underneath,
     * NET = the selected period's net in the brand-dark tone. */
    setText("jCapital", money(cap));
    setText("jLatest", signedMoney(ps.latestNet));
    setTone("jLatest", toneClass(ps.latestNet), "jv");
    setText("jLatestPct", signedPct(ps.latestPct));
    setTone("jLatestPct", toneClass(ps.latestPct), "pill");
    setText("jNet", signedMoney(ps.net));
    setTone("jNet", "net", "jv big");
    setText("jWins", num(s.overall.wins, 0) + "W");
    setText("jLosses", num(s.overall.losses, 0) + "L");

    /* equity curve — whole history, with the drawdown called out */
    var eq = equitySeries(rows, anchor);
    var ep = sparkPath(eq.values, 920, 240, 10);
    var eqLine = $("eqLine"), eqArea = $("eqArea");
    if (eqLine) {
      eqLine.setAttribute("d", ep.d || "M10 120 L910 120");
      setTone("eqLine", ep.up ? "pos" : "neg", "line");
    }
    if (eqArea) {
      if (ep.points.length > 1) {
        var ef = ep.points[0], el2 = ep.points[ep.points.length - 1];
        eqArea.setAttribute("d", ep.d + " L" + el2[0].toFixed(1) + " 240 L" + ef[0].toFixed(1) + " 240 Z");
      } else {
        eqArea.setAttribute("d", "");
      }
      setTone("eqArea", ep.up ? "pos" : "neg", "area");
    }
    setText("eqLabel", "EQUITY CURVE \u00b7 SINCE " + prettyDay(eq.from).toUpperCase());
    setText("eqNote", a.maxDD > 0
      ? "MAX DD \u2212" + money(a.maxDD) + " (\u2212" + a.maxDDpct.toFixed(1) + "%)"
      : "NO DRAWDOWN");

    /* last N months as bars */
    var mb = monthBars(rows, 6, o.capital);
    var mbBox = $("mbars");
    if (mbBox) {
      var maxAbs = 0, mbi;
      for (mbi = 0; mbi < mb.length; mbi++) maxAbs = Math.max(maxAbs, Math.abs(mb[mbi].net));
      var bh = "";
      for (mbi = 0; mbi < mb.length; mbi++) {
        var mm = mb[mbi];
        var hh = maxAbs > 0 ? Math.max(8, Math.round((Math.abs(mm.net) / maxAbs) * 100)) : 8;
        bh += '<span class="mbar ' + (mm.net > 0 ? "pos" : (mm.net < 0 ? "neg" : "zero")) + '">' +
              '<b>' + signedMoney(mm.net) + '</b>' +
              '<i><s style="height:' + hh + '%"></s></i>' +
              '<u>' + mm.label + '</u></span>';
      }
      mbBox.innerHTML = bh;
    }
    setText("mbNote", mb.length
      ? prettyMonth(mb[mb.length - 1].month) + " " + signedMoney(mb[mb.length - 1].net)
      : "\u2014");

    /* best / worst session */
    setText("bwBest", signedMoney(a.best));
    setTone("bwBest", toneClass(a.best), "bwv");
    setText("bwBestDay", prettyDay(a.bestDay));
    setText("bwWorst", signedMoney(a.worst));
    setTone("bwWorst", toneClass(a.worst), "bwv");
    setText("bwWorstDay", prettyDay(a.worstDay));

    /* win-rate ring — always all time, so browsing months can't move it */
    var winsAll = num(s.overall.wins, 0), lossAll = num(s.overall.losses, 0);
    var tradesAll = winsAll + lossAll;
    var wrPct = tradesAll > 0 ? (winsAll / tradesAll) * 100 : 0;
    var ringC = 2 * Math.PI * 48;
    var ringEl = $("ringVal");
    if (ringEl) {
      ringEl.setAttribute("stroke-dasharray", ringC.toFixed(2));
      ringEl.setAttribute("stroke-dashoffset",
        (ringC * (1 - Math.max(0, Math.min(100, wrPct)) / 100)).toFixed(2));
    }
    setText("ringPct", tradesAll ? Math.round(wrPct) + "%" : "\u2014");

    /* equity candles to the right of the ring (30 max, or a local-only demo) */
    if (o.demo > 0 && isLocalOrigin()) {
      drawCandles(demoCandles(o.demo, o.capital), true);
    } else {
      drawCandles(candleSeries(rows, o.period, anchor, o.capital, CANDLE_MAX), false);
    }

    /* handle now lives in the footer badge: the "@" is its own span so an accent
     * colour can differ, and the name is split at the last "_" so the tail can be
     * tinted too (?badge=dot uses a red dot + white/red name). */
    var hName = o.handle || DEFAULT_HANDLE;
    var nameOnly = hName.replace(/^@/, "");
    var cut = nameOnly.lastIndexOf("_");
    var head = cut > 0 ? nameOnly.slice(0, cut) : nameOnly;
    var tail = cut > 0 ? nameOnly.slice(cut) : "";
    setText("wmAt", hName.charAt(0) === "@" ? "@" : "");
    var handleEl = $("wmHandle");
    if (handleEl) {
      handleEl.innerHTML = '<span class="bHead">' + head + "</span>" +
        (tail ? '<span class="bTail">' + tail + "</span>" : "");
    }

    /* progress toward the target, only when ?goal= is set */
    var gp = goalProgress(cap, o.capital, o.goal);
    if (!gp.target) {
      var gbox = $("blkGoal");
      if (gbox) gbox.hidden = true;
    } else {
      var gboxOn = $("blkGoal");
      if (gboxOn) gboxOn.hidden = false;
      setText("goalLabel", money(gp.start) + " \u2192 " + money(gp.target));
      setText("goalPct", (gp.pct >= 0 ? "" : "\u2212") + Math.abs(gp.pct).toFixed(1) + "%");
      var fillEl = $("goalFill");
      if (fillEl) fillEl.style.width = gp.capped.toFixed(1) + "%";
      setText("goalFoot", signedMoney(gp.gained) + " \u00b7 " + money(gp.left) + " to go");
    }

    /* last-N session strip */
    var bars = stripBars(rows, anchor, o.sessions);
    var barBox = $("stripBars");
    if (barBox) {
      var html = "";
      for (var bi = 0; bi < bars.length; bi++) {
        var b = bars[bi];
        html += '<span class="bar ' + (b.sign > 0 ? "pos" : (b.sign < 0 ? "neg" : "zero")) +
                '" style="--h:' + Math.max(7, Math.round(b.h * 100)) + '"></span>';
      }
      barBox.innerHTML = html;
    }
    setText("stripLabel", "LAST " + bars.length + " SESSIONS");
    setText("stripNote", a.green + "G \u00b7 " + a.red + "R" + (a.flat ? " \u00b7 " + a.flat + "F" : ""));
    setText("stripFrom", bars.length ? prettyDay(bars[0].date).slice(0, 6) : "");
    setText("stripTo", bars.length ? prettyDay(bars[bars.length - 1].date).slice(0, 6) : "");

    /* risk & consistency tiles */
    setText("pfV", a.pfInf ? "\u221e" : a.pf.toFixed(2));
    setTone("pfV", (a.pfInf || a.pf >= 1) ? "pos" : "neg", "n");
    setText("ddV", a.maxDD > 0 ? "\u2212" + a.maxDDpct.toFixed(1) + "%" : "\u2014");
    setTone("ddV", a.maxDDpct > 0 ? "neg" : "zero", "n");
    setText("sharpeV", (a.sharpe >= 0 ? "" : "\u2212") + Math.abs(a.sharpe).toFixed(2));
    setTone("sharpeV", a.sharpe > 0 ? "pos" : (a.sharpe < 0 ? "neg" : "zero"), "n");
    setText("greenV", a.greenPct.toFixed(0) + "%");
    setTone("greenV", a.greenPct >= 50 ? "pos" : "zero", "n");
    setText("avgV", signedMoney(a.avgDay));
    setTone("avgV", toneClass(a.avgDay), "n");
    setText("rrV", a.rr > 0 ? a.rr.toFixed(2) + "\u00d7" : "\u2014");
    setTone("rrV", a.rr >= 1 ? "pos" : (a.rr > 0 ? "neg" : "zero"), "n");

    /* streaks + cost drag */
    var streakTxt = a.streakSign > 0 ? a.streak + " GREEN IN A ROW"
      : a.streakSign < 0 ? a.streak + " RED IN A ROW" : "NO ACTIVE STREAK";
    setText("streakLine", streakTxt + " \u00b7 LONGEST " + a.longestG + "G / " + a.longestR + "R");
    setTone("streakLine", a.streakSign > 0 ? "pos" : (a.streakSign < 0 ? "neg" : "zero"), "note");
    setText("costLine", "CHARGES " + money(a.charges) + " (" +
      (a.chargesPct > 0 ? a.chargesPct.toFixed(1) + "% OF GROSS" : "NO GROSS") + ") \u00b7 " +
      a.trades + " TRADES \u00b7 EXP " + signedMoney(a.expectancy));

    var badgeEl = $("footBadge");
    if (badgeEl) badgeEl.hidden = false;

    document.body.dataset.ready = "1";

    var dropped = autoFit();
    if (dropped.length) {
      hint("auto-fit " + o.format + " " + o.detail + ": dropped " + dropped.join(", "));
      document.body.dataset.fit = "1:" + dropped.join(",");
    }

    /* ?probe=1 — layout self-check without a screenshot: the headless runner
     * reads document.title to see whether the card overflows its fixed box. */
    if (o.probe && typeof document !== "undefined") {
      var cardEl = $("card");
      var over = cardEl ? (cardEl.scrollHeight - cardEl.clientHeight) : -1;
      var vis = BLOCKS.filter(function (b) {
        var e = blockEl(b);
        return e && !e.hidden;
      }).join("+");
      document.title = "PROBE detail=" + o.detail + " fmt=" + o.format +
        " overflow=" + over + " h=" + (cardEl ? cardEl.scrollHeight : 0) +
        " w=" + (cardEl ? cardEl.scrollWidth : 0) + " blocks=" + vis +
        " dropped=" + (dropped.join(",") || "-");
      // over http(s) the local server logs this request line, so a headless run
      // can be measured without a screenshot pipeline
      try {
        var beacon = new Image();
        beacon.src = "/__probe?" + encodeURIComponent(document.title);
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  function applyScale() {
    var stage = $("stage"), card = $("card"), holder = $("holder");
    if (!stage || !card) return;
    var cw = card.offsetWidth || 1080;
    var ch = card.offsetHeight || 1920;
    var availW = Math.max(320, (window.innerWidth || 1200) - 40);
    var barRoom = document.body.classList.contains("clean") ? 24 : 150;
    var availH = Math.max(240, (window.innerHeight || 900) - barRoom);
    var s = Math.min(1, availW / cw, availH / ch);                     // whole card must fit
    stage.style.transform = "scale(" + s + ")";
    stage.style.width = cw + "px";
    stage.style.height = ch + "px";
    if (holder) holder.style.height = Math.round(ch * s) + "px";
  }

  function go(patch) {
    var o = state.opts;
    patch = patch || {};
    if (patch.period) o.period = patch.period;
    if (patch.format) o.format = patch.format;
    if (patch.style) o.style = patch.style;
    if (patch.detail) o.detail = patch.detail;
    if (patch.month !== undefined) o.month = patch.month;
    if (patch.date) o.date = patch.date;
    state.anchor = pickAnchor(state.rows, o.date || state.anchor);
    try { history.replaceState(null, "", "?" + toQuery(o, state.anchor)); } catch (e) { /* file:// */ }
    if (state.anchor) render();
    applyScale();
  }

  function downloadPng() {
    var card = $("card");
    if (!card) return;
    if (typeof html2canvas === "undefined") {
      hint("PNG export needs the html2canvas CDN \u2014 use your browser screenshot instead.");
      return;
    }
    hint("Rendering PNG\u2026");
    document.body.classList.add("capturing");
    var w = card.offsetWidth, h = card.offsetHeight;
    var o = state.opts;
    html2canvas(card, { width: w, height: h, scale: 1, backgroundColor: null,
                        useCORS: true, logging: false })
      .then(function (canvas) {
        var name = "ithio-" + (state.anchor || "card") + "-" + o.period + "-" +
                   (o.format === "square" ? "1x1" : "9x16") + ".png";
        canvas.toBlob(function (blob) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
          hint("Saved " + name);
        }, "image/png");
      })
      .catch(function (e) { hint("PNG export failed: " + ((e && e.message) || e)); })
      .then(function () {
        document.body.classList.remove("capturing");
        applyScale();
      });
  }

  function wireControls() {
    var nodes = document.querySelectorAll("[data-period]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].addEventListener("click", function () {
        go({ period: this.getAttribute("data-period") });
        markActive();
      });
    }
    var fmts = document.querySelectorAll("[data-format]");
    for (var j = 0; j < fmts.length; j++) {
      fmts[j].addEventListener("click", function () {
        go({ format: this.getAttribute("data-format") });
        markActive();
      });
    }
    var prev = $("prevDay"), next = $("nextDay"), styleSel = $("styleSel"), dl = $("downloadBtn");
    var detailBtn = $("detailBtn");
    if (prev) prev.addEventListener("click", function () { go({ date: stepDay(state.rows, state.anchor, -1) }); });
    if (next) next.addEventListener("click", function () { go({ date: stepDay(state.rows, state.anchor, 1) }); });
    if (styleSel) styleSel.addEventListener("change", function () {
      go({ style: String(this.value) });
      markActive();
    });
    if (detailBtn) detailBtn.addEventListener("click", function () {
      var i = DETAIL.indexOf(state.opts.detail);
      var nextDetail = DETAIL[(i + 1) % DETAIL.length];
      state.opts.blocks = "";                 // the preset wins again
      go({ detail: nextDetail });
      markActive();
    });
    if (dl) dl.addEventListener("click", downloadPng);

    /* month picker: the row is clickable, the list is a fixed overlay so the
     * card's overflow:hidden can't clip it */
    var monthBtn = $("monthBtn"), monthMenu = $("monthMenu");

    function positionMonthMenu() {
      if (!monthBtn || !monthMenu || typeof monthBtn.getBoundingClientRect !== "function") return;
      var r = monthBtn.getBoundingClientRect();
      var vh = window.innerHeight || 800;
      // always open BELOW the row; if the window is short, shrink the list
      // (and let it scroll) rather than jumping over the card's top content
      var below = Math.round(vh - r.bottom - 16);
      monthMenu.style.minWidth = Math.max(220, Math.round(r.width)) + "px";
      monthMenu.style.left = Math.max(8, Math.round(r.left)) + "px";
      monthMenu.style.top = Math.round(r.bottom + 8) + "px";
      monthMenu.style.maxHeight = Math.max(96, below - 8) + "px";
    }

    if (monthBtn) monthBtn.addEventListener("click", function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (!monthMenu) return;
      if (!monthMenu.hidden) { monthMenu.hidden = true; return; }
      monthMenu.hidden = false;
      positionMonthMenu();          // measure only once it is visible
    });
    if (monthMenu) monthMenu.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var t = ev.target;
      var mk = t && t.getAttribute ? t.getAttribute("data-month") : null;
      if (!mk) return;
      monthMenu.hidden = true;
      // only the month row + calendar follow the pick; ALL TIME stays all time
      go({ month: mk });
    });
    document.addEventListener("click", function (ev) {
      if (!monthMenu || monthMenu.hidden) return;
      var t = ev.target;
      var inside = t && (t.id === "monthBtn" ||
        (t.closest && t.closest("#monthMenu")));
      if (!inside) monthMenu.hidden = true;
    });
    window.addEventListener("resize", function () {
      if (monthMenu && !monthMenu.hidden) positionMonthMenu();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft") go({ date: stepDay(state.rows, state.anchor, -1) });
      else if (ev.key === "ArrowRight") go({ date: stepDay(state.rows, state.anchor, 1) });
      else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        var order = ["day", "week", "month", "all"];
        var k = order.indexOf(state.opts.period) + (ev.key === "ArrowDown" ? 1 : -1);
        if (k >= 0 && k < order.length) { go({ period: order[k] }); markActive(); }
      }
    });
    window.addEventListener("resize", applyScale);
  }

  function markActive() {
    var o = state.opts;
    var ps = document.querySelectorAll("[data-period]");
    for (var i = 0; i < ps.length; i++) {
      ps[i].classList.toggle("active", ps[i].getAttribute("data-period") === o.period);
    }
    var fs = document.querySelectorAll("[data-format]");
    for (var j = 0; j < fs.length; j++) {
      fs[j].classList.toggle("active", fs[j].getAttribute("data-format") === o.format);
    }
    var tb = $("styleSel");
    if (tb) tb.value = o.style;
    var db = $("detailBtn");
    if (db) db.textContent = String(o.detail || DEFAULT_DETAIL).toUpperCase();
  }

  function fail(msg) {
    hint(msg);
    document.body.dataset.ready = "error";
  }

  function init() {
    state.opts = readOpts(window.location.search);
    markActive();
    applyScale();
    wireControls();
    document.body.classList.toggle("clean", !!state.opts.clean);
    if (!window.IthioMath) { fail("ithio.js did not load \u2014 cannot compute the card."); return; }
    fetchRows(SUPABASE_URL, SUPABASE_ANON_KEY)
      .then(function (rows) {
        state.rows = rows || [];
        state.anchor = pickAnchor(state.rows, state.opts.date);
        if (!state.anchor) { fail("No ithio_daily rows yet \u2014 the bot writes one at each EOD."); return; }
        render();
        applyScale();
        markActive();
      })
      .catch(function (e) { fail("Could not load rows: " + ((e && e.message) || e)); });
  }

  return {
    DEFAULT_CAPITAL: DEFAULT_CAPITAL,
    isDay: isDay,
    money: money,
    signedMoney: signedMoney,
    signedPct: signedPct,
    winRate: winRate,
    prettyDay: prettyDay,
    monthLabel: monthLabel,
    normalize: normalize,
    tradingDays: tradingDays,
    pickAnchor: pickAnchor,
    stepDay: stepDay,
    weekBounds: weekBounds,
    periodRows: periodRows,
    cumSeries: cumSeries,
    sparkPath: sparkPath,
    analyze: analyze,
    equitySeries: equitySeries,
    stripBars: stripBars,
    candleSeries: candleSeries,
    candleLabel: candleLabel,
    isoWeek: isoWeek,
    lakhLabel: lakhLabel,
    drawCandles: drawCandles,
    demoCandles: demoCandles,
    CANDLE_MAX: CANDLE_MAX,
    lastRowDate: lastRowDate,
    monthStats: monthStats,
    monthList: monthList,
    monthGrid: monthGrid,
    lastDayInMonth: lastDayInMonth,
    prettyMonth: prettyMonth,
    periodStats: periodStats,
    periodBounds: periodBounds,
    monthBounds: monthBounds,
    allTimeCount: allTimeCount,
    prettyRange: prettyRange,
    DEFAULT_START_CAPITAL: DEFAULT_START_CAPITAL,
    resolveBlocks: resolveBlocks,
    pickDetail: pickDetail,
    autoFit: autoFit,
    DROP_ORDER: DROP_ORDER,
    BLOCKS: BLOCKS,
    PRESETS: PRESETS,
    DETAIL: DETAIL,
    DEFAULT_DETAIL: DEFAULT_DETAIL,
    DEFAULT_TAG: DEFAULT_TAG,
    readOpts: readOpts,
    toQuery: toQuery,
    pickStyle: pickStyle,
    pickBadge: pickBadge,
    BADGES: BADGES,
    DEFAULT_BADGE: DEFAULT_BADGE,
    PERIOD_CHIP: PERIOD_CHIP,
    STYLES: STYLES,
    STYLE_LABEL: STYLE_LABEL,
    DEFAULT_STYLE: DEFAULT_STYLE,
    init: init
  };


});
