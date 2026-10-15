export interface Word {
  id: string;
  key: string;
  text: string;
  meaning: string;
  phonetic: string;
  chapterId: string;
  isPhrase: boolean;
}
export interface Chapter { id: string; number: number; name: string; wordIds: string[] }
export type Pace = 'slow' | 'normal' | 'fast';
export interface WordProgress {
  correct: number;
  errors: number;
  lastPracticed: number;
  needsHint: boolean;
  inNotebook: boolean;
  lastInput: string;
  lastError: 'spelling' | 'timeout' | 'boundary' | null;
}
export interface ChapterProgress { rounds: number; bestSteps: number; completed: number }
export interface SaveData {
  version: 1;
  words: Record<string, WordProgress>;
  chapters: Record<string, ChapterProgress>;
  settings: { pace: Pace; sound: boolean; music: boolean; phrases: boolean; showDetails: boolean };
  lastChapter: string;
  legacyImported: boolean;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
