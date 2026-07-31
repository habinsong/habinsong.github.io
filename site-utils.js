export const DEFAULT_RATIO = Object.freeze({ width: 3, height: 2 });

export function requireElement(selector) {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function text(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function positiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function slug(title, index = 0) {
  const base = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/(^-|-$)/g, "");
  return base.length > 0 ? base : `item-${index + 1}`;
}

export function mediumValue(value) {
  return value === "film" || value === "digital" ? value : "digital";
}

export function safeUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function emptyState(titleText, copyText = "") {
  const section = document.createElement("section");
  section.className = "empty-state";
  section.setAttribute("aria-label", titleText);

  const title = document.createElement("h3");
  title.textContent = titleText;
  section.append(title);

  if (copyText.length > 0) {
    const copy = document.createElement("p");
    copy.textContent = copyText;
    section.append(copy);
  }
  return section;
}
