import vocabulary from './vocabulary.json';
import type { Chapter, Word } from './types.ts';

export const words: Word[] = vocabulary.words;
export const chapters: Chapter[] = vocabulary.chapters;
export const metadata = vocabulary.metadata;
export const wordsById = new Map(words.map(w => [w.id, w]));
export function chapterWords(chapter: Chapter): Word[] { return chapter.wordIds.map(id => wordsById.get(id)!); }
const descriptions = [
  '从山川与海洋出发，认识我们生活的星球。', '沿着绿意与花香，发现植物世界的语言。', '走进森林深处，与万千生灵相遇。', '仰望星空，向宇宙中的未知迈出一步。',
  '在云端学院，收集关于学习与成长的词汇。', '点亮灵感，探索发明与技术的边界。', '翻开旧时光，读懂文明留下的故事。', '追溯声音与文字，感受语言的变化。',
  '让运动、艺术与闲暇成为新的词汇风景。', '观察日常物件，认识材料与制造的秘密。', '在色彩与衣饰之间，找到自己的表达。', '走过田园与餐桌，收集食物的味道。',
  '穿过街巷与建筑，认识每一处空间。', '带着行囊出发，学习旅途中的表达。', '认识国家、公共事务与治理的词汇。', '看懂社会与经济运行的日常语言。',
  '在规则与权利之间，建立清晰的表达。', '读懂冲突、历史与和平相关的词汇。', '与不同的人相遇，认识身份与职业。', '把行动变成语言，让表达更加准确。',
  '照顾身体与心情，积累健康相关词汇。', '让每一个时刻，都有恰当的表达。',
];
export function chapterArt(chapter: Chapter) { return `assets/islands/v2/${chapter.id}.webp`; }
export function chapterDescription(chapter: Chapter) { return descriptions[chapter.number - 1]; }
export function islandMapLayout(width: number) {
  const compact = width < 600;
  const columns = width < 360 ? 1 : compact ? 2 : Math.min(5, Math.max(2, Math.floor(width / 300)));
  const inset = compact ? 16 : 32;
  const cell = (width - inset * 2) / columns;
  const artSize = Math.floor(Math.min(compact ? 176 : 240, cell - 40));
  const cardWidth = artSize + 24, cardHeight = artSize + 64;
  const rowStep = cardHeight + (compact ? 46 : 62), top = compact ? 144 : 154;
  const positions = chapters.map((_, index) => {
    const row = Math.floor(index / columns);
    const col = row % 2 === 0 ? index % columns : columns - 1 - index % columns;
    return { x: inset + cell * (col + .5), y: top + cardHeight / 2 + row * rowStep + (columns > 1 ? col % 2 ? -14 : 14 : 0) };
  });
  return { columns, artSize, cardWidth, cardHeight, positions, height: top + Math.ceil(chapters.length / columns) * rowStep + 64 };
}
