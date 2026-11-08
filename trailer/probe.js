const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto('http://localhost:8000/?rec=1&px=2');
  await p.waitForFunction(() => window.__rec && !document.getElementById('start-btn').disabled, null, { timeout: 120000 });
  const info = await p.evaluate(() => {
    const R = __rec; __game.start();
    const bs = R.buildings.map((b) => ({ x0: +b.minX.toFixed(1), x1: +b.maxX.toFixed(1), z0: +b.minZ.toFixed(1), z1: +b.maxZ.toFixed(1), base: +b.base.toFixed(1), top: +b.top.toFixed(1) }));
    return { SPAWN: R.SPAWN, LINES: R.LINES, HALF: R.HALF, gas: { x: R.cityCtx.gasStation?.x, z: R.cityCtx.gasStation?.z }, fire: R.cityCtx.fireSpots.map((f) => [f.x | 0, f.z | 0]), hydrants: R.cityCtx.hydrants.length, nb: bs.length, near: bs.filter((b) => b.base === 0 && Math.hypot((b.x0 + b.x1) / 2 - R.SPAWN.x, (b.z0 + b.z1) / 2 - R.SPAWN.z) < 40), parked: R.cars.map((c) => [c.pos.x | 0, c.pos.z | 0]) };
  });
  console.log(JSON.stringify(info));
  await b.close();
})();
