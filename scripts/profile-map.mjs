import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE, args: ['--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
});
const page = await context.newPage();
try {
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => [...document.querySelectorAll('.island-art')].slice(0, 3).every(image => image.complete && image.naturalWidth));
  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  const initial = await page.evaluate(() => {
    const images = [...document.querySelectorAll('.island-art')];
    const unique = [...new Map(images.filter(img => img.naturalWidth > 1).map(img => [img.currentSrc, { url: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight }])).values()];
    return { nodes: images.length, decodedIslands: unique, estimatedIslandDecodeMiB: unique.reduce((sum, img) => sum + img.width * img.height * 4 / 1048576, 0), activeAnimations: images.filter(img => getComputedStyle(img).animationPlayState === 'running').length };
  });
  const frameTimes = await page.evaluate(() => new Promise(resolve => {
    const times = []; let previous = 0;
    function step(now) { if (previous) times.push(now - previous); previous = now; if (times.length < 120) requestAnimationFrame(step); else resolve(times); }
    requestAnimationFrame(step);
  }));
  const performance = await client.send('Performance.getMetrics');
  const metrics = Object.fromEntries(performance.metrics.map(entry => [entry.name, entry.value]));
  const system = await browser.newBrowserCDPSession();
  const processes = (await system.send('SystemInfo.getProcessInfo')).processInfo;
  let memory = { available: false };
  if (process.platform === 'win32') {
    try {
      const ids = processes.map(p => Number(p.id)).filter(Number.isSafeInteger);
      const rows = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,PrivateMemorySize64,WorkingSet64 | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true }));
      const entries = Array.isArray(rows) ? rows : [rows];
      memory = { available: true, processCount: entries.length, privateMiB: entries.reduce((sum, p) => sum + p.PrivateMemorySize64 / 1048576, 0), workingSetMiB: entries.reduce((sum, p) => sum + p.WorkingSet64 / 1048576, 0), note: 'Sum of the isolated browser processes reported by CDP, not total system RAM or GPU VRAM.' };
    } catch (error) { memory = { available: false, reason: error.message.slice(0, 150) }; }
  }
  // Visit both map axes, including the far-right islands outside the first view.
  for (const island of await page.locator('.island').all()) {
    await island.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  const visited = await page.evaluate(() => {
    const unique = new Map([...document.querySelectorAll('.island-art')].filter(img => img.naturalWidth > 1).map(img => [img.currentSrc, img]));
    return { loadedUniqueIslandsAfterScroll: unique.size, estimatedIslandDecodeMiBAfterScroll: [...unique.values()].reduce((sum, img) => sum + img.naturalWidth * img.naturalHeight * 4 / 1048576, 0) };
  });
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const report = { label: process.env.PROFILE_LABEL ?? 'current', viewport: '1440x960', ...initial, ...visited,
    jsHeapMiB: metrics.JSHeapUsedSize / 1048576,
    animationFrames: { samples: frameTimes.length, meanMs: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length, p95Ms: sorted[Math.floor(sorted.length * 0.95)], over50ms: frameTimes.filter(n => n > 50).length },
    isolatedBrowserMemory: memory,
    scope: 'One local desktop Edge headless run; image decode is an RGBA estimate, not browser total memory. No low-end/mobile hardware guarantee.' };
  mkdirSync(new URL('../test-results/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`../test-results/memory-${report.label}.json`, import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
