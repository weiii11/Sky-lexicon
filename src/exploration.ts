import type { Word } from './types.ts';
import type { ProgressStore } from './progress.ts';

export function islandExploration(pool: readonly Word[], progress: ProgressStore) {
  const unique = [...new Map(pool.map(word => [word.key, word])).values()];
  let learned = 0, recall = 0;
  for (const word of unique) {
    if (progress.get(word).correct > 0) learned++;
    if (progress.recall(word)) recall++;
  }
  return { count: unique.length, learned, recall, complete: unique.length > 0 && learned === unique.length };
}
