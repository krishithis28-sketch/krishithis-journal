/* Headless layout probe: drives Edge over CDP and reads the ?probe=1 title.
 * Verifies the fixed 1080x1920 card does not overflow its box in any preset. */
const { spawn } = require('node:child_process');
const os = require('node:os');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;

async function main() {
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + os.tmpdir() + '\\edge-cdp-' + Date.now(),
    '--window-size=1400,1700',
    'about:blank',
  ], { stdio: 'ignore' });

  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!ver) { console.log('devtools endpoint never came up'); proc.kill(); process.exit(1); }

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  const send = (method, params) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });

  await send('Page.enable');
  await send('Runtime.enable');

  const cases = [];
  for (const style of ['bloom', 'midnight', 'paper', 'neon', 'broadsheet', 'minimal']) {
    for (const detail of ['card', 'compact', 'pro', 'analyst']) {
      for (const format of ['story', 'square']) {
        cases.push({ style, detail, format });
      }
    }
  }

  let bad = 0;
  for (const c of cases) {
    const url = `http://localhost:8080/ithio-story.html?probe=1&style=${c.style}` +
                `&detail=${c.detail}&format=${c.format}`;
    await send('Page.navigate', { url });
    let title = '';
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 200));
      const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
      title = (r && r.result && r.result.value) || '';
      if (title.indexOf('PROBE') === 0) break;
    }
    const overflow = /overflow=(-?\d+)/.exec(title);
    const over = overflow ? Number(overflow[1]) : null;
    const flag = over === null ? 'NO-TITLE' : (over > 0 ? 'CLIPPED +' + over : 'ok');
    if (over === null || over > 0) bad++;
    console.log(`${flag.padEnd(12)} ${c.style}/${c.detail}/${c.format} :: ${title}`);
  }
  console.log(`\n${cases.length} cases, ${bad} problem(s)`);
  ws.close();
  proc.kill();
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
