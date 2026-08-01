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

/* A frame carries the facts of how it was made. The order is the one a note in
   a darkroom book runs in: the body, the glass it saw through, the stock it
   was laid on, then the exposure that was given. */
export const EXIF_FIELDS = Object.freeze(["camera", "lens", "film", "aperture", "shutter", "iso"]);

export function normalizeExif(value) {
  const record = isRecord(value) ? value : {};
  const clean = {};
  for (const field of EXIF_FIELDS) {
    clean[field] = text(record[field], "");
  }
  return Object.freeze(clean);
}

export function hasExif(exif) {
  return EXIF_FIELDS.some((field) => exif[field].length > 0);
}

export const SEASONS = Object.freeze(["winter", "spring", "summer", "autumn"]);

/* Seasons are read from the north — the archive is shot from Seoul. A frame
   dated to its year alone belongs to that year and to no season. */
export function seasonOf(date) {
  const match = /^\d{4}-(\d{2})/.exec(date);
  if (match === null) {
    return "";
  }
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? SEASONS[Math.floor((month % 12) / 3)] : "";
}

export function photoDate(value) {
  const date = text(value, "");
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(date) ? date : "";
}

export function photoTime(value) {
  const time = text(value, "");
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
}

export const ORIENTATIONS = Object.freeze(["landscape", "portrait", "square"]);

export function orientationOf(width, height) {
  if (width === height) {
    return "square";
  }
  return width > height ? "landscape" : "portrait";
}

export function normalizeSubjects(value) {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  return Object.freeze(Array.from(new Set(value.map((item) => text(item, "")).filter(Boolean))));
}

export const LIGHTS = Object.freeze(["blue", "golden", "day", "night"]);

/* Where the sun stood. These are approximate hours for a mid-northern
   latitude — the archive is shot from Seoul — and they are meant to name the
   light a frame was made in, not to survey it. A frame with no time recorded
   says nothing about its light; an author who knows better writes it down and
   that answer wins. */
const SUN = Object.freeze({
  spring: { up: 6.2, down: 19.0 },
  summer: { up: 5.4, down: 19.6 },
  autumn: { up: 6.6, down: 18.0 },
  winter: { up: 7.6, down: 17.4 },
  "": { up: 6.5, down: 18.5 },
});

const GOLDEN_HOURS = 1;
const BLUE_HOURS = 0.6;

export function lightOf(time, season) {
  const hour = decimalHour(time);
  if (hour === null) {
    return "";
  }
  const sun = SUN[season] ?? SUN[""];
  if ((hour >= sun.up && hour <= sun.up + GOLDEN_HOURS) || (hour >= sun.down - GOLDEN_HOURS && hour <= sun.down)) {
    return "golden";
  }
  if ((hour >= sun.up - BLUE_HOURS && hour < sun.up) || (hour > sun.down && hour <= sun.down + BLUE_HOURS)) {
    return "blue";
  }
  return hour > sun.up && hour < sun.down ? "day" : "night";
}

function decimalHour(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return match === null ? null : Number(match[1]) + Number(match[2]) / 60;
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
