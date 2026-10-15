import { chapters } from './catalog.ts';
import { escapeHTML as esc, icon } from './icons.ts';
import type { SessionResult } from './session.ts';
import type { ProgressStore } from './progress.ts';
import type { Word } from './types.ts';

export function wordNotesMarkup(word: Word, progress: ProgressStore) {
  const chapter = chapters.find(chapter => chapter.id === word.chapterId)!;
  const stats = progress.get(word);
  return `<div class="review-phonetic">${esc(word.phonetic || '音标待补充')}</div><p class="review-meaning">${esc(word.meaning)}</p><div class="review-word-meta"><span>${chapter.name}</span><span>累计答对 ${stats.correct} 次</span><span>${progress.recall(word) ? '中文回忆' : '英文辅助'}</span></div>`;
}

export function leafPromptMarkup() {
  return `<form id="typing-form" class="leaf-prompt" aria-label="荷叶上的单词输入">
    <div class="letter-input-row"><div class="leaf-feedback" id="leaf-feedback" aria-hidden="true"></div><input id="typing-input" type="text" inputmode="text" lang="en" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="输入英文" aria-describedby="leaf-meaning input-help" disabled /></div>
    <label class="leaf-meaning" id="leaf-meaning" for="typing-input"></label>
  </form>
  <div class="pond-status"><div class="pond-time"><div class="time-header"><span>荷叶等你</span><strong id="time-remaining"></strong></div><div class="time-track"><i id="time-bar"></i></div></div><div class="round-accuracy"><span>正确率</span><strong id="accuracy">—</strong></div></div>
  <p id="input-help" class="pond-input-help">完整拼对自动跳跃 · Enter 提交 · Backspace 修改 · Esc 暂停</p>`;
}
export function detailsMarkup() {
  return `<aside class="typing-panel" id="word-details" aria-label="当前单词详情" hidden>
    <div class="details-heading"><span class="eyebrow">WORD NOTES</span><button id="close-details" class="icon-button" aria-label="收起单词详情">${icon('close')}</button></div>
    <div class="prompt-heading"><span id="prompt-kind">看词练习</span><span id="word-mastery">0 / 2</span></div>
    <div class="word-english" id="word-english"></div><div class="word-meaning" id="word-meaning"></div><div class="phonetic" id="phonetic"></div>
    <div class="details-chapter" id="details-chapter"></div>
    <div class="learning-tip">${icon('leaf')}<p>累计答对 2 次后，<br>看中文，逐个填回英文字母。</p></div>
    <p class="details-note">输入就在目标荷叶上，<br>收起这里，也可以继续练习。</p>
  </aside>`;
}
export function roundReviewMarkup(result: SessionResult, progress: ProgressStore) {
  return `<section class="round-review" aria-label="本轮词汇回顾"><div class="round-review-heading"><h3>本轮词汇回顾 <small>${result.seenWords.length}</small></h3><span>点击单词，展开详情</span></div><div class="round-review-list">${result.seenWords.map(entry => {
    const word = entry.word;
    const status = [entry.correct ? `答对 ${entry.correct} 次` : '', entry.errors ? `落水 ${entry.errors} 次` : '', entry.appearances > entry.correct + entry.errors ? '尚未作答' : ''].filter(Boolean).join(' · ');
    return `<details class="round-word" data-word-key="${word.key}"><summary><span class="round-word-summary"><strong>${esc(word.text)}</strong><small>出现 ${entry.appearances} 次 · ${status}</small></span><span class="round-word-state ${entry.errors ? 'had-error' : ''}">${entry.errors ? '再记一下' : '顺利抵达'}</span>${icon('arrow', 'review-chevron')}</summary><div class="round-word-detail">${wordNotesMarkup(word, progress)}${entry.lastError === 'spelling' && entry.lastInput ? `<p class="last-error">本轮错误输入：${esc(entry.lastInput)}</p>` : entry.lastError ? `<p class="last-error">本轮曾${entry.lastError === 'timeout' ? '等待超时' : '随荷叶漂出边界'}，已收入单词本。</p>` : ''}</div></details>`;
  }).join('')}</div></section>`;
}
