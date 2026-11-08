const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8000/?rec=1&px=2', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__rec && !document.getElementById('start-btn').disabled, null, { timeout: 120000 });
  await p.evaluate(() => { document.body.classList.add('clean'); window.__game.start(); });
  for (const px of [2, 1]) {
    await p.evaluate((px) => __rec.setPixel(px), px);
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) { await p.evaluate(() => { __rec.input = { x: 1, z: -0.3 }; __rec.step(1); }); await p.screenshot({ path: `/tmp/claude-0/-home-user-grizzly-ridge/e78a364d-1000-5ee9-967e-4d4895957737/scratchpad/sp${px}_${i}.jpg`, type: 'jpeg', quality: 92 }); }
    console.log('px', px, ((Date.now() - t0) / 10).toFixed(0), 'ms/frame');
  }
  console.log(await p.evaluate(() => JSON.stringify(__rec.events.slice(0, 5))));
  await b.close();
})();
