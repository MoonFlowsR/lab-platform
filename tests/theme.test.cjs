const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const modulePath = pathToFileURL(path.resolve(__dirname, '../src/shared/lib/theme.js')).href;
const loadTheme = () => import(modulePath);
function fixture({ saved, dark = false, blocked = false, legacyMedia = false } = {}) {
  const values = new Map(saved === undefined ? [] : [['platform:theme', saved]]);
  const storage = { getItem(key) { if (blocked) throw new Error('blocked'); return values.get(key) ?? null; }, setItem(key, value) { if (blocked) throw new Error('blocked'); values.set(key, value); } };
  const eventHandlers = new Map(), mediaHandlers = new Set();
  const root = { dataset: {}, style: {} }, meta = { content: '', setAttribute(key, value) { this[key] = value; } };
  const media = { matches: dark };
  if (legacyMedia) { media.addListener = listener => mediaHandlers.add(listener); media.removeListener = listener => mediaHandlers.delete(listener); }
  else { media.addEventListener = (_, listener) => mediaHandlers.add(listener); media.removeEventListener = (_, listener) => mediaHandlers.delete(listener); }
  const events = { addEventListener(name, listener) { eventHandlers.set(name, listener); }, removeEventListener(name, listener) { if (eventHandlers.get(name) === listener) eventHandlers.delete(name); } };
  return {
    root, storage, media, events, meta, values, mediaHandlers, eventHandlers,
    system(value) { media.matches = value; mediaHandlers.forEach(listener => listener()); },
    storageEvent(event) { eventHandlers.get('storage')?.(event); },
  };
}

test('theme defaults to system and keeps the native controls and browser color in sync', async () => {
  const { createThemeController } = await loadTheme(), f = fixture({ dark: true });
  const store = createThemeController(f);
  assert.equal(store.getSnapshot(), 'system');
  assert.deepEqual(f.root.dataset, { theme: 'dark', themePreference: 'system' });
  assert.equal(f.root.style.colorScheme, 'dark');
  assert.equal(f.meta.content, '#0b1220');
  f.system(false);
  assert.equal(f.root.dataset.theme, 'light');
  assert.equal(f.meta.content, '#f4f6fa');
  store.dispose();
});

test('an explicit choice ignores system changes until follow-system is selected', async () => {
  const { createThemeController } = await loadTheme(), f = fixture();
  const store = createThemeController(f);
  store.setPreference('dark');
  f.system(true); f.system(false);
  assert.equal(f.root.dataset.theme, 'dark');
  assert.equal(f.values.get('platform:theme'), 'dark');
  store.setPreference('system');
  assert.equal(f.root.dataset.theme, 'light');
  f.system(true);
  assert.equal(f.root.dataset.theme, 'dark');
  store.dispose();
});

test('mixed preserves its visual preference while using light native controls and browser chrome', async () => {
  const { createThemeController } = await loadTheme(), f = fixture({ saved: 'mixed', dark: true });
  const store = createThemeController(f);
  assert.equal(store.getSnapshot(), 'mixed');
  assert.equal(f.root.dataset.theme, 'mixed');
  assert.equal(f.root.style.colorScheme, 'light');
  assert.equal(f.meta.content, '#f4f6fa');
  f.system(false); f.system(true);
  assert.equal(f.root.dataset.theme, 'mixed');
  store.setPreference('dark');
  assert.equal(f.meta.content, '#0b1220');
  store.setPreference('light');
  assert.equal(f.meta.content, '#f4f6fa');
  store.setPreference('mixed');
  assert.equal(f.values.get('platform:theme'), 'mixed');
  store.dispose();
});

test('the selected mode is reused on another page without touching account data', async () => {
  const { createThemeController } = await loadTheme(), first = fixture();
  first.values.set('platform-session', 'unchanged');
  const store = createThemeController(first);
  store.setPreference('dark'); store.dispose();
  const second = fixture({ dark: false }); second.storage = first.storage;
  const reloaded = createThemeController(second);
  assert.equal(reloaded.getSnapshot(), 'dark');
  assert.equal(second.root.dataset.theme, 'dark');
  assert.equal(first.values.get('platform-session'), 'unchanged');
  reloaded.dispose();
});

test('blocked browser storage still allows theme switching for the current page', async () => {
  const { createThemeController } = await loadTheme(), f = fixture({ blocked: true, dark: true });
  const store = createThemeController(f);
  assert.equal(f.root.dataset.theme, 'dark');
  assert.doesNotThrow(() => store.setPreference('light'));
  assert.equal(store.getSnapshot(), 'light');
  assert.equal(f.root.style.colorScheme, 'light');
  store.dispose();
});

test('cross-tab preferences and storage clearing update the current page', async () => {
  const { createThemeController } = await loadTheme(), f = fixture({ dark: true });
  const store = createThemeController(f);
  f.storageEvent({ key: 'unrelated', newValue: 'light' });
  assert.equal(store.getSnapshot(), 'system');
  f.storageEvent({ key: 'platform:theme', newValue: 'light', storageArea: {} });
  assert.equal(store.getSnapshot(), 'system');
  f.storageEvent({ key: 'platform:theme', newValue: 'light', storageArea: f.storage });
  assert.equal(store.getSnapshot(), 'light');
  assert.equal(f.root.dataset.theme, 'light');
  f.storageEvent({ key: null, newValue: null, storageArea: f.storage });
  assert.equal(store.getSnapshot(), 'system');
  assert.equal(f.root.dataset.theme, 'dark');
  store.dispose();
});

test('invalid stored values fall back to system, and subscriptions can be removed', async () => {
  const { createThemeController } = await loadTheme(), f = fixture({ saved: 'bad', legacyMedia: true });
  const store = createThemeController(f);
  assert.equal(store.getSnapshot(), 'system');
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  store.setPreference('dark'); store.setPreference('dark');
  assert.equal(notifications, 1);
  unsubscribe(); store.setPreference('light');
  assert.equal(notifications, 1);
  store.dispose();
  assert.equal(f.mediaHandlers.size, 0);
  assert.equal(f.eventHandlers.size, 0);
});

test('the HTML bootstrap applies every preference before app resources are loaded', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.ok(html.indexOf('<script>') < html.indexOf('type="module"'));
  for (const saved of [null, 'light', 'dark', 'mixed', 'system', 'invalid']) for (const dark of [false, true]) {
    const root = { dataset: {}, style: {} }, meta = {};
    vm.runInNewContext(script, {
      localStorage: { getItem: () => saved }, matchMedia: () => ({ matches: dark }),
      document: { documentElement: root, querySelector: () => meta },
    });
    const preference = ['light', 'dark', 'mixed', 'system'].includes(saved) ? saved : 'system';
    const expected = preference === 'system' ? (dark ? 'dark' : 'light') : preference;
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.dataset.themePreference, preference);
    assert.equal(root.style.colorScheme, expected === 'dark' ? 'dark' : 'light');
  }
  const root = { dataset: {}, style: {} };
  assert.doesNotThrow(() => vm.runInNewContext(script, {
    localStorage: { getItem() { throw new Error('blocked'); } }, matchMedia: () => ({ matches: true }),
    document: { documentElement: root, querySelector: () => ({}) },
  }));
  assert.equal(root.dataset.theme, 'dark');
});
