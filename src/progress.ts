import type { SaveData, StorageLike, Word, WordProgress } from './types.ts';

export const SAVE_KEY = 'sky-lexicon:v1';
export const RECALL_THRESHOLD = 2;
export function blankSave(): SaveData {
  return { version: 1, words: {}, chapters: {}, settings: { pace: 'normal', sound: true, music: true, phrases: false, showDetails: false }, lastChapter: 'chapter-01', legacyImported: false };
}
export function blankWord(): WordProgress {
  return { correct: 0, errors: 0, lastPracticed: 0, needsHint: false, inNotebook: false, lastInput: '', lastError: null };
}
function nonnegative(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0; }

export class ProgressStore {
  data: SaveData = blankSave();
  warning = '';
  constructor(private storage: StorageLike, private words: Word[]) {
    try {
      const saved = JSON.parse(storage.getItem(SAVE_KEY) ?? 'null');
      if (saved?.version === 1) this.data = this.validate(saved);
      this.importLegacy();
    } catch { this.warning = '旧记录无法读取，已使用新的练习记录。'; }
  }
  private validate(input: SaveData): SaveData {
    const result = blankSave();
    const keys = new Set(this.words.map(w => w.key));
    for (const [key, value] of Object.entries(input.words ?? {})) {
      if (!keys.has(key) || !value || typeof value !== 'object') continue;
      result.words[key] = {
        correct: nonnegative(value.correct), errors: nonnegative(value.errors), lastPracticed: nonnegative(value.lastPracticed),
        needsHint: value.needsHint === true, inNotebook: value.inNotebook === true,
        lastInput: typeof value.lastInput === 'string' ? value.lastInput.slice(0, 150) : '',
        lastError: ['spelling', 'timeout', 'boundary'].includes(value.lastError ?? '') ? value.lastError : null,
      };
    }
    for (const [key, value] of Object.entries(input.chapters ?? {})) {
      if (/^chapter-(0[1-9]|1\d|2[0-2])$/.test(key) && value && typeof value === 'object') {
        result.chapters[key] = { rounds: nonnegative(value.rounds), bestSteps: Math.min(12, nonnegative(value.bestSteps)), completed: nonnegative(value.completed) };
      }
    }
    if (input.settings) {
      if (['slow', 'normal', 'fast'].includes(input.settings.pace)) result.settings.pace = input.settings.pace;
      result.settings.sound = input.settings.sound !== false;
      result.settings.music = input.settings.music !== false;
      result.settings.phrases = input.settings.phrases === true;
      result.settings.showDetails = input.settings.showDetails === true;
    }
    if (/^chapter-(0[1-9]|1\d|2[0-2])$/.test(input.lastChapter)) result.lastChapter = input.lastChapter;
    result.legacyImported = input.legacyImported === true;
    return result;
  }
  private importLegacy() {
    if (this.data.legacyImported) return;
    const legacy = JSON.parse(this.storage.getItem('lt_mistakes') ?? '{}');
    if (legacy && typeof legacy === 'object') {
      for (const [text, value] of Object.entries(legacy)) {
        const word = this.words.find(w => w.text.toLowerCase() === text.toLowerCase());
        if (word && value && typeof value === 'object') {
          const count = nonnegative((value as { count?: number }).count);
          this.data.words[word.key] = { ...blankWord(), errors: count, inNotebook: true, needsHint: true };
        }
      }
    }
    this.data.legacyImported = true;
    this.save();
  }
  get(word: Word): WordProgress { return this.data.words[word.key] ?? blankWord(); }
  recall(word: Word): boolean { const value = this.get(word); return value.correct >= RECALL_THRESHOLD && !value.needsHint; }
  correct(word: Word) {
    const value = this.get(word);
    this.data.words[word.key] = { ...value, correct: value.correct + 1, needsHint: false, lastPracticed: Date.now() };
    this.save();
  }
  mistake(word: Word, reason: 'spelling' | 'timeout' | 'boundary', input: string) {
    const value = this.get(word);
    this.data.words[word.key] = { ...value, errors: value.errors + 1, needsHint: true, inNotebook: true, lastInput: input, lastError: reason, lastPracticed: Date.now() };
    this.save();
  }
  finish(chapterId: string, steps: number, won: boolean) {
    if (chapterId === 'review') return;
    const value = this.data.chapters[chapterId] ?? { rounds: 0, bestSteps: 0, completed: 0 };
    this.data.chapters[chapterId] = { rounds: value.rounds + 1, bestSteps: Math.max(value.bestSteps, steps), completed: value.completed + Number(won) };
    this.save();
  }
  notebook(): Word[] {
    const seen = new Set<string>();
    return this.words.filter(word => {
      if (seen.has(word.key) || !this.get(word).inNotebook) return false;
      seen.add(word.key); return true;
    }).sort((a, b) => this.get(b).errors - this.get(a).errors || this.get(a).lastPracticed - this.get(b).lastPracticed);
  }
  explored(chapterId?: string): Word[] {
    const seen = new Set<string>();
    return this.words.filter(word => {
      if ((chapterId && word.chapterId !== chapterId) || seen.has(word.key) || this.get(word).correct === 0) return false;
      seen.add(word.key); return true;
    }).sort((a, b) => this.get(b).lastPracticed - this.get(a).lastPracticed);
  }
  resetProgress(): boolean {
    const cleared = blankSave();
    cleared.settings = { ...this.data.settings };
    // Old prototype mistakes must not return after a deliberate reset.
    cleared.legacyImported = true;
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(cleared)); }
    catch { this.warning = '重置未能保存，原有进度已保留，请稍后重试。'; return false; }
    this.data = cleared; this.warning = ''; return true;
  }
  remove(word: Word) { this.data.words[word.key] = { ...this.get(word), inNotebook: false }; this.save(); }
  save() {
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(this.data)); this.warning = ''; }
    catch { this.warning = '浏览器暂时无法保存记录，请导出进度备份。'; }
  }
  import(text: string) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1 || !parsed.words || typeof parsed.words !== 'object' || Array.isArray(parsed.words)) throw new Error('这不是有效的云间词屿进度文件。');
    this.data = this.validate(parsed);
    this.data.legacyImported = true;
    this.save();
  }
}
