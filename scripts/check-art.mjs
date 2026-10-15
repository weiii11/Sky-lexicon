import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const base = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5175/';
const failures = [];
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
});
page.on('response', response => { if (response.url().includes('/assets/') && response.status() >= 400) failures.push(response.url()); });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  const initiallyLoaded = await page.locator('.island-art[src]').count();
  assert.ok(initiallyLoaded < 22, 'The entire map must not load eagerly');
  await page.waitForFunction(() => [...document.querySelectorAll('.island-art[src]')].every(img => img.complete && img.naturalWidth === 512));
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/map-desktop.png', import.meta.url)), fullPage: true });
  for (const island of await page.locator('.island').all()) {
    await island.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
    await page.waitForTimeout(100);
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.island-art')].every(img => img.complete && img.naturalWidth === 512));
  assert.equal(await page.locator('.island-art').evaluateAll(images => new Set(images.map(img => img.currentSrc)).size), 22);
  const paused = await page.locator('.island:not(.in-view) .island-art').evaluateAll(images => images.every(img => getComputedStyle(img).animationPlayState === 'paused'));
  assert.equal(paused, true);
  const chapters = JSON.parse(readFileSync(new URL('../src/vocabulary.json', import.meta.url), 'utf8')).chapters;
  const brief = JSON.parse(readFileSync(new URL('../design/islands/redesign-brief.json', import.meta.url), 'utf8'));
  const themes = Object.fromEntries(brief.prompts.map(p => [p.number, p.theme]));
  Object.assign(themes, { 2: '古树、温室与溪流', 4: '观星台与天球仪', 5: '图书塔与学院花园' });
  // The thumbnails match the actual desktop island size; URL uniqueness alone
  // cannot establish visual distinction, which needs review of this contact sheet.
  await page.setViewportSize({ width: 1548, height: 1050 });
  await page.setContent('<html lang="zh-CN"><meta charset="utf-8"><title>22 座主题岛屿 · 独立地标版</title><style>body{margin:0;padding:36px;background:#f4f5eb;color:#38554c;font:16px "Microsoft YaHei",sans-serif}h1{font-size:28px;font-weight:500;margin:0 0 12px}p{color:#7a8c80;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(6,231px);gap:18px}figure{margin:0;text-align:center;background:#fff8;border-radius:18px;padding:8px}img{width:215px;height:215px;object-fit:contain}figcaption{padding:5px 0 10px;font-size:14px}small{display:block;color:#879584;font-size:11px;margin-top:6px}</style><h1>云间词屿 · 22 座主题岛屿</h1><p>同一种手绘风格，不同的主地标与轮廓 · 下方岛屿按游戏中 215 像素大小展示</p><div class="grid"></div></html>');
  await page.evaluate(({ base, chapters, themes }) => {
    const grid = document.querySelector('.grid');
    for (const chapter of chapters) {
      const figure = document.createElement('figure');
      const image = document.createElement('img'); image.src = new URL(`assets/islands/v2/${chapter.id}.webp`, base).href;
      const caption = document.createElement('figcaption'); caption.textContent = `${String(chapter.number).padStart(2, '0')} · ${chapter.name}`;
      const theme = document.createElement('small'); theme.textContent = themes[chapter.number]; caption.append(theme);
      figure.append(image, caption); grid.append(figure);
    }
  }, { base, chapters, themes });
  await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth === 512));
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/island-themes.png', import.meta.url)), fullPage: true });
  assert.deepEqual(failures, []);
  const report = { revision: 'distinct-landmarks-v2', initiallyLoaded, distinctResourcePaths: 22, imageSize: '512x512', contactSheetIslandCssWidth: 215, visualDistinctness: 'Review island-themes.png at game scale; unique paths do not prove unique visual silhouettes.', offscreenAnimationsPaused: paused, assetFailures: failures };
  writeFileSync(new URL('../test-results/art-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
