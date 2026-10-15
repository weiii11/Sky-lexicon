import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// A small RFC 4180 parser: quoted commas, escaped quotes and multiline fields.
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift().map(x => x.replace(/^\uFEFF/, ''));
  return rows.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i] ?? ''])));
}

const rows = parseCSV(readFileSync(new URL('../data/word_list.csv', import.meta.url), 'utf8'));
const words = [], chapterMap = new Map();
for (const row of rows) {
  const number = Number(row.sort);
  const text = row.word.trim();
  const meaning = row.meaning.trim();
  if (!number || !text || !meaning) throw new Error(`Invalid vocabulary row: ${JSON.stringify(row)}`);
  const chapterId = `chapter-${String(number).padStart(2, '0')}`;
  const key = createHash('sha256').update(text.toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 16);
  const name = row.title.replace(/^Chapter\s+\d+\s*/i, '').trim();
  if (!chapterMap.has(number)) chapterMap.set(number, { id: chapterId, number, name, wordIds: [] });
  const id = `${chapterId}-${key}-${chapterMap.get(number).wordIds.length + 1}`;
  words.push({ id, key, text, meaning, phonetic: row.phonetic.trim(), chapterId, isPhrase: /\s/.test(text) });
  chapterMap.get(number).wordIds.push(id);
}
const chapters = [...chapterMap.values()].sort((a, b) => a.number - b.number);
if (chapters.length !== 22) throw new Error(`Expected 22 chapters, got ${chapters.length}`);
const result = {
  metadata: {
    source: 'LynnShaw/vocabulary_for_ielts',
    sourceUrl: 'https://github.com/LynnShaw/vocabulary_for_ielts',
    snapshotDate: '2026-10-14',
    sha256: createHash('sha256').update(readFileSync(new URL('../data/word_list.csv', import.meta.url))).digest('hex'),
    entries: words.length,
    uniqueWords: new Set(words.map(w => w.key)).size,
    chapters: chapters.length,
    phrases: words.filter(w => w.isPhrase).length,
  },
  chapters,
  words,
};
writeFileSync(new URL('../src/vocabulary.json', import.meta.url), JSON.stringify(result));
console.log(JSON.stringify(result.metadata, null, 2));
