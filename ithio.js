/* Ithio — daily EOD ledger math for the journal card.
 *
 * The bot writes one row per trading day to Supabase (`ithio_daily`). The card
 * only needs to aggregate those rows for the selected period, so all of the
 * period logic lives here in one pure function and is unit-tested in Node.
 *
 * Amounts are already NET of (estimated) charges as written by the bot.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IthioMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_CAPITAL = 50000;

  function num(v, fallback) {
    if (v === null || v === undefined || v === "") return fallback;
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function round2(v) {
    return Math.round((num(v, 0) + Number.EPSILON) * 100) / 100;
  }

  function round4(v) {
    return Math.round((num(v, 0) + Number.EPSILON) * 10000) / 10000;
  }

  function normalizeRows(rows) {
    var out = [];
    var src = rows || [];
    for (var i = 0; i < src.length; i++) {
      var x = src[i] || {};
      var day = String(x.trade_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
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

  function isoWeekBounds(day) {
    // Monday..Sunday for the ISO week containing `day` (YYYY-MM-DD), UTC-safe.
    var d = new Date(String(day).slice(0, 10) + "T00:00:00Z");
    var dow = d.getUTCDay();              // 0 = Sunday
    var diff = (dow + 6) % 7;             // days since Monday
    var start = new Date(d.getTime());
    start.setUTCDate(d.getUTCDate() - diff);
    var end = new Date(start.getTime());
    end.setUTCDate(start.getUTCDate() + 6);
    var fmt = function (x) { return x.toISOString().slice(0, 10); };
    return [fmt(start), fmt(end)];
  }

  function uniqueDays(rows) {
    var seen = {}, n = 0;
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i].trade_date;
      if (!seen[d]) { seen[d] = 1; n++; }
    }
    return n;
  }

  function aggregate(rows) {
    var gross = 0, charges = 0, net = 0, wins = 0, losses = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      gross += r.gross_pnl;
      charges += r.charges;
      net += r.net_pnl;
      wins += r.wins;
      losses += r.losses;
    }
    return {
      gross: round2(gross),
      charges: round2(charges),
      net: round2(net),
      wins: wins,
      losses: losses,
      days: uniqueDays(rows)
    };
  }

  function computeSummary(rows, period, anchorDate) {
    var all = normalizeRows(rows);
    var anchor = anchorDate ? String(anchorDate).slice(0, 10) : (all.length ? all[all.length - 1].trade_date : null);
    if (anchor && !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) anchor = null;

    var selected = [], start = null, end = null;
    if (!anchor) {
      selected = [];
    } else if (period === "all") {
      selected = all.slice();
      if (selected.length) { start = selected[0].trade_date; end = selected[selected.length - 1].trade_date; }
    } else if (period === "month") {
      var mk = anchor.slice(0, 7);
      selected = all.filter(function (r) { return r.trade_date.slice(0, 7) === mk; });
      if (selected.length) { start = mk + "-01"; end = selected[selected.length - 1].trade_date; }
    } else if (period === "week") {
      var b = isoWeekBounds(anchor);
      start = b[0]; end = b[1];
      selected = all.filter(function (r) { return r.trade_date >= start && r.trade_date <= end; });
    } else {
      selected = all.filter(function (r) { return r.trade_date === anchor; });
      start = anchor; end = anchor;
    }

    var periodAgg = aggregate(selected);
    var overall = aggregate(all);
    var latestRows = anchor ? all.filter(function (r) { return r.trade_date === anchor; }) : [];
    var latest = aggregate(latestRows);
    var capital = all.length ? all[all.length - 1].capital : DEFAULT_CAPITAL;
    if (!(capital > 0)) capital = DEFAULT_CAPITAL;
    var returnPct = capital > 0 ? round4(periodAgg.net / capital * 100) : 0;

    return {
      period: period,
      asOf: anchor,
      start: start,
      end: end,
      days: periodAgg.days,
      net: periodAgg.net,
      gross: periodAgg.gross,
      charges: periodAgg.charges,
      wins: periodAgg.wins,
      losses: periodAgg.losses,
      capital: capital,
      returnPct: returnPct,
      overall: overall,
      latest: latest,
      rows: selected
    };
  }

  return {
    DEFAULT_CAPITAL: DEFAULT_CAPITAL,
    computeSummary: computeSummary,
    isoWeekBounds: isoWeekBounds,
    normalizeRows: normalizeRows,
    round2: round2,
    round4: round4
  };
});
