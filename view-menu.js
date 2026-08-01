// A small menu that hangs off a section heading and changes how that section
// is laid out. The choice is remembered, so the site opens the way it was left.

import { t } from "./i18n.js";

const OPEN_MENUS = new Set();

export function viewMenu({ storageKey, options, onPick }) {
  const saved = read(storageKey);
  let current = options.some((option) => option.id === saved) ? saved : options[0].id;

  const wrap = document.createElement("div");
  wrap.className = "view-menu";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "view-button";
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");

  const list = document.createElement("ul");
  list.className = "view-list";
  list.setAttribute("role", "menu");
  list.hidden = true;

  const label = () => {
    const chosen = options.find((option) => option.id === current);
    button.textContent = t(chosen.labelKey);
  };

  const items = options.map((option) => {
    const item = document.createElement("li");
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "view-choice";
    choice.setAttribute("role", "menuitemradio");
    choice.textContent = t(option.labelKey);
    choice.addEventListener("click", () => {
      current = option.id;
      write(storageKey, current);
      mark();
      label();
      close();
      onPick(current);
    });
    item.append(choice);
    list.append(item);
    return { id: option.id, choice };
  });

  function mark() {
    for (const item of items) {
      item.choice.setAttribute("aria-checked", String(item.id === current));
    }
  }

  function open() {
    for (const other of OPEN_MENUS) {
      other();
    }
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    OPEN_MENUS.add(close);
  }

  function close() {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    OPEN_MENUS.delete(close);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (list.hidden) {
      open();
    } else {
      close();
    }
  });

  document.addEventListener("click", (event) => {
    if (!list.hidden && !wrap.contains(event.target)) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !list.hidden) {
      close();
      button.focus();
    }
  });

  mark();
  label();
  wrap.append(button, list);
  return { node: wrap, value: () => current, relabel: () => { label(); for (const item of items) { const option = options.find((o) => o.id === item.id); item.choice.textContent = t(option.labelKey); } } };
}

function read(key) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private browsing blocks storage; the choice still holds for this visit.
  }
}
