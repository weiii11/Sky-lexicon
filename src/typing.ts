export interface LetterSlot { display: string; state: 'correct' | 'incorrect' | 'blank' | 'hint' | 'space'; index: number }

// Preserve a trailing space while typing phrases; answer submission normalizes it separately.
export function letterFeedback(expected: string, input: string, recall: boolean): LetterSlot[] {
  const answer = Array.from(expected.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' '));
  const typed = Array.from(input.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trimStart());
  return Array.from({ length: Math.max(answer.length, typed.length) }, (_, index) => {
    const char = answer[index], value = typed[index];
    if (value !== undefined) return { display: value === ' ' ? '\u00a0' : value, state: value === char ? 'correct' : 'incorrect', index };
    if (char === ' ') return { display: '\u00a0', state: 'space', index };
    const hidden = recall && /[\p{L}\p{N}]/u.test(char);
    return { display: hidden ? '_' : char, state: hidden ? 'blank' : 'hint', index };
  });
}
