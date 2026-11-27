import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeBooking, mount, observePlacement, preferences } from '../sponsor.mjs';

function storage() {
  const data = new Map();
  return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}

function browser() {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  doc.querySelector = () => null;
  Object.assign(win, { document: doc, fetch: async (...args) => win.requests.push(args), requests: [],
    location: new URL('https://afkpeery.github.io/200games/'), navigator: {},
    localStorage: storage(), sessionStorage: storage() });
  return win;
}

function observations(win) {
  let sample, timer;
  win.IntersectionObserver = class {
    constructor(fn) { sample = fn; }
    observe() {}
    disconnect() {}
  };
  win.clearTimeout = () => { timer = null; };
  win.setTimeout = (fn, ms) => { assert.equal(ms, 1000); timer = fn; return 1; };
  return { fraction: n => sample([{ isIntersecting: n > 0, intersectionRatio: n }]),
    elapse: () => { const fn = timer; timer = null; fn?.(); } };
}

const offer = { name: 'Fixture', cta: 'Event', campaign: 'test-flight', destination: 'https://example.org/?id=1',
  start: '2020-01-01', end: '2099-01-01' };

test('every playable route and both placements are wired', () => {
  const routes = { home: 'index.html', directory: 'games/index.html' };
  for (const slug of ['aftermarket', 'blinker', 'chroma', 'last-take', 'velvet-valley']) {
    routes[slug] = 'games/' + slug + '/index.html';
  }
  for (const [page, path] of Object.entries(routes)) {
    const url = new URL('../' + path, import.meta.url);
    const html = readFileSync(url, 'utf8');
    const [, script, slug] = html.match(/<script type="module" src="([^"]+)" data-site-page="([^"]+)">/);
    assert.equal(slug, page);
    assert.equal(new URL(script, url).href, new URL('../sponsor.mjs', import.meta.url).href);
    assert.equal(html.includes('class="sponsor-strip"'), ['directory', 'blinker'].includes(page));
  }
});

test('tab QA, persistent staff opt-out, privacy signals and unavailable storage', () => {
  const win = browser();
  win.location.search = '?nvos_qa=1';
  assert.deepEqual(preferences(win), { disabled: false, qa: true });
  win.location.search = '?nvos_analytics=off';
  assert.equal(preferences(win).disabled, true);
  win.location.search = '';
  assert.deepEqual(preferences(win), { disabled: true, qa: true });
  win.location.search = '?nvos_analytics=on';
  assert.equal(preferences(win).disabled, false);
  win.navigator.globalPrivacyControl = true;
  assert.equal(preferences(win).disabled, true);
  win.navigator.globalPrivacyControl = false;
  win.navigator.doNotTrack = '1';
  assert.equal(preferences(win).disabled, true);
  delete win.navigator.doNotTrack;
  win.localStorage = null;
  assert.equal(preferences(win).disabled, true);
});

test('only production foreground pages count and a BLINKER start counts once', () => {
  const win = browser();
  win.location.search = '?nvos_qa=1';
  win.document.visibilityState = 'hidden';
  mount(win, 'blinker');
  assert.equal(win.requests.length, 0);
  win.document.visibilityState = 'visible';
  win.document.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('blinker:start'));
  win.dispatchEvent(new Event('blinker:start'));
  assert.equal(win.requests.length, 2);
  const records = win.requests.map(([, r]) => JSON.parse(r.body));
  assert.deepEqual(records[0], { site: '200games', event: 'page_view', slot: 'blinker', qa: true });
  assert.equal(records[1].event, 'game_start');
  assert.equal(win.requests[0][1].credentials, 'omit');
  assert.equal(win.requests[0][1].referrerPolicy, 'no-referrer');
  win.location = new URL('http://localhost:8000');
  mount(win, 'home');
  assert.equal(win.requests.length, 2);
});

test('invalid destinations and dates fail closed', () => {
  assert.ok(activeBooking(offer));
  assert.equal(activeBooking(offer, new Date(offer.end)), null);
  for (const edit of [{ destination: 'javascript:void(0)' }, { destination: 'https://u:p@example.org' },
    { start: '2020-02-30' }, { campaign: 'x y' }, { name: '' }]) assert.equal(activeBooking({ ...offer, ...edit }), null);
});

test('one continuous foreground second and 50% minimum determine visibility', () => {
  const win = browser();
  const obs = observations(win);
  let hits = 0;
  observePlacement(win, {}, () => { hits++; });
  obs.fraction(.7); obs.fraction(.4); obs.elapse();
  obs.fraction(.8); win.document.visibilityState = 'hidden';
  win.document.dispatchEvent(new Event('visibilitychange')); obs.elapse();
  assert.equal(hits, 0);
  win.document.visibilityState = 'visible';
  win.document.dispatchEvent(new Event('visibilitychange')); obs.elapse();
  assert.equal(hits, 1);
});

test('open stock and paid slots count separately and only booked links get tags', () => {
  for (const booked of [false, true]) {
    const win = browser();
    const obs = observations(win);
    const link = new EventTarget();
    const parts = { '[data-sponsor-label]': {}, '[data-sponsor-title]': {}, '[data-sponsor-cta]': link };
    win.document.querySelector = () => ({ querySelector: selector => parts[selector] });
    mount(win, 'directory', booked ? offer : null);
    obs.fraction(1); obs.elapse();
    const events = win.requests.map(([, r]) => JSON.parse(r.body).event);
    assert.deepEqual(events, ['page_view', booked ? 'slot_view' : 'inventory_view']);
    if (booked) {
      assert.equal(parts['[data-sponsor-label]'].textContent, 'Sponsored');
      assert.equal(new URL(link.href).searchParams.get('utm_content'), 'directory');
      assert.equal(new URL(link.href).searchParams.get('id'), '1');
      link.dispatchEvent(new Event('click'));
      assert.equal(win.requests.length, 2);
    } else assert.equal(link.href, undefined);
  }
});
