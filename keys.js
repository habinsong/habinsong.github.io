// Reading a body of work on a desktop should not need the mouse. The keys are
// the ones a reader already knows from every viewer they have used: arrows to
// move, Escape to get out, a slash to search. Nothing here is a chord to learn.
//
// The lightbox keeps its own arrow handling, so anything typed while a dialog
// is open belongs to that dialog and is left alone.

import { LANGS, applyTranslations, currentLang, setLang, t } from "./i18n.js";

const SHORTCUTS = [
  { keys: ["←", "→"], labelKey: "keys.photo" },
  { keys: ["Esc"], labelKey: "keys.escape" },
  { keys: ["/", commandLabel()], labelKey: "keys.search" },
  { keys: ["L"], labelKey: "keys.lang" },
  { keys: ["?"], labelKey: "keys.help" },
];

let sheet = null;

export function initKeys(actions = {}) {
  sheet = buildSheet();
  document.body.append(sheet);
  mountFooterLink();
  document.addEventListener("keydown", (event) => handleKey(event, actions));
}

function handleKey(event, actions) {
  if (event.altKey || (event.metaKey && event.key.toLowerCase() !== "k") || (event.ctrlKey && event.key.toLowerCase() !== "k")) {
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch(actions);
    return;
  }
  if (isTyping(event.target)) {
    return;
  }
  /* Escape is the dialog's own, and so is every key while one is open — except
     the mark that opened this sheet in the first place. */
  if (sheet.open) {
    if (event.key === "?") {
      event.preventDefault();
      sheet.close();
    }
    return;
  }
  if (document.querySelector("dialog[open]") !== null) {
    return;
  }
  switch (event.key) {
    case "/":
      event.preventDefault();
      openSearch(actions);
      break;
    case "?":
      event.preventDefault();
      sheet.showModal();
      break;
    case "l":
    case "L":
      event.preventDefault();
      setLang(LANGS[(LANGS.indexOf(currentLang()) + 1) % LANGS.length]);
      break;
    case "Escape":
      actions.onEscape?.();
      break;
    default:
      break;
  }
}

function openSearch(actions) {
  actions.focusSearch?.();
}

function isTyping(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function buildSheet() {
  const dialog = document.createElement("dialog");
  dialog.id = "shortcuts";
  dialog.className = "shortcuts";
  dialog.dataset.i18nAttrs = "aria-label:keys.aria";
  dialog.setAttribute("aria-label", t("keys.aria"));

  const bar = document.createElement("div");
  bar.className = "shortcuts-bar";
  const title = document.createElement("h2");
  title.dataset.i18n = "keys.title";
  title.textContent = t("keys.title");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "lightbox-button";
  close.dataset.i18n = "keys.close";
  close.textContent = t("keys.close");
  close.addEventListener("click", () => dialog.close());
  bar.append(title, close);

  const list = document.createElement("dl");
  list.className = "shortcuts-list";
  for (const shortcut of SHORTCUTS) {
    const term = document.createElement("dt");
    for (const key of shortcut.keys) {
      const cap = document.createElement("kbd");
      cap.textContent = key;
      term.append(cap);
    }
    const meaning = document.createElement("dd");
    meaning.dataset.i18n = shortcut.labelKey;
    meaning.textContent = t(shortcut.labelKey);
    list.append(term, meaning);
  }

  dialog.append(bar, list);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  return dialog;
}

/* The footer is where a reader looks for the small print, so the way in lives
   there. Touch screens have no keys to press, and are not shown it. */
function mountFooterLink() {
  const footer = document.querySelector(".site-footer");
  if (footer === null) {
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "keys-open";
  button.dataset.i18n = "keys.title";
  button.textContent = t("keys.title");
  button.addEventListener("click", () => sheet.showModal());
  footer.append(button);
  applyTranslations(footer);
}

function commandLabel() {
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "";
  return /mac/i.test(platform) ? "⌘K" : "Ctrl K";
}
