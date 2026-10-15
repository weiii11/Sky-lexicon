import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const vocabulary = JSON.parse(readFileSync(new URL('../src/vocabulary.json', import.meta.url), 'utf8'));
const unique = [...new Map(vocabulary.words.map(word => [word.key, word])).values()];
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname) ? route.abort() : route.continue();
});
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const output = new URL('../test-results/', import.meta.url); mkdirSync(output, { recursive: true });
const path = name => fileURLToPath(new URL(name, output));
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('sky-lexicon:v1')));
async function ready() { await page.waitForFunction(() => document.querySelector('#typing-input') && !document.querySelector('#typing-input').disabled); }
async function importFile(file) {
  await page.locator('#settings-button').click();
  await page.locator('#import-progress').setInputFiles(file);
  await page.waitForFunction(() => !document.querySelector('#dialog').open);
}
try {
  await page.goto(process.env.PREVIEW_URL ?? 'http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.region-label').count(), 0);
  await page.locator('#show-explored').click();
  assert.match(await page.locator('.explored-dialog').textContent(), /旅程才刚刚开始/);
  assert.equal(await page.locator('#explored-review').isDisabled(), true);
  await page.locator('#close-explored').click();
  checks.push('overlapping region labels removed; empty explored list is usable');

  const seed = await saved();
  seed.settings = { pace: 'slow', sound: false, phrases: false, showDetails: false };
  seed.lastChapter = 'chapter-22';
  seed.chapters['chapter-22'] = { rounds: 2, completed: 1, bestSteps: 12 };
  for (const word of unique) seed.words[word.key] = { correct: 1, errors: 0, lastPracticed: 1, needsHint: false, inNotebook: false, lastInput: '', lastError: null };
  seed.words[unique[0].key].inNotebook = true; seed.words[unique[0].key].errors = 1;
  writeFileSync(path('progress-ui-seed.json'), JSON.stringify(seed));
  await page.evaluate(({ text }) => {
    localStorage.setItem('unrelated-preference', 'keep');
    localStorage.setItem('lt_mistakes', JSON.stringify({ [text]: { count: 7 } }));
  }, { text: unique[0].text });
  await importFile(path('progress-ui-seed.json'));
  await page.locator('#show-explored').click();
  assert.equal(await page.locator('.explored-dialog h2 small').textContent(), '3,592');
  assert.equal(await page.locator('.explored-word').count(), 40);
  assert.match(await page.locator('#explored-page-info').textContent(), /第 1 \/ 90 页/);
  const firstKeys = await page.locator('.explored-word').evaluateAll(nodes => nodes.map(node => node.dataset.wordKey));
  await page.locator('#explored-next').click();
  const nextKeys = await page.locator('.explored-word').evaluateAll(nodes => nodes.map(node => node.dataset.wordKey));
  assert.equal(firstKeys.some(key => nextKeys.includes(key)), false);
  await page.locator('#explored-chapter').selectOption('chapter-02');
  await page.locator('.explored-word summary').first().click();
  assert.match(await page.locator('.explored-word[open] .review-word-meta').textContent(), /植物研究/);
  await page.locator('#explored-search').fill('no_such_vocabulary_123');
  assert.equal(await page.locator('.explored-word').count(), 0);
  assert.equal(await page.locator('#explored-review').isDisabled(), true);
  await page.locator('#explored-chapter').selectOption('');
  const chosen = unique.find(word => !word.isPhrase && unique.filter(other => `${other.text} ${other.meaning}`.toLowerCase().includes(word.text.toLowerCase())).length === 1);
  await page.locator('#explored-search').fill(chosen.text);
  assert.equal(await page.locator('.explored-word').count(), 1);
  await page.locator('.explored-word summary').click();
  assert.equal(await page.locator('.explored-word .review-meaning').textContent(), chosen.meaning);
  await page.screenshot({ path: path('explored-desktop.png'), fullPage: true });
  checks.push('3,592 learned words remain accessible with 40-row pages, deduplication, theme and text filters, and expandable full notes');

  await page.locator('.explored-word-review').click(); await ready();
  assert.match(await page.locator('.game-title h1').textContent(), /已探索词汇复习/);
  for (let i = 0; i < 12; i++) {
    const id = await page.locator('#typing-form').getAttribute('data-word-id');
    assert.equal(vocabulary.words.find(word => word.id === id).key, chosen.key);
    await page.locator('#typing-input').fill(chosen.text);
    await page.waitForTimeout(250);
  }
  await page.locator('.result-dialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.round-word').count(), 1);
  await page.locator('.round-word summary').click();
  assert.equal(await page.locator('.review-meaning').textContent(), chosen.meaning);
  await page.locator('#play-again').click(); await ready();
  assert.match(await page.locator('.game-title h1').textContent(), /已探索词汇复习/);
  const restartedId = await page.locator('#typing-form').getAttribute('data-word-id');
  assert.equal(vocabulary.words.find(word => word.id === restartedId).key, chosen.key);
  await page.locator('#exit-game').click();
  checks.push('one-word review, round notes and play-again keep the selected learned-word pool');

  await page.locator('#show-explored').click();
  await page.locator('#explored-chapter').selectOption('chapter-22');
  await page.locator('#explored-review').click(); await ready();
  const allowed = new Set(vocabulary.words.filter(word => word.chapterId === 'chapter-22').map(word => word.key));
  for (let i = 0; i < 3; i++) {
    const id = await page.locator('#typing-form').getAttribute('data-word-id');
    const word = vocabulary.words.find(word => word.id === id);
    assert.equal(allowed.has(word.key), true);
    assert.equal(word.chapterId, 'chapter-22');
    await page.locator('#typing-input').fill(word.text); await page.waitForTimeout(250);
  }
  await page.locator('#exit-game').click();
  assert.equal((await saved()).chapters['chapter-22'].rounds, 2);
  await page.locator('#show-explored').click();
  const phrase = unique.find(word => word.isPhrase);
  await page.locator('#explored-search').fill(phrase.text);
  await page.locator(`.explored-word[data-word-key="${phrase.key}"] summary`).click();
  await page.locator(`.explored-word[data-word-key="${phrase.key}"] .explored-word-review`).click(); await ready();
  const phraseId = await page.locator('#typing-form').getAttribute('data-word-id');
  assert.equal(vocabulary.words.find(word => word.id === phraseId).key, phrase.key);
  await page.locator('#exit-game').click();
  checks.push('explicit review includes previously learned phrases even when ordinary chapter phrase practice is disabled');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#nav-explored').click();
  await page.locator('.explored-word summary').first().click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('#dialog').getBoundingClientRect().right <= innerWidth), true);
  await page.screenshot({ path: path('explored-mobile.png'), fullPage: true });
  await page.locator('#close-explored').click();
  await page.setViewportSize({ width: 1440, height: 960 });
  checks.push('filtered review stays inside its theme without changing island round counts; mobile entry and layout work');

  await page.locator('#settings-button').click();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-progress').click();
  await (await downloadPromise).saveAs(path('progress-reset-backup.json'));
  const beforeReset = await saved();
  await page.locator('#reset-progress').click();
  assert.equal(await page.locator('#cancel-reset').evaluate(node => node === document.activeElement), true);
  assert.deepEqual(await saved(), beforeReset);
  await page.screenshot({ path: path('reset-confirmation.png'), fullPage: true });
  await page.locator('#cancel-reset').click();
  assert.deepEqual(await saved(), beforeReset);
  await page.locator('#reset-progress').click();
  await page.locator('#confirm-reset').click();
  let reset = await saved();
  assert.deepEqual(reset.words, {}); assert.deepEqual(reset.chapters, {});
  assert.deepEqual(reset.settings, beforeReset.settings); assert.equal(reset.lastChapter, 'chapter-01');
  assert.equal(await page.locator('#notebook-count').textContent(), '0');
  assert.match(await page.locator('#explored-count').textContent(), /^0 /);
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual((await saved()).words, {});
  assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-preference')), 'keep');
  await importFile(path('progress-reset-backup.json'));
  assert.deepEqual((await saved()).words, beforeReset.words);
  checks.push('reset needs confirmation; cancelling preserves progress; confirmed reset persists while preserving preferences and unrelated data; export restores it');

  await page.locator('#start-island').click(); await ready();
  await page.locator('#typing-input').fill('wrong_answer'); await page.locator('#typing-input').press('Enter');
  await page.locator('#settings-button').click(); await page.locator('#reset-progress').click(); await page.locator('#confirm-reset').click();
  await page.waitForTimeout(1000); await page.reload({ waitUntil: 'networkidle' });
  reset = await saved(); assert.deepEqual(reset.words, {}); assert.deepEqual(reset.chapters, {});
  checks.push('reset during an active round stops gameplay and prevents delayed callbacks from restoring old history');
  assert.deepEqual(errors, []);
  writeFileSync(path('progress-ui-report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path('progress-ui-failure.png'), fullPage: true });
  console.error('PAGE ERRORS:', errors); throw error;
} finally { await browser.close(); }
