// iOS/WebViews often shrink only the visual viewport when the keyboard opens.
// Keep the playable area inside that viewport without changing the desktop layout.
export function trackMobileViewport() {
  const root = document.documentElement, viewport = window.visualViewport;
  let baseline = viewport?.height ?? innerHeight, previousWidth = innerWidth, frame = 0;
  const update = () => {
    frame = 0;
    const height = viewport?.height ?? innerHeight, width = viewport?.width ?? innerWidth;
    const focused = document.activeElement?.id === 'typing-input';
    if (Math.abs(innerWidth - previousWidth) > 80) {
      baseline = Math.max(innerHeight, document.documentElement.clientHeight, height);
      previousWidth = innerWidth;
    }
    if (!focused && !root.classList.contains('keyboard-open')) baseline = height;
    const availableBeforeKeyboard = Math.max(baseline, innerHeight, root.clientHeight);
    const open = Boolean(document.querySelector('.game-layout')) && focused
      && !document.querySelector<HTMLDialogElement>('#dialog')?.open
      && matchMedia('(any-pointer: coarse)').matches && Math.abs((viewport?.scale ?? 1) - 1) < .1
      && availableBeforeKeyboard - height > 120;
    if (open) {
      root.style.setProperty('--keyboard-viewport-height', `${height}px`);
      root.style.setProperty('--keyboard-viewport-width', `${width}px`);
      root.style.setProperty('--keyboard-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      root.style.setProperty('--keyboard-viewport-left', `${viewport?.offsetLeft ?? 0}px`);
    }
    root.classList.toggle('keyboard-open', open);
  };
  const refresh = () => { if (!frame) frame = requestAnimationFrame(update); };
  viewport?.addEventListener('resize', refresh);
  viewport?.addEventListener('scroll', refresh);
  window.addEventListener('resize', refresh);
  document.addEventListener('focusin', refresh);
  document.addEventListener('focusout', refresh);
  refresh();
  return refresh;
}
