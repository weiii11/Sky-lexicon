const paths: Record<string, string> = {
  islands: '<path d="m3 16 9-5 9 5-9 5zM6 14l3-8 3 5 3-7 4 10"/>',
  book: '<path d="M12 6v15M3 3c4-1 7 0 9 3 2-3 5-4 9-3v16c-4-1-7 0-9 2-2-2-5-3-9-2z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  leaf: '<path d="M20 3c1 9-2 15-9 15-5 0-7-4-6-7C7 5 15 6 20 3ZM4 21l11-11"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="18" cy="16" rx="3" ry="2"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 13 8-13 8z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-3 4 0 8 8 15 8-7 11-11 8-15z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
  sparkle: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6zM20 3v4m-2-2h4"/>',
};
export function icon(name: string, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.leaf}</svg>`; }
export function escapeHTML(text: string) { return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
