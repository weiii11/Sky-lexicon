import './style.css';
import { chapters, chapterWords, words, metadata, chapterArt, chapterDescription, islandMapLayout } from './catalog.ts';
import { ProgressStore, RECALL_THRESHOLD } from './progress.ts';
import { TypingSession, ROUND_STEPS, normalizeInput, roundTime } from './session.ts';
import { icon, escapeHTML as esc } from './icons.ts';
import { GameAudio } from './audio.ts';
import { letterFeedback } from './typing.ts';
import { leafPromptMarkup, detailsMarkup, roundReviewMarkup, wordNotesMarkup } from './game-ui.ts';
import { islandExploration } from './exploration.ts';
import { launchIslandFireworks } from './celebration.ts';
import { trackMobileViewport } from './mobile-viewport.ts';
import type { Chapter, Pace, Word } from './types.ts';
import type { createGarden } from './game.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const refreshMobileViewport = trackMobileViewport();
const store = new ProgressStore(localStorage, words);
const audio = new GameAudio(); audio.enabled = store.data.settings.sound; audio.musicEnabled = store.data.settings.music;
let selected = chapters.find(c => c.id === store.data.lastChapter) ?? chapters[0];
let session: TypingSession | null = null;
let garden: ReturnType<typeof createGarden> | null = null;
let currentView: 'map' | 'game' = 'map';
let gameLoadToken = 0;
type ReviewOptions = { kind: 'notebook' } | { kind: 'explored'; keys?: string[]; chapterId?: string };
let lastRun: { chapterId: string; review: ReviewOptions | null } = { chapterId: selected.id, review: null };
let modalReturnFocus: HTMLElement | null = null;
let composing = false;
let userPaused = false;
let lastHudUpdate = 0;
let toastTimer: ReturnType<typeof setTimeout>;
let mapScroll = { x: 0, y: 0 };
let gardenResize: ResizeObserver | null = null;
let leafPosition = { x: 500, y: 487, moving: false, visible: true };
let islandVisibility: IntersectionObserver | null = null;
let mapResize: ResizeObserver | null = null;
let inspectorTrigger: HTMLButtonElement | null = null;
let stopFireworks: (() => void) | null = null;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const num = (value: number) => value.toLocaleString('zh-CN');
function toast(message: string) {
  const el = $('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3300);
}
function summary() {
  const records = Object.values(store.data.words);
  return { learned: store.explored().length, recall: records.filter(p => p.correct >= RECALL_THRESHOLD && !p.needsHint).length, visited: Object.keys(store.data.chapters).length };
}
function chapterSummary(chapter: Chapter) {
  return islandExploration(chapterWords(chapter), store);
}
function shell() {
  app.innerHTML = `
    <header class="topbar">
      <button class="brand" id="home-button" aria-label="返回群岛地图"><span class="brand-emblem">${icon('islands')}</span><span><strong>云间词屿</strong><small>SKY LEXICON</small></span></button>
      <nav class="main-nav" aria-label="主导航"><button id="nav-map" class="nav-button active">${icon('compass')}<span>群岛地图</span></button><button id="nav-explored" class="nav-button mobile-explored-link" aria-label="查看已探索词汇">${icon('leaf')}<span>已探索词汇</span></button><button id="nav-notebook" class="nav-button">${icon('book')}<span>单词本</span><span class="nav-count" id="notebook-count">0</span></button></nav>
      <div class="header-tools"><span class="local-badge"><i></i>进度自动保存</span><button id="music-button" class="icon-button music-button" aria-label="背景音乐" aria-pressed="false">${icon('music')}</button><button id="settings-button" class="icon-button" aria-label="设置与数据备份">${icon('settings')}</button></div>
    </header>
    <main id="main"></main>
    <dialog id="dialog" class="dialog"><div id="dialog-content"></div></dialog>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  $('#home-button').onclick = returnToMap;
  $('#nav-map').onclick = returnToMap;
  $('#nav-notebook').onclick = () => showNotebook();
  $('#nav-explored').onclick = showExplored;
  $('#settings-button').onclick = showSettings;
  $('#music-button').onclick = () => setMusicPreference(!audio.musicEnabled);
  refreshMusicButton();
  $('#dialog').addEventListener('click', event => { if (event.target === $('#dialog') && !$('#dialog').classList.contains('result-dialog')) closeModal(); });
  $('#dialog').addEventListener('cancel', event => { event.preventDefault(); if (!$('#dialog').classList.contains('result-dialog')) closeModal(); });
  $('#dialog').addEventListener('close', () => {
    if ($<HTMLDialogElement>('#dialog').open) return;
    stopFireworks?.(); stopFireworks = null;
    $('#dialog').classList.remove('result-dialog'); resumeIfAllowed();
    const input = document.querySelector<HTMLInputElement>('#typing-input');
    if (currentView === 'game' && input && !input.disabled && !userPaused) input.focus({ preventScroll: true });
    else modalReturnFocus?.focus();
  });
  refreshNotebookCount();
}
function refreshNotebookCount() { $('#notebook-count').textContent = String(store.notebook().length); }
function refreshMusicButton() {
  const button = $('#music-button');
  button.setAttribute('aria-pressed', String(audio.musicEnabled));
  button.setAttribute('aria-label', audio.musicEnabled ? '关闭背景音乐' : '开启背景音乐');
  button.title = `背景音乐：${audio.musicEnabled ? '已开启' : '已关闭'}`;
}
function setMusicPreference(enabled: boolean) {
  audio.setMusic(enabled); store.data.settings.music = enabled; store.save(); refreshMusicButton();
  const toggle = document.querySelector<HTMLInputElement>('#music-toggle'); if (toggle) toggle.checked = enabled;
  if (currentView === 'game' && !$<HTMLDialogElement>('#dialog').open) $<HTMLInputElement>('#typing-input').focus({ preventScroll: true });
}

function renderMap() {
  audio.setScene('map');
  islandVisibility?.disconnect();
  mapResize?.disconnect();
  currentView = 'map'; $('#nav-map').classList.add('active');
  const totals = summary();
  $('#main').innerHTML = `
    <div class="map-layout">
      <aside class="atlas-sidebar">
        <div class="sidebar-intro"><span class="eyebrow">YOUR LITTLE WORD WORLD</span><h1>把词汇，<br>变成一段旅程。</h1><p>每一座岛，都是一个新世界。<br>从今天的第一步开始。</p></div>
        <div class="overall-progress"><div><span class="progress-label">已探索词汇<button id="show-explored" class="explored-trigger" aria-label="展开已探索词汇" aria-haspopup="dialog">展开 ${icon('arrow')}</button></span><strong id="explored-count">${num(totals.learned)} <small>/ ${num(metadata.uniqueWords)}</small></strong></div><div class="thin-progress"><i style="width:${totals.learned / metadata.uniqueWords * 100}%"></i></div><span class="progress-note">${totals.recall} 词进入中文回忆</span></div>
        <div class="catalogue-title"><h2>主题群岛</h2><span>22 座</span></div>
        <label class="search-field">${icon('search')}<input id="chapter-search" placeholder="寻找一座岛…" aria-label="搜索主题岛屿" /></label>
        <div class="chapter-list" id="chapter-list">${chapters.map(chapter => { const complete = chapterSummary(chapter).complete; return `<button class="chapter-link ${chapter.id === selected.id ? 'selected' : ''} ${complete ? 'completed' : ''}" data-chapter="${chapter.id}"><span class="chapter-number">${String(chapter.number).padStart(2, '0')}</span><span>${chapter.name}</span><small>${complete ? `${icon('sparkle')}已点亮` : chapter.wordIds.length}</small></button>`; }).join('')}</div>
        <div class="sidebar-bottom">${icon('leaf')}<span>不赶路，也在慢慢进步。</span></div>
      </aside>
      <section class="map-region" aria-label="22 座雅思主题岛屿">
        <div class="map-caption"><span class="eyebrow">THE FLOATING ARCHIPELAGO</span><h2>下一站，去哪里？</h2><span class="map-hint">上下浏览 · 点击岛屿开始旅程</span></div>
        <div class="map-viewport" id="map-viewport" tabindex="0" aria-label="天空地图，可上下滚动浏览全部岛屿">
          <div class="map-world" id="map-world">
            <div class="cloud cloud-one"></div><div class="cloud cloud-two"></div><div class="cloud cloud-three"></div>
            <svg class="island-path" aria-hidden="true"><path/></svg>
            ${chapters.map((chapter, index) => {
              const stats = chapterSummary(chapter);
              return `<button class="island ${chapter.id === selected.id ? 'selected' : ''} ${stats.complete ? 'completed' : ''}" id="island-${chapter.id}" data-chapter="${chapter.id}" style="--float-delay:${index * -0.71}s" aria-controls="island-inspector" aria-expanded="false" aria-label="${chapter.name}，${stats.count} 个词条${stats.complete ? '，已完整探索' : ''}">
                <span class="island-aura"></span><img class="island-art" data-src="${chapterArt(chapter)}" ${index < 5 ? `src="${chapterArt(chapter)}"` : ''} alt="" draggable="false" decoding="async" width="512" height="512" />
                <span class="island-label"><span class="island-index">${String(chapter.number).padStart(2, '0')}</span><span><strong>${chapter.name}</strong><small>${stats.count} 词${stats.complete ? ' · 完整探索' : stats.learned ? ` · 已探索 ${stats.learned}` : ' · 待探索'}</small></span>${stats.complete ? `<span class="island-complete-badge">${icon('sparkle')}</span>` : stats.recall ? icon('check') : ''}</span>
              </button>`;
            }).join('')}
            <div class="world-end">更多风景，藏在每一个学会的单词里。</div>
          </div>
        </div>
        <section class="island-inspector" id="island-inspector" aria-label="选中岛屿详情" hidden></section>
        <div class="map-coordinate"><span>22 ISLANDS · ${num(metadata.entries)} WORDS</span><button id="locate-button" aria-label="定位选中岛屿">${icon('compass')}</button></div>
      </section>
    </div>`;
  $('#chapter-search').addEventListener('input', event => {
    const query = (event.target as HTMLInputElement).value.trim();
    document.querySelectorAll<HTMLElement>('.chapter-link').forEach(el => { el.hidden = !el.textContent?.includes(query); });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach(button => {
    button.setAttribute('aria-controls', 'island-inspector'); button.setAttribute('aria-expanded', 'false');
    button.onclick = () => { inspectorTrigger = button; selectChapter(button.dataset.chapter!, button.classList.contains('chapter-link')); };
  });
  $('.map-region').onclick = event => { if (!(event.target as Element).closest('.island, .island-inspector, #locate-button')) hideInspector(); };
  $('#locate-button').onclick = () => locateSelected();
  $('#show-explored').onclick = showExplored;
  const viewport = $('#map-viewport'); fitMap(); viewport.scrollTo(0, mapScroll.y);
  mapResize = new ResizeObserver(fitMap); mapResize.observe(viewport);
  viewport.addEventListener('scroll', () => { mapScroll = { x: viewport.scrollLeft, y: viewport.scrollTop }; }, { passive: true });
  islandVisibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const island = entry.target as HTMLElement;
      const img = island.querySelector<HTMLImageElement>('.island-art')!;
      if (entry.isIntersecting && !img.getAttribute('src')) img.src = img.dataset.src!;
      island.classList.toggle('in-view', entry.isIntersecting);
    }
  }, { root: viewport, rootMargin: '48px', threshold: 0 });
  viewport.querySelectorAll('.island').forEach(island => islandVisibility!.observe(island));
  renderInspector();
  refreshMobileViewport();
}
function fitMap() {
  if (currentView !== 'map') return;
  const viewport = $('#map-viewport'), world = $('#map-world');
  const width = viewport.clientWidth; if (!width) return;
  const layout = islandMapLayout(width), height = Math.max(viewport.clientHeight, layout.height);
  world.style.height = `${height}px`;
  world.style.setProperty('--island-art-size', `${layout.artSize}px`);
  world.style.setProperty('--island-width', `${layout.cardWidth}px`);
  world.style.setProperty('--island-height', `${layout.cardHeight}px`);
  world.querySelectorAll<HTMLElement>('.island').forEach((island, index) => {
    const pos = layout.positions[index]; island.style.left = `${pos.x}px`; island.style.top = `${pos.y}px`;
  });
  const route = world.querySelector('svg')!;
  route.setAttribute('viewBox', `0 0 ${width} ${height}`);
  route.querySelector('path')!.setAttribute('d', layout.positions.map((pos, index) => `${index ? 'L' : 'M'} ${pos.x} ${pos.y + 12}`).join(' '));
}
function hideInspector(returnFocus = false) {
  $('#island-inspector').hidden = true; $('.map-region').classList.remove('inspector-open');
  document.querySelectorAll('[aria-controls="island-inspector"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  if (returnFocus && inspectorTrigger?.isConnected) inspectorTrigger.focus({ preventScroll: true });
}
function selectChapter(id: string, locate: boolean) {
  selected = chapters.find(c => c.id === id)!; store.data.lastChapter = id; store.save();
  document.querySelectorAll<HTMLElement>('[data-chapter]').forEach(el => el.classList.toggle('selected', el.dataset.chapter === id));
  renderInspector(); $('#island-inspector').hidden = false; $('.map-region').classList.add('inspector-open');
  document.querySelectorAll<HTMLElement>('[data-chapter]').forEach(el => el.setAttribute('aria-expanded', String(el.dataset.chapter === id)));
  if (locate) locateSelected();
}
function locateSelected() {
  const viewport = $('#map-viewport'), island = $(`#island-${selected.id}`);
  viewport.scrollTo({ left: 0, top: island.offsetTop - viewport.clientHeight * .4, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
function renderInspector() {
  const stats = chapterSummary(selected);
  const examples = chapterWords(selected).filter(w => !w.isPhrase).slice(0, 3);
  const onlyPhrasesLeft = !store.data.settings.phrases && !stats.complete && chapterWords(selected).filter(word => word.isPhrase && store.get(word).correct === 0).length === stats.count - stats.learned;
  $('#island-inspector').classList.toggle('completed', stats.complete);
  $('#island-inspector').innerHTML = `<div class="inspector-heading"><span class="eyebrow">ISLAND ${String(selected.number).padStart(2, '0')}</span><span class="open-tag">${stats.complete ? `${icon('sparkle')}已完整探索` : '自由探索'}</span><select id="mobile-chapter-select" class="mobile-chapter-select" aria-label="选择主题岛屿">${chapters.map(chapter => `<option value="${chapter.id}" ${chapter.id === selected.id ? 'selected' : ''}>${String(chapter.number).padStart(2, '0')} · ${chapter.name}${chapterSummary(chapter).complete ? ' · 已点亮' : ''}</option>`).join('')}</select><button id="close-inspector" class="icon-button inspector-close" aria-label="收起岛屿详情">${icon('close')}</button></div><h3>${selected.name}</h3><p>${chapterDescription(selected)}</p><div class="island-metrics"><div><strong>${stats.count}</strong><span>主题词条</span></div><div><strong>${stats.learned}</strong><span>已经练习</span></div><div><strong>${stats.recall}</strong><span>中文回忆</span></div></div><div class="word-preview">${examples.map(w => `<span>${esc(w.text)}</span>`).join('')}</div><button class="primary-button" id="start-island">${stats.complete ? '再游这座岛' : '开始这段旅程'} ${icon('arrow')}</button><span class="inspector-note">${stats.complete ? '这一座岛的每个词，都留下了你的足迹。' : onlyPhrasesLeft ? '只剩短语待探索，可在设置开启短语练习。' : '每轮 12 次跳跃 · 三次落水机会'}</span>`;
  $('#close-inspector').onclick = () => hideInspector(true);
  $('#start-island').onclick = () => void startGame(selected.id);
  $('#mobile-chapter-select').onchange = event => selectChapter((event.target as HTMLSelectElement).value, true);
}
async function startGame(chapterId: string, review: ReviewOptions | null = null) {
  const chapter = chapters.find(c => c.id === chapterId) ?? selected;
  const reviewKeys = review?.kind === 'explored' && review.keys ? new Set(review.keys) : null;
  let pool = review?.kind === 'explored' ? store.explored(review.chapterId).filter(word => !reviewKeys || reviewKeys.has(word.key)) : review ? store.notebook() : chapterWords(chapter);
  if (!store.data.settings.phrases && review?.kind !== 'explored') pool = pool.filter(w => !w.isPhrase);
  if (!pool.length) { toast('当前没有可练习的词。开启短语练习或先收集一些错词。'); return; }
  if ($<HTMLDialogElement>('#dialog').open) $<HTMLDialogElement>('#dialog').close();
  const token = ++gameLoadToken;
  islandVisibility?.disconnect(); islandVisibility = null;
  mapResize?.disconnect(); mapResize = null;
  gardenResize?.disconnect(); gardenResize = null;
  if (garden) { garden.game.destroy(true); garden = null; }
  currentView = 'game'; userPaused = false; composing = false; audio.setScene('game');
  lastRun = { chapterId, review };
  session = new TypingSession(review ? 'review' : chapterId, pool, store, store.data.settings.pace);
  audio.unlock(); $('#nav-map').classList.remove('active');
  $('#main').innerHTML = `
    <section class="game-layout">
      <div class="game-toolbar"><button class="text-button" id="exit-game">${icon('back')}返回群岛</button><div class="game-title"><span class="eyebrow">${review ? 'A LITTLE SECOND CHANCE' : `ISLAND ${String(chapter.number).padStart(2, '0')}`}</span><h1>${review ? review.kind === 'explored' ? '已探索词汇复习' : '错词温习' : chapter.name}<span> · 荷塘小径</span></h1></div><div class="game-controls"><select id="pace-select" aria-label="游戏速度"><option value="slow">慢慢来</option><option value="normal">轻快行</option><option value="fast">挑战一下</option></select><button class="details-toggle" id="details-toggle" aria-controls="word-details" aria-pressed="false">${icon('book')}<span>展开注释</span></button><button class="icon-button" id="sound-button" aria-label="切换游戏音效" title="游戏音效；音乐可在顶部单独开关">${icon(audio.enabled ? 'sound' : 'mute')}</button><button class="icon-button" id="pause-button" aria-label="暂停游戏">${icon('pause')}</button></div></div>
      <div class="game-content details-closed" id="game-content">
        <aside class="game-note"><span class="eyebrow">ONE WORD, ONE STEP</span><h2>向前一点，<br>就近一点。</h2><p>在荷叶之间，<br>收集属于你的词汇。</p><div class="step-stat"><strong id="step-count">0</strong><span>/ 12 次跳跃</span></div><div class="step-dots" id="step-dots">${Array.from({ length: 12 }, () => '<i></i>').join('')}</div><div class="lives" id="lives" aria-label="剩余三次机会">${icon('heart')}${icon('heart')}${icon('heart')}</div><span class="small-note">落水也没关系，<br>我们把这个词记下来。</span><button class="text-button" id="game-notebook">${icon('book')}打开单词本</button></aside>
        <div class="garden-frame"><div class="garden-caption"><span>云间庭院</span><span id="mode-tag">英文辅助</span></div><div id="garden" class="garden-canvas" aria-label="青蛙跳荷叶游戏画面"><div class="game-loading">正在走进荷塘…</div></div>${leafPromptMarkup()}<div class="game-message" id="game-message" role="status"></div></div>
        ${detailsMarkup()}
      </div>
      <div class="game-bottom"><span>保持英文输入状态 · 单词不区分大小写</span><span id="save-status">每一步，都已保存</span></div>
    </section>`;
  $('#exit-game').onclick = returnToMap;
  $('#game-notebook').onclick = () => showNotebook();
  $('#sound-button').onclick = () => { audio.enabled = !audio.enabled; audio.unlock(); store.data.settings.sound = audio.enabled; store.save(); $('#sound-button').innerHTML = icon(audio.enabled ? 'sound' : 'mute'); };
  $('#pause-button').onclick = pauseMenu;
  $('#details-toggle').onclick = () => setDetails(!store.data.settings.showDetails);
  $('#close-details').onclick = () => setDetails(false);
  setDetails(store.data.settings.showDetails, false);
  const pace = $('#pace-select') as HTMLSelectElement; pace.value = store.data.settings.pace;
  pace.onchange = () => { const value = pace.value as Pace; session!.setPace(value); garden?.scene.setPace(value); store.data.settings.pace = value; store.save(); };
  const input = $('#typing-input') as HTMLInputElement;
  bindTypingInput(input);
  $('#typing-form').addEventListener('click', event => {
    const current = $<HTMLInputElement>('#typing-input');
    if (!(event.target as HTMLElement).closest('button') && !current.disabled) current.focus({ preventScroll: true });
  });
  $('#typing-form').onsubmit = event => { event.preventDefault(); if (!composing) submitWord(); };
  renderWord(); updateHud(); refreshMobileViewport();
  try {
    const { createGarden } = await import('./game.ts');
    if (token !== gameLoadToken || currentView !== 'game') return;
    garden = createGarden($('#garden'), {
      ready: () => { if (token !== gameLoadToken) return; $('.game-loading')?.remove(); input.disabled = false; renderWord(); garden!.scene.setPace(session!.pace); resumeIfAllowed(); input.focus(); },
      tick: delta => {
        if (!session || session.done || session.paused) return;
        if (session.tick(delta)) failWord('timeout');
        lastHudUpdate += delta;
        if (lastHudUpdate > 0.05) { updateHud(); lastHudUpdate = 0; }
      },
      boundary: () => failWord('boundary'),
      target: position => { leafPosition = position; positionLeafPrompt(); },
    });
    gardenResize = new ResizeObserver(() => { garden?.game.scale.refresh(); positionLeafPrompt(); });
    gardenResize.observe($('.garden-frame'));
  } catch (error) { toast('游戏画面加载失败，请刷新后重试。'); console.error(error); }
}
function bindTypingInput(input: HTMLInputElement) {
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; checkAutoSubmit(); });
  input.addEventListener('beforeinput', event => {
    if (session?.paused || session?.done || garden?.scene.recovering) event.preventDefault();
  });
  input.addEventListener('input', checkAutoSubmit);
  input.addEventListener('keyup', renderTypingFeedback);
}
function clearTypingInput(): HTMLInputElement {
  let input = $<HTMLInputElement>('#typing-input');
  if (input.value && matchMedia('(any-pointer: coarse)').matches) {
    // A fresh editable field gives mobile IMEs a new word boundary. Transfer
    // focus synchronously so an already-open keyboard can stay open.
    const focused = document.activeElement === input;
    const fresh = input.cloneNode() as HTMLInputElement; fresh.value = '';
    input.replaceWith(fresh); bindTypingInput(fresh); input = fresh; composing = false;
    if (focused) fresh.focus({ preventScroll: true });
  }
  input.value = ''; input.classList.remove('mismatch');
  return input;
}
function renderWord() {
  if (!session || currentView !== 'game') return;
  const word = session.word, progress = store.get(word), recall = session.recall;
  $('#typing-form').dataset.wordId = word.id;
  $('#typing-form').dataset.recall = String(recall);
  $('#word-english').textContent = recall ? letterFeedback(word.text, '', true).map(slot => slot.display).join(' ') : word.text;
  $('#word-english').classList.toggle('recall', recall);
  $('#word-meaning').textContent = word.meaning;
  $('#phonetic').textContent = recall ? '中文回忆 · 不显示英文线索' : word.phonetic;
  $('#prompt-kind').textContent = recall ? '中文回忆' : progress.needsHint ? '再看一遍，再记一点' : '看词练习';
  $('#mode-tag').textContent = recall ? '中文回忆' : '英文辅助';
  $('#word-mastery').textContent = `${Math.min(progress.correct, RECALL_THRESHOLD)} / ${RECALL_THRESHOLD}`;
  $('#leaf-meaning').textContent = word.meaning;
  $('#details-chapter').textContent = chapters.find(chapter => chapter.id === word.chapterId)!.name;
  const input = clearTypingInput();
  input.setAttribute('aria-label', recall ? `根据中文填写英文，共 ${Array.from(word.text).length} 个字符` : `输入英文：${word.text}`);
  renderTypingFeedback();
}
function setDetails(show: boolean, persist = true) {
  $('#word-details').hidden = !show;
  $('#game-content').classList.toggle('details-closed', !show);
  $('#details-toggle').setAttribute('aria-pressed', String(show));
  $('#details-toggle span').textContent = show ? '收起注释' : '展开注释';
  if (persist) { store.data.settings.showDetails = show; store.save(); }
  requestAnimationFrame(() => {
    if (currentView !== 'game') return;
    garden?.game.scale.refresh(); positionLeafPrompt();
    const input = $<HTMLInputElement>('#typing-input'); if (!input.disabled) input.focus({ preventScroll: true });
  });
}
function positionLeafPrompt() {
  const canvas = document.querySelector<HTMLCanvasElement>('#garden canvas');
  const prompt = document.querySelector<HTMLElement>('#typing-form');
  if (!canvas || !prompt || currentView !== 'game') return;
  const rect = canvas.getBoundingClientRect(), frame = $('.garden-frame').getBoundingClientRect();
  const width = Math.min(330, frame.width - 24, Math.max(140, 420 * rect.width / 1000 * 0.78));
  prompt.style.width = `${width}px`;
  const letters = $('#leaf-feedback').children.length || 1;
  prompt.style.setProperty('--leaf-letter-size', `${Math.min(rect.width < 600 ? 20 : 25, Math.max(11, (width - 4) / (letters * 0.63)))}px`);
  prompt.style.setProperty('--leaf-meaning-size', rect.width < 600 ? '10px' : '12px');
  prompt.style.setProperty('--leaf-meaning-height', rect.width < 600 ? '38px' : '60px');
  const x = rect.left - frame.left + leafPosition.x * rect.width / 1000;
  const y = rect.top - frame.top + leafPosition.y * rect.height / 720;
  prompt.style.left = `${Math.max(width / 2 + 12, Math.min(frame.width - width / 2 - 12, x))}px`;
  const keyboard = document.documentElement.classList.contains('keyboard-open');
  const top = prompt.offsetHeight / 2 + (keyboard ? 35 : 85);
  const bottom = frame.height - prompt.offsetHeight / 2 - 10;
  prompt.style.top = `${Math.max(Math.min(top, bottom), Math.min(bottom, y))}px`;
  prompt.classList.toggle('recovering', !leafPosition.visible || Boolean(garden?.scene.recovering));
}
function renderTypingFeedback() {
  if (!session || currentView !== 'game') return;
  const input = $<HTMLInputElement>('#typing-input');
  const slots = letterFeedback(session.word.text, input.value, session.recall);
  const caret = input.selectionStart ?? input.value.length;
  $('#leaf-feedback').innerHTML = slots.map(slot => `<span class="letter-slot ${slot.state}${slot.index === caret ? ' current' : ''}">${esc(slot.display)}</span>`).join('');
  $('#leaf-feedback').classList.toggle('long-word', slots.length > 16);
  $('#leaf-feedback').classList.toggle('very-long-word', slots.length > 23);
  $('#typing-form').classList.toggle('has-input-error', slots.some(slot => slot.state === 'incorrect'));
  if (session.recall) $('#word-english').textContent = slots.map(slot => slot.display).join(' ');
  positionLeafPrompt();
}
function checkAutoSubmit() {
  renderTypingFeedback();
  if (!session || composing || session.paused || session.done || garden?.scene.recovering) return;
  const input = $('#typing-input') as HTMLInputElement;
  const typed = normalizeInput(input.value), expected = normalizeInput(session.word.text);
  input.classList.toggle('mismatch', Boolean(typed) && !expected.startsWith(typed));
  if (typed === expected) submitWord();
}
function submitWord() {
  if (!session || session.paused || session.done || !garden || garden.scene.recovering) return;
  const input = $('#typing-input') as HTMLInputElement;
  if (input.disabled || !input.value.trim()) return;
  const old = session.word;
  const completeBefore = new Set(chapters.filter(chapter => chapterSummary(chapter).complete).map(chapter => chapter.id));
  const result = session.submit(input.value);
  if (result === 'correct') {
    const newlyCompleted = chapters.filter(chapter => !completeBefore.has(chapter.id) && chapterSummary(chapter).complete);
    audio.play('correct'); garden.scene.advance();
    showGameMessage(store.recall(old) && store.get(old).correct === RECALL_THRESHOLD ? '记住了！下次试试中文回忆。' : '又向前了一步。', false);
    refreshNotebookCount(); updateHud();
    if (!session.done) renderWord();
    if (session.done || newlyCompleted.length) {
      const finished = session; $<HTMLInputElement>('#typing-input').disabled = true;
      garden.scene.whenSettled(() => {
        if (currentView !== 'game' || session !== finished) return;
        if (newlyCompleted.length) showIslandCelebration(newlyCompleted);
        else if (session.done) showResult();
      });
    }
  } else if (result === 'wrong') showFall('spelling', old);
}
function failWord(reason: 'timeout' | 'boundary') {
  if (!session || session.done || session.paused || garden?.scene.recovering) return;
  const old = session.word;
  session.fail(reason, ($('#typing-input') as HTMLInputElement).value);
  showFall(reason, old);
}
function showFall(reason: 'spelling' | 'timeout' | 'boundary', word: Word) {
  if (!session || !garden) return;
  session.paused = true; audio.play('wrong'); refreshNotebookCount(); updateHud();
  const input = $('#typing-input') as HTMLInputElement;
  if (!matchMedia('(any-pointer: coarse)').matches) input.disabled = true;
  $('#typing-form').classList.add('recovering');
  showGameMessage(`${reason === 'spelling' ? '拼写有点偏差' : reason === 'timeout' ? '荷叶等得有点久了' : '荷叶漂到岸边了'} · ${word.text} 已收入单词本`, true);
  garden.scene.fall(() => {
    if (!session || currentView !== 'game') return;
    if (session.done) { showResult(); return; }
    $<HTMLInputElement>('#typing-input').disabled = false; renderWord(); resumeIfAllowed();
    if (!$<HTMLDialogElement>('#dialog').open) $<HTMLInputElement>('#typing-input').focus({ preventScroll: true });
  });
}
function showGameMessage(text: string, error: boolean) {
  const el = $('#game-message'); el.textContent = text; el.classList.toggle('error', error); el.classList.add('visible');
  setTimeout(() => { if (el.isConnected) el.classList.remove('visible'); }, error ? 3000 : 1300);
}
function updateHud() {
  if (!session || currentView !== 'game') return;
  $('#step-count').textContent = String(session.steps);
  document.querySelectorAll('#step-dots i').forEach((dot, i) => dot.classList.toggle('filled', i < session!.steps));
  $('#lives').innerHTML = Array.from({ length: 3 }, (_, i) => icon('heart', i >= session!.lives ? 'lost' : '')).join('');
  $('#lives').setAttribute('aria-label', `剩余 ${session.lives} 次机会`);
  $('#time-remaining').textContent = `${Math.ceil(session.remaining)}s`;
  $('#time-bar').style.transform = `scaleX(${session.remaining / session.duration})`;
  $('#time-bar').classList.toggle('urgent', session.remaining < 4);
  $('#accuracy').textContent = session.steps + session.errors ? `${session.result().accuracy}%` : '—';
  $('#save-status').textContent = store.warning || '每一步，都已保存';
}
function resumeIfAllowed() {
  if (currentView !== 'game' || !session || session.done || !garden || garden.scene.recovering) return;
  const paused = userPaused || $<HTMLDialogElement>('#dialog').open || document.hidden || !document.hasFocus();
  session.paused = paused;
  if (paused) { garden.scene.stop(); garden.scene.tweens.pauseAll(); }
  else { garden.scene.tweens.resumeAll(); garden.scene.start(); }
}
function pauseMenu() {
  if (!session || session.done) return;
  userPaused = true;
  openModal(`<div class="modal-heading"><span class="eyebrow">TAKE A LITTLE BREATH</span><h2>在荷塘边，歇一会儿。</h2><p>时间和荷叶都已暂停，准备好再继续。</p></div><div class="modal-actions"><button class="primary-button" id="resume-game">继续旅程 ${icon('play')}</button><button class="secondary-button" id="pause-exit">返回群岛</button></div>`, 'pause-dialog');
  $('#resume-game').onclick = () => { userPaused = false; closeModal(); ($('#typing-input') as HTMLInputElement).focus(); };
  $('#pause-exit').onclick = returnToMap;
}
function openModal(html: string, className = '') {
  stopFireworks?.(); stopFireworks = null;
  const dialog = $('#dialog') as HTMLDialogElement;
  if (!dialog.open) modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.className = `dialog ${className}`; $('#dialog-content').innerHTML = html;
  if (!dialog.open) dialog.showModal();
  refreshMobileViewport();
  if (session) session.paused = true;
  garden?.scene.stop();
  // Falling has its own recovery animation; otherwise suspend movement as well.
  if (!garden?.scene.recovering) garden?.scene.tweens.pauseAll();
}
function closeModal() {
  if ($('#dialog').classList.contains('island-celebration') && session?.done && currentView === 'game') { showResult(); return; }
  if ($('#dialog').classList.contains('pause-dialog')) userPaused = false;
  ($('#dialog') as HTMLDialogElement).close();
}
function showIslandCelebration(achieved: Chapter[]) {
  if (!session || currentView !== 'game') return;
  $<HTMLInputElement>('#typing-input').disabled = session.done;
  openModal(`<div class="celebration-seal">${icon('sparkle')}</div><span class="eyebrow">AN ISLAND, ALL YOURS</span><h2>${achieved.length === 1 ? `点亮了，「${achieved[0].name}」！` : `又点亮了 ${achieved.length} 座词屿！`}</h2><p class="modal-description">每个词都至少答对过一次，<br>这一片风景，记住了你的努力。</p><div class="celebrated-islands">${achieved.map(chapter => `<div class="celebrated-island" data-chapter-id="${chapter.id}"><img src="${chapterArt(chapter)}" alt="" width="104" height="104"/><div><strong>${chapter.name}</strong><span>${chapterSummary(chapter).count} 个词 · 已完整探索</span></div>${icon('check')}</div>`).join('')}</div><div class="modal-actions"><button class="primary-button" id="celebration-continue">${session.done ? '查看本轮回顾' : '继续荷塘旅程'} ${icon('arrow')}</button><button class="secondary-button" id="celebration-map">看看点亮的岛</button></div>`, 'island-celebration');
  $('#celebration-continue').onclick = closeModal;
  $('#celebration-map').onclick = () => { selected = achieved[0]; store.data.lastChapter = selected.id; store.save(); returnToMap(); locateSelected(); };
  audio.play('win');
  stopFireworks = launchIslandFireworks($('#dialog'));
}
function showResult() {
  if (!session || currentView !== 'game') return;
  const result = session.result(); garden?.scene.stop(); if (result.won) audio.play('win');
  openModal(`<div class="result-art">${icon(result.won ? 'leaf' : 'book')}</div><span class="eyebrow">${result.won ? 'A SMALL JOURNEY, WELL DONE' : 'EVERY TRY COUNTS'}</span><h2>${result.won ? '到岸了，又多会了一点。' : '歇一会儿，再出发。'}</h2><p>${result.won ? '十二次跳跃，都是你留下的足迹。' : '落水的词已经记下，下次会更熟悉。'}</p><div class="result-stats"><div><strong>${result.steps}<small> / 12</small></strong><span>成功跳跃</span></div><div><strong>${result.accuracy}<small>%</small></strong><span>正确率</span></div><div title="分:秒，不计暂停与庆祝时间"><strong id="round-elapsed" class="round-time">${roundTime(result.elapsed)}</strong><span>本轮用时</span></div></div>${result.words.length ? `<p class="result-error-note">${result.words.length} 个错词已收入单词本，答对的词也在下方等你回顾。</p>` : '<div class="perfect-round">这轮没有错词，记得给自己一点掌声。</div>'}${roundReviewMarkup(result, store)}<div class="modal-actions"><button class="primary-button" id="play-again">再走一程 ${icon('arrow')}</button><button class="secondary-button" id="result-map">返回群岛</button></div>${result.words.length ? '<button class="text-button result-review" id="result-review">去温习错词</button>' : ''}`, 'result-dialog');
  $('#play-again').onclick = () => void startGame(lastRun.chapterId, lastRun.review);
  $('#result-map').onclick = returnToMap;
  if (result.words.length) $('#result-review').onclick = () => void startGame(selected.id, { kind: 'notebook' });
}
function returnToMap() {
  gameLoadToken++;
  gardenResize?.disconnect(); gardenResize = null;
  if (session && !session.done) session.paused = true;
  currentView = 'map'; session = null; userPaused = false;
  if (garden) { garden.game.destroy(true); garden = null; }
  if (($('#dialog') as HTMLDialogElement).open) ($('#dialog') as HTMLDialogElement).close();
  renderMap(); refreshNotebookCount();
}
function showExplored() {
  const total = store.explored().length;
  const pageSize = 40;
  let page = 0;
  let matches: Word[] = [];
  openModal(`<div class="modal-top"><div><span class="eyebrow">WORDS ALONG THE WAY</span><h2>已探索词汇 <small>${num(total)}</small></h2></div><button class="icon-button" id="close-explored" aria-label="关闭已探索词汇">${icon('close')}</button></div><p class="modal-description">这里收集至少答对过一次的词。点击展开释义，也可以带回荷塘再练一轮。</p><div class="explored-filters"><label class="search-field">${icon('search')}<input id="explored-search" placeholder="搜索单词或中文释义" aria-label="搜索已探索词汇"/></label><select id="explored-chapter" aria-label="筛选已探索词汇主题"><option value="">全部主题</option>${chapters.map(chapter => `<option value="${chapter.id}">${chapter.name}</option>`).join('')}</select></div><div id="explored-list" class="explored-list"></div><div class="explored-pagination"><span id="explored-page-info" role="status" aria-live="polite"></span><div><button id="explored-prev" class="text-button" aria-label="已探索词汇上一页">上一页</button><button id="explored-next" class="text-button" aria-label="已探索词汇下一页">下一页</button></div></div><div class="notebook-footer explored-footer"><span>复习会延续已有的答对次数</span><button class="primary-button" id="explored-review">复习这些词 ${icon('arrow')}</button></div>`, 'explored-dialog');
  $('#close-explored').onclick = closeModal;
  const render = () => {
    const query = $<HTMLInputElement>('#explored-search').value.trim().toLowerCase();
    const chapterId = $<HTMLSelectElement>('#explored-chapter').value;
    matches = store.explored(chapterId || undefined).filter(word => `${word.text} ${word.meaning}`.toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages - 1);
    $('#explored-list').innerHTML = matches.length ? matches.slice(page * pageSize, (page + 1) * pageSize).map(word => `<details class="round-word explored-word" data-word-key="${word.key}"><summary><span class="round-word-summary"><strong>${esc(word.text)}</strong><small>${esc(word.meaning)}</small></span><span class="round-word-state">${store.recall(word) ? '中文回忆' : '英文辅助'}</span>${icon('arrow', 'review-chevron')}</summary><div class="round-word-detail">${wordNotesMarkup(word, store)}<button class="text-button explored-word-review" data-word-key="${word.key}">复习这个词 ${icon('arrow')}</button></div></details>`).join('') : `<div class="notebook-empty">${icon('leaf')}<h3>${total ? '没有找到这些词' : '旅程才刚刚开始'}</h3><p>${total ? '试试其他关键词或主题。' : '在岛屿中答对单词，就会收集到这里。'}</p></div>`;
    $('#explored-list').scrollTop = 0;
    $('#explored-page-info').textContent = matches.length ? `${num(matches.length)} 个词 · 第 ${page + 1} / ${pages} 页` : '0 个词';
    $<HTMLButtonElement>('#explored-prev').disabled = page === 0;
    $<HTMLButtonElement>('#explored-next').disabled = page >= pages - 1;
    const review = $<HTMLButtonElement>('#explored-review');
    review.disabled = matches.length === 0;
    review.innerHTML = `${query || chapterId ? '复习筛选结果' : '复习全部词汇'} ${icon('arrow')}`;
    document.querySelectorAll<HTMLButtonElement>('.explored-word-review').forEach(button => {
      button.onclick = () => void startGame(selected.id, { kind: 'explored', keys: [button.dataset.wordKey!], chapterId: chapterId || undefined });
    });
  };
  $('#explored-search').oninput = () => { page = 0; render(); };
  $('#explored-chapter').onchange = () => { page = 0; render(); };
  $('#explored-prev').onclick = () => { if (page > 0) { page--; render(); } };
  $('#explored-next').onclick = () => { if ((page + 1) * pageSize < matches.length) { page++; render(); } };
  $('#explored-review').onclick = () => void startGame(selected.id, { kind: 'explored', keys: matches.map(word => word.key), chapterId: $<HTMLSelectElement>('#explored-chapter').value || undefined });
  render();
}
function showNotebook() {
  const notebook = store.notebook();
  openModal(`<div class="modal-top"><div><span class="eyebrow">WORDS TO MEET AGAIN</span><h2>我的单词本 <small>${notebook.length}</small></h2></div><button class="icon-button" id="close-notebook" aria-label="关闭单词本">${icon('close')}</button></div><p class="modal-description">记下每一次小小的停顿，再给记忆一次机会。</p><label class="search-field">${icon('search')}<input id="notebook-search" placeholder="搜索单词或中文释义" aria-label="搜索错词"/></label><div id="notebook-list" class="notebook-list"></div><div class="notebook-footer"><span>答对两次后进入中文回忆</span><button class="primary-button" id="review-start" ${notebook.length ? '' : 'disabled'}>温习这些词 ${icon('arrow')}</button></div>`, 'notebook-dialog');
  $('#close-notebook').onclick = closeModal;
  const render = (query = '') => {
    const matches = store.notebook().filter(w => `${w.text} ${w.meaning}`.toLowerCase().includes(query.toLowerCase()));
    $('#notebook-list').innerHTML = matches.length ? matches.map(word => {
      const p = store.get(word);
      return `<article class="notebook-word"><div><h3>${esc(word.text)}<small>${esc(word.phonetic)}</small></h3><p>${esc(word.meaning)}</p><span>${chapters.find(c => c.id === word.chapterId)!.name} · ${p.correct} 次答对${store.recall(word) ? ' · 中文回忆' : ''}</span>${p.lastInput && p.lastError === 'spelling' ? `<small class="last-error">上次输入：${esc(p.lastInput)}</small>` : ''}</div><div class="word-actions"><span>错 ${p.errors} 次</span><button class="text-button remove-word" data-word="${word.id}">移出词本</button></div></article>`;
    }).join('') : `<div class="notebook-empty">${icon('book')}<h3>${query ? '没有找到这个词' : '这里还没有错词'}</h3><p>${query ? '试试其他英文或中文关键词。' : '去岛屿走走吧，遇到的难词会留在这里。'}</p></div>`;
    document.querySelectorAll<HTMLButtonElement>('.remove-word').forEach(button => button.onclick = () => {
      const word = words.find(w => w.id === button.dataset.word)!; store.remove(word); refreshNotebookCount(); render(($('#notebook-search') as HTMLInputElement).value);
      ($('#review-start') as HTMLButtonElement).disabled = !store.notebook().length;
      $('#dialog-content h2 small').textContent = String(store.notebook().length);
    });
  };
  render(); $('#notebook-search').oninput = event => render((event.target as HTMLInputElement).value);
  $('#review-start').onclick = () => void startGame(selected.id, { kind: 'notebook' });
}
function showSettings() {
  openModal(`<div class="modal-top"><div><span class="eyebrow">MAKE YOURSELF AT HOME</span><h2>旅程设置</h2></div><button class="icon-button" id="close-settings" aria-label="关闭设置">${icon('close')}</button></div><div class="setting-row"><div><strong>短语也一起练</strong><p>词库中的 9 个短语将进入关卡，需要输入空格。</p></div><input id="phrase-toggle" type="checkbox" ${store.data.settings.phrases ? 'checked' : ''} aria-label="开启短语练习"/></div><div class="setting-row"><div><strong>轻柔的游戏音效</strong><p>为每一步跳跃和落水添加声音。</p></div><input id="sound-toggle" type="checkbox" ${audio.enabled ? 'checked' : ''} aria-label="开启音效"/></div><div class="setting-row"><div><strong>云间轻音乐</strong><p>地图与荷塘的轻柔旋律，首次点击页面后播放。</p></div><input id="music-toggle" type="checkbox" ${audio.musicEnabled ? 'checked' : ''} aria-label="开启背景音乐"/></div><div class="backup-section"><h3>带上你的进度</h3><p>记录保存在当前浏览器。换设备前，可以导出一份备份。</p><div class="backup-actions"><button class="secondary-button" id="export-progress">${icon('download')}导出进度</button><label class="secondary-button import-button" for="import-progress">导入进度<input id="import-progress" type="file" accept="application/json,.json"/></label></div><p class="import-note">导入会替换当前记录，请先导出备份。</p></div><div class="data-source"><strong>词库来源</strong><a href="${metadata.sourceUrl}" target="_blank" rel="noopener">LynnShaw · vocabulary_for_ielts ${icon('arrow')}</a><p>${num(metadata.entries)} 条词条 · ${num(metadata.uniqueWords)} 个不同英文词条 · 22 个主题<br>本地快照：${metadata.snapshotDate} · 释义与拼写待持续校对</p></div><div id="settings-warning" class="settings-warning">${esc(store.warning)}</div>`, 'settings-dialog');
  $('#close-settings').onclick = closeModal;
  $('.data-source').insertAdjacentHTML('beforebegin', `<section class="reset-section"><h3>重新开始旅程</h3><p>清空已探索词汇、答对次数、错词本和岛屿记录，保留声音与练习偏好。需要留存记录时，可先在上方导出备份。</p><button class="secondary-button danger-button" id="reset-progress">重置学习进度</button></section>`);
  $('#reset-progress').onclick = showResetConfirmation;
  $('#phrase-toggle').onchange = event => { store.data.settings.phrases = (event.target as HTMLInputElement).checked; store.save(); };
  $('#sound-toggle').onchange = event => { audio.enabled = (event.target as HTMLInputElement).checked; store.data.settings.sound = audio.enabled; audio.unlock(); store.save(); if (currentView === 'game') $('#sound-button').innerHTML = icon(audio.enabled ? 'sound' : 'mute'); };
  $('#music-toggle').onchange = event => setMusicPreference((event.target as HTMLInputElement).checked);
  $('#export-progress').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `云间词屿-进度-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('#import-progress').onchange = async event => {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('备份文件过大，请选择有效的进度文件。');
      store.import(await file.text()); audio.enabled = store.data.settings.sound; audio.setMusic(store.data.settings.music); refreshMusicButton(); refreshNotebookCount();
      selected = chapters.find(c => c.id === store.data.lastChapter) ?? selected;
      if (currentView === 'game') returnToMap(); else { renderMap(); closeModal(); }
      toast('进度已经带回来了。');
    } catch (error) { $('#settings-warning').textContent = error instanceof Error ? error.message : '无法导入这个文件。'; }
    input.value = '';
  };
}

function showResetConfirmation() {
  openModal(`<div class="modal-top"><div><span class="eyebrow">A FRESH LITTLE START</span><h2>重新开始这段旅程？</h2></div><button class="icon-button" id="close-reset" aria-label="取消重置">${icon('close')}</button></div><p class="modal-description">确认后，所有已探索词汇、答对次数、错词本和岛屿记录都会清空，无法直接撤销。声音与练习偏好会保留；已经导出的备份仍可导入恢复。</p><div class="modal-actions"><button class="secondary-button" id="cancel-reset">保留进度</button><button class="primary-button danger-button" id="confirm-reset">确认重置进度</button></div><p id="reset-warning" class="settings-warning" role="alert"></p>`, 'reset-dialog');
  const cancel = () => { showSettings(); $('#reset-progress').focus(); };
  $('#close-reset').onclick = cancel;
  $('#cancel-reset').onclick = cancel;
  $('#confirm-reset').onclick = () => {
    if (!store.resetProgress()) { $('#reset-warning').textContent = store.warning; return; }
    selected = chapters[0]; mapScroll = { x: 0, y: 0 };
    returnToMap();
    toast('学习进度已重置，从第一座岛重新出发吧。');
  };
  $('#cancel-reset').focus();
}
document.addEventListener('visibilitychange', resumeIfAllowed);
document.addEventListener('visibilitychange', () => audio.setVisible(!document.hidden));
document.addEventListener('click', () => audio.unlock());
document.addEventListener('keydown', event => { if (!event.repeat) audio.unlock(); });
window.addEventListener('pagehide', () => audio.setVisible(false));
window.addEventListener('pageshow', () => audio.setVisible(!document.hidden));
window.addEventListener('blur', () => { if (currentView === 'game' && !($('#dialog') as HTMLDialogElement).open && !session?.done) pauseMenu(); });
window.addEventListener('focus', resumeIfAllowed);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && currentView === 'map' && !$<HTMLDialogElement>('#dialog').open) hideInspector(true);
  if (event.key === 'Escape' && currentView === 'game' && !($('#dialog') as HTMLDialogElement).open) { event.preventDefault(); pauseMenu(); }
});
shell(); renderMap();
if (store.warning) toast(store.warning);
