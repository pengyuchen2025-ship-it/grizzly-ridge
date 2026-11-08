// 逐帧录制宣传片镜头。
//   node trailer/record.js [--preview] [--every N] shotA shotB ...
// 需要先在仓库根目录运行 `python3 -m http.server 8000`。
// 输出：trailer/build/shots/<镜头>/0001.jpg … 以及 <镜头>.json（音效事件 + 警笛/直升机音量曲线）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const preview = args.includes('--preview');
const everyIdx = args.indexOf('--every');
const every = everyIdx >= 0 ? +args[everyIdx + 1] : (preview ? 15 : 1);
const names = args.filter((a, i) => !a.startsWith('--') && !(everyIdx >= 0 && i === everyIdx + 1));
const W = preview ? 960 : 1920, H = preview ? 540 : 1080, PX = preview ? 1 : 2;
const OUT = path.join(__dirname, 'build', preview ? 'preview' : 'shots');
const shotsSrc = fs.readFileSync(path.join(__dirname, 'shots.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  for (const name of names) {
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.log(`[${name}] PAGEERR`, e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log(`[${name}]`, m.text()); });
    const seed = 7; // same city every time
    await page.goto(`http://localhost:8000/?rec=1&px=${PX}&seed=${seed}`);
    await page.waitForFunction(() => window.__rec && !document.getElementById('start-btn').disabled, null, { timeout: 180000 });
    await page.addScriptTag({ content: shotsSrc });
    const frames = await page.evaluate((n) => { document.body.classList.add('clean'); window.__game.start(); return SHOTS.begin(n); }, name);
    const dir = path.join(OUT, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const loops = [];
    for (let i = 0; i < frames; i++) {
      const capture = i % every === 0 || i === frames - 1;
      const lv = await page.evaluate(([i, cap]) => { __rec.skipRender = !cap; SHOTS.tick(i); __rec.step(1); return __rec.loops; }, [i, capture]);
      loops.push(lv.map((v) => +v.toFixed(3)));
      if (capture) await page.screenshot({ path: path.join(dir, `${String(preview ? i : i + 1).padStart(4, '0')}.jpg`), type: 'jpeg', quality: preview ? 80 : 93 });
    }
    const events = await page.evaluate(() => __rec.events.filter((e) => e.t >= SHOTS.t0));
    const t0rec = await page.evaluate(() => SHOTS.t0);
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ fps: 30, frames, events: events.map((e) => ({ ...e, t: +(e.t - t0rec).toFixed(4) })), loops }));
    await page.close();
    console.log(`${name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (preview) {
      const { execSync } = require('child_process');
      const n = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length; const cols = 4, rows = Math.ceil(n / cols);
      execSync(`ffmpeg -v error -y -pattern_type glob -i '${dir}/*.jpg' -vf "scale=480:-1,tile=${cols}x${rows}:padding=4" -frames:v 1 '${OUT}/${name}_sheet.jpg'`);
    }
  }
  await browser.close();
})();
