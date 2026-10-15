import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ProgressStore, SAVE_KEY } from '../src/progress.ts';
import { TypingSession, normalizeInput, roundTime } from '../src/session.ts';
import type { StorageLike, Word } from '../src/types.ts';
import { letterFeedback } from '../src/typing.ts';
import { islandExploration } from '../src/exploration.ts';

const vocabulary = JSON.parse(readFileSync(new URL('../src/vocabulary.json', import.meta.url), 'utf8'));
const words: Word[] = vocabulary.words;
const word = words[0];
function fixture() {
  const entries = new Map<string, string>();
  const storage: StorageLike = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); } };
  return { entries, storage, progress: new ProgressStore(storage, words) };
}

test('all 22 chapters are represented; no word or phrase was silently dropped', () => {
  assert.equal(vocabulary.chapters.length, 22);
  assert.equal(words.length, 3632);
  assert.equal(new Set(words.map(w => w.key)).size, 3592);
  assert.equal(words.filter(w => w.isPhrase).length, 9);
  assert.equal(new Set(words.map(w => w.id)).size, words.length);
  for (const chapter of vocabulary.chapters) {
    assert.equal(chapter.wordIds.length, words.filter(w => w.chapterId === chapter.id).length);
    assert.ok(chapter.wordIds.length > 0);
  }
  assert.ok(words.every(w => w.meaning && w.text));
});
test('Chinese-only recall begins after the second correct answer', () => {
  const { progress } = fixture();
  progress.correct(word); assert.equal(progress.recall(word), false);
  progress.correct(word); assert.equal(progress.recall(word), true);
});
test('a recall error restores an English hint, then a correct answer restores recall', () => {
  const { progress } = fixture();
  for (let i = 0; i < 2; i++) progress.correct(word);
  progress.mistake(word, 'spelling', 'atmosfere');
  assert.equal(progress.recall(word), false);
  assert.equal(progress.get(word).lastInput, 'atmosfere');
  progress.correct(word);
  assert.equal(progress.recall(word), true);
  assert.equal(progress.notebook().length, 1);
});
test('duplicate words in different chapters share learning progress', () => {
  const { progress } = fixture();
  const duplicate = words.find((w, i) => words.findIndex(x => x.key === w.key) !== i)!;
  const first = words.find(w => w.key === duplicate.key)!;
  progress.correct(first);
  assert.equal(progress.get(duplicate).correct, 1);
  progress.mistake(first, 'timeout', ''); progress.mistake(duplicate, 'spelling', 'x');
  assert.equal(progress.notebook().length, 1);
  assert.equal(progress.get(first).errors, 2);
});
test('save and reload preserve correct counts, errors, settings, and chapter results', () => {
  const { progress, storage } = fixture();
  progress.correct(word); progress.mistake(word, 'boundary', '');
  progress.data.settings.pace = 'fast'; progress.finish(word.chapterId, 9, false);
  const restored = new ProgressStore(storage, words);
  assert.equal(restored.get(word).correct, 1); assert.equal(restored.get(word).errors, 1);
  assert.equal(restored.data.settings.pace, 'fast'); assert.equal(restored.data.chapters[word.chapterId].bestSteps, 9);
});
test('legacy mistakes migrate once without inventing mastery counts', () => {
  const { entries, storage } = fixture();
  entries.delete(SAVE_KEY);
  entries.set('lt_mistakes', JSON.stringify({ [word.text]: { count: 3, meaning: word.meaning } }));
  entries.set('lt_mastered', JSON.stringify([word.text]));
  const imported = new ProgressStore(storage, words);
  assert.equal(imported.get(word).errors, 3); assert.equal(imported.get(word).correct, 0);
  imported.remove(word);
  const restored = new ProgressStore(storage, words); assert.equal(restored.notebook().length, 0);
  assert.ok(entries.has('lt_mistakes'));
});
test('corrupt saved progress does not crash the app', () => {
  const { entries, storage } = fixture(); entries.set(SAVE_KEY, '{broken');
  const progress = new ProgressStore(storage, words);
  assert.equal(progress.get(word).correct, 0); assert.ok(progress.warning);
});
test('storage write failure keeps in-memory progress and reports backup need', () => {
  const progress = new ProgressStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, words);
  progress.correct(word); assert.equal(progress.get(word).correct, 1); assert.match(progress.warning, /导出/);
});
test('import rejects unrelated JSON and sanitizes invalid counters', () => {
  const { progress } = fixture();
  assert.throws(() => progress.import('{"version":9}'));
  progress.import(JSON.stringify({ version: 1, words: { [word.key]: { correct: -1, errors: 'bad', inNotebook: true } } }));
  assert.equal(progress.get(word).correct, 0); assert.equal(progress.get(word).errors, 0);
});
test('removing a word from notebook preserves its learning history', () => {
  const { progress } = fixture(); progress.correct(word); progress.mistake(word, 'timeout', ''); progress.remove(word);
  assert.equal(progress.notebook().length, 0); assert.equal(progress.get(word).correct, 1); assert.equal(progress.get(word).errors, 1);
});
test('case, curly apostrophes, and phrase spaces are normalized', () => {
  assert.equal(normalizeInput('  ICE   Cream '), 'ice cream'); assert.equal(normalizeInput('It’s'), "it's");
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  assert.equal(run.submit(word.text.toUpperCase()), 'correct');
});
test('wrong submission consumes one life and records the old target, not the next word', () => {
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, words.slice(0, 20), progress, 'normal');
  const old = run.word; assert.equal(run.submit('incorrect'), 'wrong');
  assert.equal(run.lives, 2); assert.equal(progress.get(old).errors, 1); assert.equal(run.cursor, 1);
});
test('pause freezes the countdown and blocks submissions', () => {
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  const before = run.remaining; run.paused = true; assert.equal(run.tick(100), false);
  assert.equal(run.remaining, before); assert.equal(run.elapsed, 0); assert.equal(run.submit(word.text), 'ignored');
  run.paused = false; assert.equal(run.tick(before + 1), true);
});

test('round time uses active play only and formats seconds across minute boundaries', () => {
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  run.tick(2.2); run.paused = true; run.tick(20); run.paused = false; run.tick(3);
  run.end(false); run.tick(90);
  assert.equal(run.result().elapsed, 5.2); assert.equal(roundTime(run.result().elapsed), '0:06');
  assert.equal(roundTime(59.2), '1:00'); assert.equal(roundTime(125), '2:05'); assert.equal(roundTime(0), '0:00');
});
test('twelve correct answers end a round once, persist results, and block further input', () => {
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  for (let i = 0; i < 12; i++) run.submit(word.text);
  assert.equal(run.done, true); assert.equal(run.result().won, true);
  assert.equal(run.submit(word.text), 'ignored'); assert.equal(run.steps, 12);
  assert.equal(progress.data.chapters[word.chapterId].completed, 1);
});
test('three failures end the round; post-round failures cannot consume more lives', () => {
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  run.fail('spelling', 'x'); run.fail('timeout'); run.fail('boundary'); run.fail('boundary');
  assert.equal(run.lives, 0); assert.equal(run.errors, 3); assert.equal(run.done, true); assert.equal(progress.get(word).errors, 3);
});
test('changing pace preserves the fraction of time remaining', () => {
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  run.tick(run.duration * 0.5); run.setPace('fast'); assert.equal(run.remaining / run.duration, 0.5);
});
test('round review includes correct and wrong words, excluding unseen queued words', () => {
  const { progress } = fixture();
  const pool = words.slice(0, 20);
  const run = new TypingSession(word.chapterId, pool, progress, 'normal', () => 0.5);
  const first = run.word; run.submit(first.text);
  const second = run.word; run.fail('spelling', 'typo');
  const third = run.word;
  const result = run.result();
  assert.deepEqual(result.seenWords.map(entry => entry.word.key), [first.key, second.key, third.key]);
  assert.equal(result.seenWords[0].correct, 1);
  assert.equal(result.seenWords[1].errors, 1);
  assert.equal(result.seenWords[1].lastInput, 'typo');
  assert.equal(result.seenWords[2].correct + result.seenWords[2].errors, 0);
  run.setPace('fast'); assert.equal(run.result().seenWords[2].appearances, 1);
  result.seenWords[0].correct = 999;
  assert.equal(run.result().seenWords[0].correct, 1);
});
test('repeat appearances are merged; the next unshown word is excluded after a win', () => {
  const { progress } = fixture();
  const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  for (let i = 0; i < 12; i++) run.submit(word.text);
  assert.equal(run.result().seenWords.length, 1);
  assert.equal(run.result().seenWords[0].appearances, 12);
  assert.equal(run.result().seenWords[0].correct, 12);
});
test('the third failure does not add the next word to the round review', () => {
  const { progress } = fixture(); const run = new TypingSession(word.chapterId, words.slice(0, 20), progress, 'normal');
  const seen = [];
  for (let i = 0; i < 3; i++) { seen.push(run.word.key); run.fail('timeout'); }
  assert.deepEqual(run.result().seenWords.map(entry => entry.word.key), seen);
});
test('recall masks each letter, reveals typed letters and re-masks after deletion', () => {
  assert.equal(letterFeedback('frog', '', true).map(slot => slot.display).join(''), '____');
  assert.equal(letterFeedback('frog', 'fr', true).map(slot => slot.display).join(''), 'fr__');
  assert.equal(letterFeedback('frog', 'f', true).map(slot => slot.display).join(''), 'f___');
  assert.deepEqual(letterFeedback('frog', 'fx', true).map(slot => slot.state), ['correct', 'incorrect', 'blank', 'blank']);
  assert.equal(letterFeedback('frog', 'frogx', true).at(-1)!.state, 'incorrect');
});
test('guided mode retains untyped hints and phrases preserve spaces and punctuation', () => {
  assert.equal(letterFeedback('frog', 'FR', false).map(slot => slot.display).join(''), 'frog');
  assert.equal(letterFeedback('ice cream', 'ice ', true).map(slot => slot.display).join('').replace(/\u00a0/g, ' '), 'ice _____');
  assert.equal(letterFeedback("it's", 'it’', true).map(slot => slot.display).join(''), "it'_");
  assert.equal(letterFeedback('long-term', '', true).map(slot => slot.display).join(''), '____-____');
});
test('annotation preference persists and older backups default to hidden annotations', () => {
  const { progress, storage } = fixture();
  assert.equal(progress.data.settings.showDetails, false);
  assert.equal(progress.data.settings.music, true);
  progress.data.settings.showDetails = true; progress.save();
  assert.equal(new ProgressStore(storage, words).data.settings.showDetails, true);
  progress.import(JSON.stringify({ version: 1, words: {}, settings: { pace: 'normal', sound: true, phrases: false } }));
  assert.equal(progress.data.settings.showDetails, false);
});

test('explored words match the learned count, deduplicate shared progress, and remain available in each theme', () => {
  const { progress } = fixture();
  const duplicate = words.find((w, i) => words.findIndex(x => x.key === w.key) !== i)!;
  const first = words.find(w => w.key === duplicate.key)!;
  const other = words.find(w => w.key !== duplicate.key)!;
  const errorOnly = words.find(w => w.key !== duplicate.key && w.key !== other.key)!;
  progress.correct(duplicate); progress.correct(other); progress.mistake(errorOnly, 'timeout', '');
  progress.data.words[duplicate.key].lastPracticed = 100;
  progress.data.words[other.key].lastPracticed = 200;
  assert.deepEqual(progress.explored().map(w => w.key), [other.key, duplicate.key]);
  assert.equal(progress.explored(first.chapterId).filter(w => w.key === duplicate.key).length, 1);
  assert.equal(progress.explored(duplicate.chapterId).find(w => w.key === duplicate.key)?.chapterId, duplicate.chapterId);
  assert.equal(progress.explored().some(w => w.key === errorOnly.key), false);
});

test('reset clears learning history durably, preserves preferences and other data, and prevents legacy reimport', () => {
  const { progress, storage, entries } = fixture();
  progress.correct(word); progress.mistake(word, 'spelling', 'typo'); progress.finish(word.chapterId, 12, true);
  progress.data.settings = { pace: 'fast', sound: false, music: false, phrases: true, showDetails: true };
  progress.data.lastChapter = 'chapter-22'; progress.save();
  entries.set('lt_mistakes', JSON.stringify({ [word.text]: { count: 3 } }));
  entries.set('other-app', 'keep me');
  const backup = JSON.stringify(progress.data);
  assert.equal(progress.resetProgress(), true);
  const restored = new ProgressStore(storage, words);
  assert.deepEqual(restored.data.words, {}); assert.deepEqual(restored.data.chapters, {});
  assert.equal(restored.data.lastChapter, 'chapter-01'); assert.equal(restored.notebook().length, 0);
  assert.deepEqual(restored.data.settings, { pace: 'fast', sound: false, music: false, phrases: true, showDetails: true });
  assert.ok(entries.has('lt_mistakes')); assert.equal(entries.get('other-app'), 'keep me');
  restored.import(backup);
  assert.equal(restored.get(word).correct, 1); assert.equal(restored.notebook().length, 1);
  assert.equal(restored.data.chapters[word.chapterId].completed, 1);
});

test('a reset storage failure preserves the current in-memory and saved history', () => {
  const entries = new Map<string, string>();
  let failWrites = false;
  const storage: StorageLike = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => {
    if (failWrites) throw new Error('storage blocked'); entries.set(key, value);
  } };
  const progress = new ProgressStore(storage, words); progress.correct(word);
  const before = progress.data, saved = entries.get(SAVE_KEY);
  failWrites = true;
  assert.equal(progress.resetProgress(), false);
  assert.equal(progress.data, before); assert.equal(progress.get(word).correct, 1);
  assert.equal(entries.get(SAVE_KEY), saved); assert.match(progress.warning, /原有进度已保留/);
});

test('an island requires every unique word explored, independently of a twelve-jump round', () => {
  const { progress } = fixture();
  const second = words.find(other => other.key !== word.key)!;
  const pool = [word, second, word];
  const run = new TypingSession(word.chapterId, [word], progress, 'normal');
  for (let i = 0; i < 12; i++) run.submit(word.text);
  assert.equal(run.done, true); assert.equal(islandExploration(pool, progress).complete, false);
  progress.mistake(second, 'timeout', '');
  assert.equal(islandExploration(pool, progress).complete, false);
  progress.correct(second);
  assert.deepEqual(islandExploration(pool, progress), { count: 2, learned: 2, recall: 1, complete: true });
  progress.mistake(second, 'spelling', 'x');
  assert.equal(islandExploration(pool, progress).complete, true);
  assert.equal(islandExploration([], progress).complete, false);
});

test('full-island exploration includes phrases and does not change when phrase practice is toggled', () => {
  const { progress } = fixture(); const phrase = words.find(w => w.isPhrase)!;
  const pool = [word, phrase];
  progress.correct(word);
  assert.equal(islandExploration(pool, progress).complete, false);
  progress.data.settings.phrases = false; progress.correct(phrase);
  assert.equal(islandExploration(pool, progress).complete, true);
  progress.data.settings.phrases = true;
  assert.equal(islandExploration(pool, progress).complete, true);
});

test('a shared final word completes both themes, persists across reload and import, and clears on reset', () => {
  const { progress, storage } = fixture();
  const duplicate = words.find((w, i) => words.findIndex(other => other.key === w.key) !== i)!;
  const first = words.find(w => w.key === duplicate.key)!;
  const pools = [first.chapterId, duplicate.chapterId].map(id => words.filter(w => w.chapterId === id));
  for (const candidate of pools.flat()) if (candidate.key !== duplicate.key) progress.correct(candidate);
  assert.ok(pools.every(pool => !islandExploration(pool, progress).complete));
  progress.correct(duplicate);
  assert.ok(pools.every(pool => islandExploration(pool, progress).complete));
  const backup = JSON.stringify(progress.data), restored = new ProgressStore(storage, words);
  assert.ok(pools.every(pool => islandExploration(pool, restored).complete));
  restored.resetProgress(); assert.ok(pools.every(pool => !islandExploration(pool, restored).complete));
  restored.import(backup); assert.ok(pools.every(pool => islandExploration(pool, restored).complete));
});
