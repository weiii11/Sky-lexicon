import { icon } from './icons.ts';

type WelcomeOptions = {
  returning: boolean;
  music: boolean;
  onMusic: (enabled: boolean) => void;
  onEnter: () => void;
  onReady: () => void;
};

/** The welcome screen lives outside the app so the map can load behind the clouds. */
export function showWelcome(app: HTMLElement, options: WelcomeOptions) {
  const welcome = document.createElement('section');
  welcome.className = 'welcome';
  welcome.setAttribute('aria-labelledby', 'welcome-title');
  welcome.innerHTML = `
    <div class="welcome-sky" aria-hidden="true"></div>
    <div class="welcome-distance" aria-hidden="true">
      <img class="welcome-island welcome-island-left" src="assets/islands/v2/chapter-01.webp" alt="" width="512" height="512" />
      <img class="welcome-island welcome-island-right" src="assets/islands/v2/chapter-05.webp" alt="" width="512" height="512" />
      <span class="welcome-orbit"></span>
    </div>
    <div class="welcome-clouds" aria-hidden="true">${['far-left', 'far-right', 'left', 'right', 'bottom-left', 'bottom-right'].map(name => `<div class="welcome-cloud welcome-cloud-${name}"><img src="assets/welcome-cloud.webp" alt="" width="1152" height="576" draggable="false" /></div>`).join('')}</div>
    <div class="welcome-content">
      <span class="welcome-emblem" aria-hidden="true">${icon('islands')}</span>
      <p class="welcome-eyebrow">A LITTLE WORLD ABOVE THE CLOUDS</p>
      <h1 id="welcome-title">云间词屿</h1>
      <p class="welcome-english">SKY LEXICON</p>
      <p class="welcome-description">每一个学会的单词，<br class="welcome-mobile-break" />都是通往远方的一步。</p>
      <button id="begin-journey" class="welcome-start"><span>${options.returning ? '继续旅程' : '开始旅程'}</span>${icon('arrow')}</button>
      <span class="welcome-invitation">${options.returning ? '云后的岛屿，还记得你的足迹' : '拨开云雾，遇见你的第一座岛'}</span>
    </div>
    <div class="welcome-footer"><span>22 座主题岛屿<span class="welcome-footer-divider"> · </span>一段词汇旅程</span><button id="welcome-music" class="welcome-music">${icon('music')}<span></span></button></div>`;
  app.inert = true;
  app.setAttribute('aria-hidden', 'true');
  document.body.classList.add('welcoming');
  document.body.append(welcome);
  const start = welcome.querySelector<HTMLButtonElement>('#begin-journey')!;
  const music = welcome.querySelector<HTMLButtonElement>('#welcome-music')!;
  const refreshMusic = () => {
    music.setAttribute('aria-pressed', String(options.music));
    music.setAttribute('aria-label', options.music ? '关闭背景音乐' : '开启背景音乐');
    music.querySelector('span')!.textContent = options.music ? '音乐已开启' : '音乐已关闭';
  };
  refreshMusic();
  music.onclick = () => { options.music = !options.music; options.onMusic(options.music); refreshMusic(); };
  start.onclick = () => {
    if (welcome.classList.contains('departing')) return;
    start.disabled = true; music.disabled = true;
    options.onEnter();
    welcome.classList.add('departing');
    const finish = () => {
      welcome.remove(); app.inert = false; app.removeAttribute('aria-hidden');
      document.body.classList.remove('welcoming'); options.onReady();
    };
    // A bounded fallback also handles background tabs and reduced-motion settings.
    window.setTimeout(finish, matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 1850);
  };
  start.focus({ preventScroll: true });
}
