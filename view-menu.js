// A compact segmented control that hangs off a section heading and changes how
// that section is laid out. The choice is remembered, so the site opens the way
// it was left without hiding the available views behind another click.

import { t } from "./i18n.js";

export function viewMenu({ storageKey, options, defaultId = "", onPick }) {
  const saved = read(storageKey);
  const fallback = options.find((option) => option.id === defaultId)?.id ?? options[0].id;
  let current = options.some((option) => option.id === saved) ? saved : fallback;

  const wrap = document.createElement("div");
  wrap.className = "view-menu";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", t("view.menu.aria"));

  const choices = document.createElement("div");
  choices.className = "view-options";
  choices.setAttribute("role", "radiogroup");

  const items = options.map((option) => {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = "view-choice";
    choice.setAttribute("role", "radio");
    choice.textContent = t(option.labelKey);
    choice.addEventListener("click", () => {
      current = option.id;
      write(storageKey, current);
      mark();
      onPick(current);
    });
    choices.append(choice);
    return { id: option.id, choice };
  });

  function mark() {
    for (const item of items) {
      item.choice.setAttribute("aria-checked", String(item.id === current));
    }
  }

  mark();
  wrap.append(choices);
  return {
    node: wrap,
    value: () => current,
    relabel: () => {
      wrap.setAttribute("aria-label", t("view.menu.aria"));
      for (const item of items) {
        const option = options.find((candidate) => candidate.id === item.id);
        item.choice.textContent = t(option.labelKey);
      }
    },
  };
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
