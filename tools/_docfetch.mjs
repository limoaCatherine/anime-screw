import { chromium } from 'playwright';
const urls = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
for (const u of urls) {
  try {
    await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(6000);
    const t = await p.evaluate(() => (document.querySelector('main') || document.querySelector('article') || document.body || {innerText:''}).innerText);
    console.log('=====', u, '\n', t.slice(0, 14000));
  } catch (e) { console.log('=====', u, 'ERR', e.message); }
}
await b.close();
