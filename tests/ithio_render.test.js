/* Executes the real renderIthio()/setIthioPeriod() block from index.html
 * against a tiny DOM stub. Catches missing IDs / wrong formatting / no crash. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('// ---- Ithio card');
const end = html.indexOf('function showLoader');
assert.ok(start >= 0 && end > start, 'could not locate the Ithio script block');

const els = {};
const el = (id) => els[id] || (els[id] = { innerText: '', className: '', title: '' });
global.document = {
  getElementById: el,
  querySelectorAll: () => [{
    getAttribute: () => 'day',
    classList: { toggle: () => {} },
  }],
};
global.window = { IthioMath: require('../ithio.js') };
global.wholeFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});
global.ithioDaily = [{
  trade_date: '2026-10-19', capital: 50000, gross_pnl: 5190.90, charges: 396.90,
  net_pnl: 4794.00, wins: 4, losses: 1,
}];
global.ithioPeriod = 'day';

vm.runInThisContext(
  html.slice(start, end) +
  '\nglobalThis.__ithio = { renderIthio, setIthioPeriod, syncIthioHeight };'
);

__ithio.renderIthio();
assert.ok(el('uiIthioNet').innerText.includes('4,794'), el('uiIthioNet').innerText);
assert.ok(el('uiIthioNet').className.includes('text-brand-ithio-net'));
assert.ok(el('uiIthioReturn').className.includes('pill-pnl'));
assert.strictEqual(el('uiIthioReturn').innerText, '+9.59%');
assert.strictEqual(el('uiIthioDate').innerText, '2026-10-19');
assert.strictEqual(el('uiIthioPeriodChip').innerText, '1 day');
assert.ok(el('uiIthioLatest').innerText.includes('4,794'));
assert.strictEqual(el('uiIthioCapital').innerText, '₹50,000');
assert.strictEqual(el('uiIthioWins').innerText, '4W');
assert.strictEqual(el('uiIthioLosses').innerText, '1L');
assert.ok(el('uiIthioNet').title.includes('Gross'));
assert.ok(el('uiIthioNet').title.includes('charges'));

__ithio.setIthioPeriod('all');
assert.strictEqual(el('uiIthioPeriodChip').innerText, '1 day');
assert.ok(el('uiIthioNet').innerText.includes('4,794'));

__ithio.setIthioPeriod('day');
global.ithioDaily = [];
__ithio.renderIthio();
assert.strictEqual(el('uiIthioNet').innerText, '₹0');
assert.strictEqual(el('uiIthioReturn').innerText, '0.00%');
assert.strictEqual(el('uiIthioDate').innerText, '—');
assert.strictEqual(el('uiIthioPeriodChip').innerText, '—');
assert.strictEqual(el('uiIthioWins').innerText, '0W');
assert.strictEqual(el('uiIthioLosses').innerText, '0L');

// Height sync: Ithio is intentionally 24px shorter than the hero card.
els.portfolioHero = { offsetHeight: 300 };
els.ithioCard = { style: {} };
__ithio.syncIthioHeight();
assert.strictEqual(els.ithioCard.style.minHeight, '276px');

console.log('ithio render: all tests passed');
