export const THEME_STORAGE_KEY = "platform:theme";
export const THEME_CHOICES = ["light", "dark", "system"];

const normalize = value => THEME_CHOICES.includes(value) ? value : "system";

// A small browser-local preference store, independent of accounts and sessions.
export function createThemeController({ root, storage, media, events, meta }) {
  function readPreference() {
    if (!storage) return normalize(root.dataset.themePreference);
    try { return normalize(storage?.getItem(THEME_STORAGE_KEY)); }
    catch { return normalize(root.dataset.themePreference); }
  }
  let preference = readPreference();
  const listeners = new Set();
  function apply() {
    const theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    root.dataset.theme = theme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = theme;
    meta?.setAttribute("content", theme === "dark" ? "#0b1220" : "#f4f6fa");
  }
  function update(value, persist) {
    const next = normalize(value), changed = preference !== next;
    preference = next;
    if (persist) {
      try { storage?.setItem(THEME_STORAGE_KEY, preference); } catch { /* The current page still supports switching when storage is blocked. */ }
    }
    apply();
    if (changed) listeners.forEach(listener => listener());
  }
  const onSystemChange = () => { if (preference === "system") apply(); };
  const onStorage = event => {
    if (event.storageArea && event.storageArea !== storage) return;
    if (event.key === THEME_STORAGE_KEY || event.key === null) update(event.newValue, false);
  };
  if (media.addEventListener) media.addEventListener("change", onSystemChange);
  else media.addListener(onSystemChange);
  events.addEventListener("storage", onStorage);
  apply();
  return {
    getSnapshot: () => preference,
    setPreference: value => update(value, true),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() {
      if (media.removeEventListener) media.removeEventListener("change", onSystemChange);
      else media.removeListener(onSystemChange);
      events.removeEventListener("storage", onStorage);
      listeners.clear();
    },
  };
}

let browserController;
export function initializeTheme() {
  if (!browserController) {
    let storage;
    try { storage = window.localStorage; } catch { /* Private browsing may deny access. */ }
    browserController = createThemeController({
      root: document.documentElement,
      storage,
      media: window.matchMedia("(prefers-color-scheme: dark)"),
      events: window,
      meta: document.querySelector('meta[name="theme-color"]'),
    });
  }
  return browserController;
}
export const subscribeTheme = listener => initializeTheme().subscribe(listener);
export const getThemePreference = () => initializeTheme().getSnapshot();
export const setThemePreference = value => initializeTheme().setPreference(value);
