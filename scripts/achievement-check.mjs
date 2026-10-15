import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const vocabulary = JSON.parse(readFileSync(new URL('../src/vocabulary.json', import.meta.url), 'utf8'));
const words = vocabulary.words;
const chapter = vocabulary.chapters.find(chapter => chapter.id === 'chapter-22');
const pool = words.filter(word => word.chapterId === chapter.id);
const lastWord = pool[0];
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
});
const page = await context.newPage(); const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const output = new URL('../test-results/', import.meta.url); mkdirSync(output, { recursive: true });
const path = name => fileURLToPath(new URL(name, output));
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('sky-lexicon:v1')));
async function ready() { await page.waitForFunction(() => document.querySelector('#typing-input') && !document.querySelector('#typing-input').disabled); }
async function importSeed(seed) {
  writeFileSync(path('achievement-seed.json'), JSON.stringify(seed));
  await page.locator('#settings-button').click();
  await page.locator('#import-progress').setInputFiles(path('achievement-seed.json'));
  await page.waitForFunction(() => !document.querySelector('#dialog').open);
}
async function randomSequence(values) {
  await page.evaluate(values => {
    const fallback = Math.random; let cursor = 0;
    Math.random = () => cursor < values.length ? values[cursor++] : fallback();
  }, values);
}
function progress(correct) { return { correct, errors: 0, lastPracticed: 1, needsHint: false, inNotebook: false, lastInput: '', lastError: null }; }
function contrast(color, background) {
  const luminance = rgb => {
    const linear = rgb.map(value => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const a = luminance(color.match(/[\d.]+/g).slice(0, 3).map(Number)); const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
try {
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
  const seed = await saved(); seed.words = {}; seed.chapters = {}; seed.lastChapter = chapter.id;
  seed.settings = { pace: 'slow', sound: false, phrases: true, showDetails: false };
  for (const word of pool) seed.words[word.key] = progress(word.key === lastWord.key ? 0 : 2);
  await importSeed(seed);
  assert.equal(await page.locator('.island.completed').count(), 0);
  await randomSequence(pool.map(() => .5));
  await page.locator('#start-island').click(); await ready();
  assert.equal(await page.locator('#typing-form').getAttribute('data-word-id'), lastWord.id);
  const initialColors = await page.evaluate(() => ({ english: getComputedStyle(document.querySelector('#leaf-feedback')).color, chinese: getComputedStyle(document.querySelector('#leaf-meaning')).color }));
  assert.ok(contrast(initialColors.english, [136, 183, 118]) > 4.5);
  assert.ok(contrast(initialColors.chinese, [136, 183, 118]) > 4.5);
  await page.locator('#typing-input').fill(lastWord.text.slice(0, 1));
  const typedStyle = await page.locator('.letter-slot.correct').first().evaluate(node => { const style = getComputedStyle(node); return { color: style.color, outline: style.webkitTextStrokeColor, outlineWidth: style.webkitTextStrokeWidth }; });
  const typedColor = typedStyle.color;
  assert.equal(typedColor, 'rgb(139, 220, 255)');
  assert.notEqual(typedColor, initialColors.english);
  assert.ok(contrast(typedStyle.outline, [136, 183, 118]) > 4.5);
  assert.ok(parseFloat(typedStyle.outlineWidth) > 0);
  await page.screenshot({ path: path('game-readable-text.png'), fullPage: true });
  await page.locator('#typing-input').fill(lastWord.text);
  await page.locator('.island-celebration').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.celebrated-island').count(), 1);
  assert.equal(await page.locator('.celebrated-island').getAttribute('data-chapter-id'), chapter.id);
  await page.locator('.island-fireworks').waitFor();
  const pixels = await page.locator('.island-fireworks').evaluate(canvas => canvas.width * canvas.height);
  assert.ok(pixels <= 1_600_000);
  const remaining = await page.locator('#time-remaining').textContent();
  await page.waitForTimeout(850);
  assert.equal(await page.locator('#time-remaining').textContent(), remaining);
  await page.screenshot({ path: path('island-celebration.png'), fullPage: true });
  await page.waitForFunction(() => !document.querySelector('.island-fireworks'), null, { timeout: 6000 });
  assert.equal(await page.locator('.island-celebration').isVisible(), true);
  await page.locator('#celebration-continue').click(); await ready();
  assert.equal(await page.locator('#step-count').textContent(), '1');
  await page.locator('#exit-game').click();
  assert.equal(await page.locator(`#island-${chapter.id}.completed`).count(), 1);
  assert.match(await page.locator(`.chapter-link[data-chapter="${chapter.id}"]`).textContent(), /已点亮/);
  await page.locator(`.chapter-link[data-chapter="${chapter.id}"]`).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path('island-completed-map.png'), fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator(`#island-${chapter.id}.completed`).count(), 1);
  await page.locator('#start-island').click(); await ready();
  const nextId = await page.locator('#typing-form').getAttribute('data-word-id');
  await page.locator('#typing-input').fill(words.find(word => word.id === nextId).text);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.island-celebration').count(), 0);
  await page.locator('#exit-game').click();
  checks.push('guided and Chinese text stays dark; typed letters use visibly different light-blue fill and a dark outline for legibility; a final new word triggers one celebration, pauses the clock and resumes the round');
  checks.push('fireworks canvas is bounded and removes itself; completed map, directory and inspector states persist after reload without replaying fireworks');

  // Put the final unseen word twelfth in the actual weighted selection.
  seed.words[lastWord.key] = progress(0);
  await importSeed(seed);
  let early = 0;
  const values = pool.map(word => {
    const missing = word.key === lastWord.key;
    const score = missing ? .6 : early++ < 11 ? .1 : .9;
    return Math.exp(-score * (missing ? 2 : 1));
  });
  await randomSequence(values);
  await page.locator('#start-island').click(); await ready();
  for (let i = 0; i < 12; i++) {
    const id = await page.locator('#typing-form').getAttribute('data-word-id');
    const word = words.find(word => word.id === id);
    assert.equal(word.key === lastWord.key, i === 11);
    await page.locator('#typing-input').fill(word.text);
  }
  await page.locator('.island-celebration').waitFor({ state: 'visible', timeout: 15000 });
  assert.match(await page.locator('#celebration-continue').textContent(), /本轮回顾/);
  await page.locator('#dialog').press('Escape');
  await page.locator('.result-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.round-word').count(), 12);
  assert.equal(await page.locator('.island-fireworks').count(), 0);
  await page.locator('#result-map').click();
  checks.push('completing the island on jump twelve celebrates first and still opens the full round review, including via Escape');

  const shared = words.find((word, i) => words.findIndex(other => other.key === word.key) !== i);
  const sharedChapters = [...new Set(words.filter(word => word.key === shared.key).map(word => word.chapterId))];
  const sharedSeed = { ...seed, words: {}, chapters: {}, lastChapter: shared.chapterId };
  for (const word of words) sharedSeed.words[word.key] = progress(word.key === shared.key ? 0 : 2);
  sharedSeed.words[shared.key].inNotebook = true;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await importSeed(sharedSeed);
  await page.locator('#nav-notebook').click(); await page.locator('#review-start').click(); await ready();
  await page.locator('#typing-input').fill(shared.text);
  await page.locator('.island-celebration').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.celebrated-island').count(), sharedChapters.length);
  assert.equal(await page.locator('.island-fireworks').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.querySelector('#dialog').getBoundingClientRect().right <= innerWidth), true);
  await page.screenshot({ path: path('island-celebration-mobile.png'), fullPage: true });
  await page.locator('#celebration-map').click();
  await page.locator('#settings-button').click(); await page.locator('#reset-progress').click(); await page.locator('#confirm-reset').click();
  assert.equal(await page.locator('.island.completed').count(), 0);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.island.completed').count(), 0);
  checks.push('a shared final word lights all affected islands, reduced-motion uses the static celebration, mobile layout fits, and reset clears achievement highlights');
  assert.deepEqual(errors, []);
  writeFileSync(path('achievement-report.json'), JSON.stringify({ checks, contrast: { initialColors, typedColor, typedStyle, sampleLeafFill: '#88b776' }, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path('achievement-failure.png'), fullPage: true });
  console.error('PAGE ERRORS:', errors); throw error;
} finally { await browser.close(); }
