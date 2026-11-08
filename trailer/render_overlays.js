// 逐帧渲染文字层（透明 PNG）。node trailer/render_overlays.js jobs.json
// jobs: [{ layer, dur, arg, out }]，out 为输出文件夹
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:8000/trailer/overlay.html');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  for (const j of jobs) {
    fs.rmSync(j.out, { recursive: true, force: true }); fs.mkdirSync(j.out, { recursive: true });
    const n = Math.round(j.dur * 30);
    for (let i = 0; i < n; i++) {
      await page.evaluate(([l, t, d, a]) => window.show(l, t, d, a), [j.layer, i / 30, j.dur, j.arg || null]);
      await page.screenshot({ path: path.join(j.out, `${String(i + 1).padStart(4, '0')}.png`), omitBackground: true });
    }
    console.log('overlay', j.layer, j.arg || '', n, 'frames');
  }
  await browser.close();
})();
