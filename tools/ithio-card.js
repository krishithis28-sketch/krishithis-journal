/* Render ithio-story.html to PNG with Playwright — no server, no VPS, no bot change.
 *
 * Usage:
 *   node tools/ithio-card.js                 # today (IST), both formats
 *   node tools/ithio-card.js 2026-11-13      # a specific session
 *   CARD_DATE=2026-11-13 node tools/ithio-card.js
 *
 * Writes cards/ithio-<date>-9x16.png (1080x1920) and cards/ithio-<date>-1x1.png (1080x1080).
 * Waits for <body data-ready="1"> so a slow Supabase response can't produce a blank card.
 */
const path = require('node:path');
const fs = require('node:fs');

function istToday() {
  // Asia/Kolkata is UTC+5:30 with no DST.
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('playwright is missing — run: npm i playwright && npx playwright install chromium');
    process.exit(2);
  }

  const wanted = (process.argv[2] || process.env.CARD_DATE || istToday()).slice(0, 10);
  const pageUrl = 'file://' + path.join(__dirname, '..', 'ithio-story.html').split(path.sep).join('/');
  const outDir = path.join(__dirname, '..', 'cards');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const written = [];
  const formats = [['story', 1080, 1920, '9x16'], ['square', 1080, 1080, '1x1']];

  for (const [format, w, h, tag] of formats) {
    const ctx = await browser.newContext({
      viewport: { width: w + 80, height: h + 80 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const url = `${pageUrl}?date=${wanted}&period=day&format=${format}&clean=1`;
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });

    // Pin the export geometry: no preview scaling, no clipped holder.
    await page.addStyleTag({
      content: '#stage{transform:none !important} #holder{overflow:visible !important;height:auto !important}',
    });
    await page.waitForTimeout(120);          // let fonts settle

    const card = await page.$('#card');
    const asOf = await page.evaluate(() => {
      const el = document.getElementById('storyDate');
      return el ? el.textContent : '';
    });
    const net = await page.evaluate(() => {
      const el = document.getElementById('heroNet');
      return el ? el.textContent : '';
    });

    const file = path.join(outDir, `ithio-${wanted}-${tag}.png`);
    await card.screenshot({ path: file });
    written.push(`${path.relative(process.cwd(), file)}  (${asOf}, ${net})`);
    await ctx.close();
  }

  await browser.close();
  written.forEach((l) => console.log('wrote', l));
}

main().catch((e) => {
  console.error('card render failed:', (e && e.message) || e);
  process.exit(1);
});
