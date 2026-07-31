export const LANGS = Object.freeze(["ko", "en", "ja", "zh"]);

const STORAGE_KEY = "habin-lang";
const HTML_LANG = Object.freeze({ ko: "ko", en: "en", ja: "ja", zh: "zh-Hans" });
const LOCALE = Object.freeze({ ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" });

let current = detectLang();
const messages = {};

export function registerMessages(bundle) {
  Object.assign(messages, bundle);
}

export function currentLang() {
  return current;
}

export function currentLocale() {
  return LOCALE[current];
}

export function t(key, params = {}) {
  const entry = messages[key];
  const template = entry?.[current] ?? entry?.en ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

export function tCount(key, count) {
  const variant = count === 1 && messages[`${key}.one`] !== undefined ? `${key}.one` : `${key}.other`;
  return t(variant, { n: count });
}

export function initI18n() {
  for (const button of document.querySelectorAll(".lang-switch [data-lang]")) {
    button.addEventListener("click", () => setLang(button.dataset.lang ?? "en"));
  }
  applyLanguage();
}

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) {
    return;
  }
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private browsing may block storage; the choice still applies to this page.
  }
  applyLanguage();
  window.dispatchEvent(new CustomEvent("langchange", { detail: { lang } }));
}

export function applyTranslations(root) {
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-attrs]")) {
    for (const pair of node.dataset.i18nAttrs.split(";")) {
      const [attribute, key] = pair.split(":").map((part) => part.trim());
      if (attribute && key) {
        node.setAttribute(attribute, t(key));
      }
    }
  }
}

function applyLanguage() {
  document.documentElement.lang = HTML_LANG[current];
  applyTranslations(document);
  for (const button of document.querySelectorAll(".lang-switch [data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === current));
  }
}

function detectLang() {
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (fromQuery !== null && LANGS.includes(fromQuery)) {
    try {
      window.localStorage.setItem(STORAGE_KEY, fromQuery);
    } catch {
      // Storage may be unavailable; the query value still wins for this page.
    }
    return fromQuery;
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null && LANGS.includes(saved)) {
      return saved;
    }
  } catch {
    // Fall through to browser language detection.
  }
  for (const preference of navigator.languages ?? [navigator.language]) {
    const base = (preference ?? "").slice(0, 2).toLowerCase();
    if (LANGS.includes(base)) {
      return base;
    }
  }
  return "en";
}
