import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(process.argv[2], { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(1500);
const links = await p.evaluate(() => [...document.querySelectorAll('a')].map(a => a.innerText.trim() + '\t' + a.href));
console.log(links.join('\n')); await b.close();
