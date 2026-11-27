const counter = 'https://sponsor-traffic-counter.nuttysugar21.chatgpt.site/v1/events';
const siteRoot = 'https://afkpeery.github.io/200games/';
const pages = new Set(['home', 'directory', 'blinker', 'chroma', 'velvet-valley', 'last-take', 'aftermarket']);

// Only add a verified, booked campaign. One flight at a time per placement.
// Dates are YYYY-MM-DD, start inclusive and end exclusive, in UTC.
const bookings = {};

export function activeBooking(booking, now = new Date()) {
  if (!booking) return null;
  const { name, cta, destination, campaign, start, end } = booking;
  const day = now.toISOString().slice(0, 10);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(start) || !validDate(end) || day < start || day >= end
      || typeof name !== 'string' || !name.trim() || typeof cta !== 'string' || !cta.trim()
      || typeof campaign !== 'string' || !/^[a-z0-9-]{1,48}$/.test(campaign)) return null;
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return { name, cta, campaign, url };
  } catch {
    return null;
  }
}

export function preferences(win) {
  const query = new URLSearchParams(win.location.search);
  const setting = query.get('nvos_analytics');
  const qaRequested = query.get('nvos_qa') === '1';
  let qa = qaRequested;
  let disabled = setting === 'off';
  try {
    const key = '200games:analytics-off';
    if (setting === 'off') win.localStorage.setItem(key, '1');
    if (setting === 'on') win.localStorage.removeItem(key);
    disabled ||= win.localStorage.getItem(key) === '1';
    if (qaRequested) win.sessionStorage.setItem('200games:qa', '1');
    qa ||= win.sessionStorage.getItem('200games:qa') === '1';
  } catch {
    // Without preference storage we cannot guarantee suppression across navigation.
    disabled = true;
  }
  disabled ||= win.navigator.globalPrivacyControl === true || win.navigator.doNotTrack === '1'
    || win.doNotTrack === '1';
  return { disabled, qa };
}

export function counterForPage(win, page) {
  const { disabled, qa } = preferences(win);
  const sent = new Set();
  return event => {
    if (disabled || !win.location.href.startsWith(siteRoot) || !pages.has(page)
        || sent.has(event) || win.document.visibilityState !== 'visible') return;
    sent.add(event);
    win.fetch(counter, {
      method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ site: '200games', event, slot: page, qa })
    }).catch(() => {}); // Game input and navigation must work offline.
  };
}

export function observePlacement(win, element, record) {
  if (!win.IntersectionObserver) return;
  let visible = false;
  let timer;
  const reconsider = () => {
    win.clearTimeout(timer);
    if (visible && win.document.visibilityState === 'visible') {
      timer = win.setTimeout(() => {
        if (win.document.visibilityState !== 'visible') return;
        record();
        observer.disconnect();
        win.document.removeEventListener('visibilitychange', reconsider);
      }, 1000);
    }
  };
  const observer = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      reconsider();
    }
  }, { threshold: [0, 0.5] });
  observer.observe(element);
  win.document.addEventListener('visibilitychange', reconsider);
}

export function mount(win, page, booking = bookings[page]) {
  if (!pages.has(page)) return;
  const doc = win.document;
  const record = counterForPage(win, page);
  function recordVisiblePage() {
    if (doc.visibilityState === 'visible') {
      record('page_view');
      doc.removeEventListener('visibilitychange', recordVisiblePage);
    }
  }
  doc.addEventListener('visibilitychange', recordVisiblePage);
  recordVisiblePage();
  if (page === 'blinker') win.addEventListener('blinker:start', () => record('game_start'), { once: true });

  const strip = doc.querySelector('.sponsor-strip');
  if (!strip) return;
  const active = activeBooking(booking);
  if (active) {
    strip.querySelector('[data-sponsor-label]').textContent = 'Sponsored';
    strip.querySelector('[data-sponsor-title]').textContent = active.name;
    const link = strip.querySelector('[data-sponsor-cta]');
    link.textContent = active.cta;
    const { url } = active;
    url.searchParams.set('utm_source', '200games');
    url.searchParams.set('utm_medium', 'sponsorship');
    url.searchParams.set('utm_campaign', active.campaign);
    url.searchParams.set('utm_content', page);
    link.href = url.href;
    link.rel = 'sponsored noreferrer';
    link.addEventListener('click', event => { if (event.isTrusted) record('cta_click'); });
  }
  observePlacement(win, strip, () => record(active ? 'slot_view' : 'inventory_view'));
}

if (typeof document !== 'undefined') {
  const page = document.querySelector('script[data-site-page]')?.dataset.sitePage;
  if (page) mount(window, page);
  if (document.querySelector('#measurement-state')) {
    const { disabled } = preferences(window);
    document.querySelector('#measurement-state').textContent = disabled
      ? 'Aggregate measurement is off in this browser.'
      : 'Aggregate measurement is enabled in this browser.';
  }
}
