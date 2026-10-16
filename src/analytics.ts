/** Count visits to the published game; learning data stays in the browser. */
export function startVisitAnalytics() {
  if (!import.meta.env.PROD || navigator.webdriver
    || location.origin !== 'https://weiii11.github.io'
    || !['/Sky-lexicon/', '/Sky-lexicon/index.html'].includes(location.pathname)
    || document.getElementById('visit-analytics')) return;

  const configured = import.meta.env.VITE_GOATCOUNTER_URL?.trim();
  if (!configured) return;
  let endpoint: URL;
  try { endpoint = new URL(configured); } catch { return; }
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.goatcounter\.com$/.test(endpoint.hostname)
    || endpoint.port || endpoint.username || endpoint.password
    || !['/', '/count'].includes(endpoint.pathname)) return;
  endpoint.pathname = '/count'; endpoint.search = ''; endpoint.hash = '';

  const script = document.createElement('script');
  script.id = 'visit-analytics'; script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.referrerPolicy = 'strict-origin-when-cross-origin';
  script.setAttribute('data-goatcounter', endpoint.href);
  script.setAttribute('data-goatcounter-settings', JSON.stringify({
    path: '/Sky-lexicon/', title: '云间词屿 · Sky Lexicon', no_events: true,
  }));
  document.head.append(script);
}
