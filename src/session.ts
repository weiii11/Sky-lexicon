import type { Pace, Word } from './types.ts';
import { ProgressStore } from './progress.ts';

export const ROUND_STEPS = 12;
export const paceFactor: Record<Pace, number> = { slow: 0.7, normal: 1, fast: 1.4 };
export function normalizeInput(text: string): string { return text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' '); }
export function wordDuration(word: Word, pace: Pace, recall: boolean): number {
  return Math.max(8, (9 + word.text.length * 0.7 + (recall ? 6 : 0)) / paceFactor[pace]);
}
export function selectWords(pool: Word[], progress: ProgressStore, count: number, random = Math.random): Word[] {
  if (!pool.length) throw new Error('这个词库没有可练习的词条。');
  // Weighted sampling without replacement, prioritizing mistakes and new words.
  const candidates = pool.map(word => {
    const p = progress.get(word);
    const weight = p.inNotebook ? 4 : p.correct === 0 ? 2 : 1;
    return { word, score: -Math.log(Math.max(1e-9, random())) / weight };
  }).sort((a, b) => a.score - b.score);
  const result = candidates.slice(0, count).map(c => c.word);
  while (result.length < count) result.push(candidates[result.length % candidates.length].word);
  return result;
}
export interface RoundWord {
  word: Word;
  appearances: number;
  correct: number;
  errors: number;
  lastInput: string;
  lastError: 'spelling' | 'timeout' | 'boundary' | null;
}
export interface SessionResult { won: boolean; steps: number; errors: number; elapsed: number; accuracy: number; wpm: number; words: Word[]; seenWords: RoundWord[] }
export class TypingSession {
  queue: Word[];
  cursor = 0;
  steps = 0;
  lives = 3;
  errors = 0;
  elapsed = 0;
  remaining = 0;
  duration = 0;
  correctCharacters = 0;
  done = false;
  paused = false;
  mistakes: Word[] = [];
  private encounters = new Map<string, RoundWord>();
  constructor(readonly chapterId: string, pool: Word[], readonly progress: ProgressStore, public pace: Pace, random = Math.random) {
    this.queue = selectWords(pool, progress, 20, random);
    this.presentWord();
  }
  get word(): Word { return this.queue[this.cursor % this.queue.length]; }
  get recall(): boolean { return this.progress.recall(this.word); }
  private resetClock() { this.duration = wordDuration(this.word, this.pace, this.recall); this.remaining = this.duration; }
  private presentWord() {
    this.resetClock();
    const word = this.word;
    const entry = this.encounters.get(word.key) ?? { word, appearances: 0, correct: 0, errors: 0, lastInput: '', lastError: null };
    entry.appearances++;
    this.encounters.set(word.key, entry);
  }
  setPace(pace: Pace) {
    const fraction = this.remaining / this.duration;
    this.pace = pace; this.resetClock(); this.remaining = this.duration * fraction;
  }
  tick(seconds: number): boolean {
    if (this.done || this.paused) return false;
    this.elapsed += seconds; this.remaining = Math.max(0, this.remaining - seconds);
    return this.remaining === 0;
  }
  submit(input: string): 'correct' | 'wrong' | 'ignored' {
    if (this.done || this.paused || !input.trim()) return 'ignored';
    if (normalizeInput(input) !== normalizeInput(this.word.text)) { this.fail('spelling', input); return 'wrong'; }
    this.progress.correct(this.word);
    this.encounters.get(this.word.key)!.correct++;
    this.correctCharacters += this.word.text.length;
    this.steps++; this.cursor++;
    if (this.steps >= ROUND_STEPS) this.end(true);
    else this.presentWord();
    return 'correct';
  }
  fail(reason: 'spelling' | 'timeout' | 'boundary', input = '') {
    if (this.done || this.paused) return;
    const word = this.word;
    this.progress.mistake(word, reason, input);
    const entry = this.encounters.get(word.key)!;
    entry.errors++; entry.lastInput = input; entry.lastError = reason;
    if (!this.mistakes.some(w => w.key === word.key)) this.mistakes.push(word);
    this.errors++; this.lives--; this.cursor++;
    if (!this.lives) this.end(false);
    else this.presentWord();
  }
  end(won: boolean) {
    if (this.done) return;
    this.done = true;
    this.progress.finish(this.chapterId, this.steps, won);
  }
  result(): SessionResult {
    return { won: this.steps >= ROUND_STEPS, steps: this.steps, errors: this.errors, elapsed: this.elapsed,
      accuracy: this.steps + this.errors ? Math.round(100 * this.steps / (this.steps + this.errors)) : 0,
      wpm: this.elapsed > 0 ? Math.round(this.correctCharacters / 5 / (this.elapsed / 60)) : 0, words: [...this.mistakes],
      seenWords: [...this.encounters.values()].map(entry => ({ ...entry })) };
  }
}
