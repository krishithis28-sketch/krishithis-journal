/* Runs the real ithio-story.js render() against a DOM stub built from the real
 * ithio-story.html. Catches missing ids, wrong formatting and render crashes
 * without a browser or network. Run: node tests/ithio_story_render.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'ithio-story.html'), 'utf8');
const htmlIds = Array.from(html.matchAll(/\bid="([^"]+)"/g)).map((m) => m[1]);

const SVG_LIKE = new Set(['sparkLine', 'sparkArea', 'eqLine', 'eqArea']);
const els = {};
function el(id) {
  if (!els[id]) {
    els[id] = {
      id,
      textContent: '',
      className: '',
      style: {},
      attrs: {},
      offsetWidth: id === 'card' ? 1080 : 0,
      offsetHeight: id === 'card' ? 1920 : 0,
      scrollHeight: id === 'card' ? 1920 : 0,
      clientHeight: id === 'card' ? 1920 : 0,
      setAttribute(k, v) {
        this.attrs[k] = v;
        if (k === 'class') this._svgClass = v;
      },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener() {},
      appendChild() {},
      remove() {},
      click() {},
      classList: { toggle() {}, add() {}, remove() {} },
    };
    if (SVG_LIKE.has(id)) {
      // Real SVGElement.className is a read-only SVGAnimatedString; assigning
      // to it throws. Mirror that so the harness can never hide the bug again.
      Object.defineProperty(els[id], 'className', {
        get() { return { baseVal: this._svgClass || '' }; },
        set() { throw new TypeError('Cannot set property className of #<SVGElement> which has only a getter'); },
        configurable: true,
      });
    }
  }
  return els[id];
}

const bodyClasses = [];
global.document = {
  getElementById: el,
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => ({ style: {}, click() {}, remove() {}, href: '', download: '' }),
  body: {
    dataset: {},
    classList: {
      toggle(name, on) { bodyClasses.push([name, !!on]); },
      add() {},
      remove() {},
      contains() { return false; },
    },
    appendChild() {},
  },
};
global.window = {
  IthioMath: require('../ithio.js'),
  location: { search: '?date=2026-11-13' },
  innerWidth: 1400,
  addEventListener() {},
};
global.history = { replaceState() {} };

const ROWS = [
  { trade_date: '2026-11-05', capital: 50000, gross_pnl: 900, charges: 90, net_pnl: 810, wins: 2, losses: 1 },
  { trade_date: '2026-11-06', capital: 50000, gross_pnl: -400, charges: 80, net_pnl: -480, wins: 0, losses: 2 },
  { trade_date: '2026-11-10', capital: 50000, gross_pnl: 520, charges: 70, net_pnl: 450, wins: 2, losses: 1 },
  { trade_date: '2026-11-12', capital: 50000, gross_pnl: 300, charges: 60, net_pnl: 240, wins: 1, losses: 0 },
  { trade_date: '2026-11-13', capital: 50000, gross_pnl: 940, charges: 92, net_pnl: 848, wins: 3, losses: 1 },
];
let fetchedUrl = '';
global.fetch = (url) => {
  fetchedUrl = url;
  return Promise.resolve({ ok: true, json: () => Promise.resolve(ROWS) });
};

require('../ithio-story.js');   // auto-inits in the stub DOM

setTimeout(() => {
  /* every id the renderer writes to must exist in the HTML */
  const required = [
    'storyDate', 'storyChip', 'heroNet', 'heroPct', 'winsN', 'lossesN', 'wrN',
    'daysN', 'sessN', 'sparkNote', 'sparkLine', 'sparkArea',
    'monthBtn', 'monthName', 'monthMenu', 'mtdNet', 'mtdPct', 'allLabel', 'allNet', 'allPct',
    'dayLabel', 'card', 'stage', 'holder', 'bar',
    'hint', 'prevDay', 'nextDay', 'styleSel', 'downloadBtn', 'gradPos', 'gradNeg',
    // sections
    'blkTag', 'blkEquity', 'blkStrip', 'blkRisk', 'blkRisk2', 'blkStreaks',
    'blkCost', 'blkSpark', 'blkRows', 'detailBtn',
    'blkCalendar', 'calLabel', 'calNote', 'calDow', 'calGrid',
    'blkMonthBars', 'mbars', 'mbNote', 'blkBestWorst', 'bwBest', 'bwBestDay',
    'bwWorst', 'bwWorstDay', 'blkGoal', 'goalLabel', 'goalPct', 'goalFill', 'goalFoot',
    'blkDonut', 'ringVal', 'ringPct',
    'blkCandles', 'candleSvg',
    'footBadge', 'wmAt', 'wmHandle',
    'blkHero', 'blkStats', 'blkJournal', 'jCapital', 'jLatest', 'jLatestPct',
    'jNet', 'jWins', 'jLosses',
    'tagLine', 'eqLabel', 'eqNote', 'eqLine', 'eqArea', 'eqGradPos', 'eqGradNeg',
    'stripBars', 'stripLabel', 'stripNote', 'stripFrom', 'stripTo',
    'pfV', 'ddV', 'sharpeV', 'rrV', 'greenV', 'avgV', 'streakLine', 'costLine',
  ];
  required.forEach((id) => assert.ok(htmlIds.includes(id), `missing id in HTML: ${id}`));

  /* removed on request: the LATEST DAY row, the capital footer line,
     the ring captions, the "since …" subline and the watermark block */
  ['rowLatest', 'latestNet', 'latestPct', 'latestLabel', 'footCapital', 'jPct', 'jWL',
   'ringWL', 'ringSub', 'wmSub', 'blkWatermark', 'cdUnit', 'candleNote']
    .forEach((id) => {
      assert.ok(!htmlIds.includes(id), `${id} should no longer exist in the HTML`);
    });

  /* every template the JS offers must exist as a CSS block in the page */
  require('../ithio-story.js');
  const Story = require('../ithio-story.js');
  Story.STYLES.forEach((s) => {
    assert.ok(
      html.includes(`body[data-style="${s}"]`),
      `missing CSS token block for template "${s}"`
    );
    assert.ok(html.includes(`<option value="${s}">`), `missing picker option "${s}"`);
  });

  /* the query really asks for exactly the six columns the card needs */
  assert.ok(fetchedUrl.includes('/rest/v1/ithio_daily?select='), fetchedUrl);
  assert.ok(fetchedUrl.includes('order=trade_date.asc'), fetchedUrl);

  assert.strictEqual(global.document.body.dataset.ready, '1');
  assert.strictEqual(global.document.body.dataset.style, 'bloom');

  /* day card for 2026-11-13 (₹1,00,000 compounding base) */
  assert.strictEqual(el('storyDate').textContent, '13 Nov 2026');
  assert.strictEqual(el('storyChip').textContent, 'DAY');
  assert.strictEqual(el('heroNet').textContent, '+₹848');
  assert.strictEqual(el('heroNet').className, 'heroNet pos');
  // 848 on a starting equity of 100000 + (810-480+450+240) = 101020
  assert.strictEqual(el('heroPct').textContent, '+0.84%');
  assert.strictEqual(el('heroPct').className, 'pill pos');

  assert.strictEqual(el('winsN').textContent, '8W');
  assert.strictEqual(el('lossesN').textContent, '5L');
  assert.strictEqual(el('wrN').textContent, '62%');
  assert.strictEqual(el('daysN').textContent, '5 days');

  assert.strictEqual(el('monthName').textContent, 'Nov 2026');
  assert.strictEqual(el('mtdNet').textContent, '+₹1,868');
  assert.strictEqual(el('mtdPct').textContent, '+1.87%');     // 1868 / 100000
  assert.ok(el('monthMenu').innerHTML.includes('data-month="2026-11"'),
    el('monthMenu').innerHTML);
  assert.strictEqual(el('allLabel').textContent, 'ALL TIME · 5 DAYS');
  assert.strictEqual(el('allNet').textContent, '+₹1,868');
  assert.strictEqual(el('allPct').textContent, '+1.87%');

  assert.ok(el('sparkLine').attrs.d.startsWith('M'), el('sparkLine').attrs.d);
  assert.strictEqual(el('sparkLine').attrs.class, 'line pos');
  assert.ok(el('sparkArea').attrs.d.endsWith('Z'), el('sparkArea').attrs.d);
  assert.strictEqual(el('sessN').textContent, '5');
  assert.ok(el('sparkNote').textContent.includes('since 5 Nov 2026'), el('sparkNote').textContent);

  assert.strictEqual(el('dayLabel').textContent, '13 Nov 2026');
  assert.strictEqual(el('styleSel').value, 'bloom');

  /* ---- sections: default is the journal-card replica ---- */
  assert.strictEqual(global.document.body.dataset.detail, 'card');
  assert.strictEqual(el('detailBtn').textContent, 'CARD');
  ['blkJournal', 'blkCalendar', 'blkDonut', 'blkCandles', 'blkRows'].forEach((id) => {
    assert.strictEqual(el(id).hidden, false, `${id} should be visible in card mode`);
  });
  ['blkTag', 'blkHero', 'blkStats', 'blkEquity', 'blkMonthBars', 'blkBestWorst',
   'blkGoal', 'blkStrip', 'blkRisk', 'blkRisk2', 'blkStreaks', 'blkCost',
   'blkSpark'].forEach((id) => {
    assert.strictEqual(el(id).hidden, true, `${id} should be hidden in card mode`);
  });

  /* win-rate ring: percentage only, inside the ring */
  assert.strictEqual(el('ringPct').textContent, '62%');
  assert.strictEqual(el('ringVal').attrs['stroke-dasharray'], '301.59');
  assert.ok(Number(el('ringVal').attrs['stroke-dashoffset']) > 0);

  /* equity candles drawn into the svg: axes, not a ₹1L line */
  const candleHtml = el('candleSvg').innerHTML;
  assert.strictEqual((candleHtml.match(/class="body /g) || []).length, 5, 'one body per session');
  assert.strictEqual((candleHtml.match(/class="wick /g) || []).length, 5, 'one wick per session');
  assert.strictEqual((candleHtml.match(/class="ax"/g) || []).length, 2, 'x axis + y axis');
  assert.strictEqual((candleHtml.match(/class="yl"/g) || []).length, 3, 'min / mid / max labels');
  assert.ok(!candleHtml.includes('class="base"'), 'the ₹1L line is gone');
  assert.ok(candleHtml.includes('class="body up"'));
  assert.ok(candleHtml.includes('class="body down"'));

  /* the handle is split so the "@" and the "_tail" can carry accent colours */
  assert.strictEqual(el('wmAt').textContent, '@');
  assert.ok(el('wmHandle').innerHTML.includes('class="bHead"'));
  assert.ok(el('wmHandle').innerHTML.includes('class="bTail"'));
  assert.ok(el('wmHandle').innerHTML.includes('the_wounded'));
  assert.ok(el('wmHandle').innerHTML.includes('_trader'));
  assert.strictEqual(el('footBadge').hidden, false);

  /* calendar heatmap for the as-of month (back on the card) */
  assert.strictEqual(el('calLabel').textContent, 'NOV 2026');
  assert.ok(el('calNote').innerHTML.includes('4 green'), el('calNote').innerHTML);
  assert.ok(el('calNote').innerHTML.includes('1 red'), el('calNote').innerHTML);
  assert.ok(el('calNote').innerHTML.includes('class="cg"') &&
            el('calNote').innerHTML.includes('class="cr"'), 'green/red spans');
  assert.ok(!el('calNote').innerHTML.includes('₹'), 'month total removed from the header');
  assert.strictEqual((el('calGrid').innerHTML.match(/calCell/g) || []).length, 36);
  assert.ok(el('calGrid').innerHTML.includes('calCell pos'), 'green day cell');
  assert.ok(el('calGrid').innerHTML.includes('calCell neg'), 'red day cell');
  assert.strictEqual((el('calDow').innerHTML.match(/<span>/g) || []).length, 7);

  /* the replica: compounding capital, % under LATEST, brand NET, coloured W/L */
  assert.strictEqual(el('jCapital').textContent, '₹1,01,868');
  assert.strictEqual(el('jLatest').textContent, '+₹848');
  assert.strictEqual(el('jLatest').className, 'jv pos');
  assert.strictEqual(el('jLatestPct').textContent, '+0.84%');
  assert.strictEqual(el('jLatestPct').className, 'pill pos');
  assert.strictEqual(el('jNet').textContent, '+₹848');
  assert.strictEqual(el('jNet').className, 'jv big net');
  assert.strictEqual(el('jWins').textContent, '8W');
  assert.strictEqual(el('jLosses').textContent, '5L');

  /* tag line */
  assert.strictEqual(el('tagLine').textContent, Story.DEFAULT_TAG);

  /* equity curve of the whole history */
  assert.ok(el('eqLabel').textContent.startsWith('EQUITY CURVE \u00b7 SINCE 5 NOV 2026'),
    el('eqLabel').textContent);
  assert.strictEqual(el('eqNote').textContent, 'MAX DD \u2212\u20b9480 (\u22120.5%)');
  assert.ok(el('eqLine').attrs.d.startsWith('M'), el('eqLine').attrs.d);
  assert.ok(el('eqArea').attrs.d.endsWith('Z'));

  /* session strip: 5 bars, biggest day full height */
  const barsHtml = el('stripBars').innerHTML;
  assert.strictEqual((barsHtml.match(/class="bar/g) || []).length, 5, barsHtml);
  assert.ok(barsHtml.includes('--h:100'), barsHtml);
  assert.ok(barsHtml.includes('bar neg'), 'the losing day must be negative');
  assert.strictEqual(el('stripLabel').textContent, 'LAST 5 SESSIONS');
  assert.strictEqual(el('stripNote').textContent, '4G \u00b7 1R');
  assert.ok(el('stripFrom').textContent.startsWith('5 Nov'));
  assert.ok(el('stripTo').textContent.startsWith('13 Nov'));

  /* risk tiles */
  assert.strictEqual(el('pfV').textContent, '4.89');
  assert.strictEqual(el('pfV').className, 'n pos');
  assert.strictEqual(el('ddV').textContent, '\u22120.5%');   // 480 / ₹1,00,000 base
  assert.strictEqual(el('sharpeV').textContent, '10.98');
  assert.strictEqual(el('rrV').textContent, '1.22\u00d7');
  assert.strictEqual(el('avgV').textContent, '+\u20b9374');
  assert.strictEqual(el('greenV').textContent, '80%');

  /* streaks + cost drag */
  assert.strictEqual(el('streakLine').textContent,
    '3 GREEN IN A ROW \u00b7 LONGEST 3G / 1R');
  assert.strictEqual(el('streakLine').className, 'note pos');
  assert.strictEqual(el('costLine').textContent,
    'CHARGES \u20b9392 (14.7% OF GROSS) \u00b7 13 TRADES \u00b7 EXP +\u20b9144');

  /* auto-fit: a fitting card drops nothing, an overflowing one sheds sections
     from the bottom of the priority list instead of clipping the footer */
  assert.deepStrictEqual(Story.autoFit(), [], 'a 1920-high card fits, nothing dropped');
  el('blkCost').hidden = false;
  el('blkStreaks').hidden = false;
  el('blkRisk2').hidden = false;
  el('card').clientHeight = 400;
  const dropped = Story.autoFit();
  // order is respected, already-hidden blocks are skipped, and it stops only
  // when nothing droppable is left (the stub never shrinks, so it goes all the way)
  assert.deepStrictEqual(dropped, ['cost', 'streaks', 'risk2', 'candles', 'donut', 'calendar']);
  assert.ok(dropped.indexOf('spark') < 0 && dropped.indexOf('rows') < 0);
  assert.strictEqual(el('blkCost').hidden, true);
  assert.strictEqual(el('blkStreaks').hidden, true);
  assert.strictEqual(el('blkRisk2').hidden, true);
  el('card').clientHeight = 1920;

  /* the journal links to the card, and the card links back */
const journalHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(journalHtml.includes('href="ithio-story.html"'),
  'the journal header should link to the share card');
assert.ok(html.includes('href="index.html"'), 'the card should link back to the journal');

console.log('ithio story render: all tests passed');
}, 30);
