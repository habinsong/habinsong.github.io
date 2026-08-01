// Search over what the site holds. The index is a single file the release
// script writes, and it is only fetched once someone actually types.

import { t } from "./i18n.js";

const INDEX_URL = "search.json";

let index = null;
let pending = null;

export async function loadIndex() {
  if (index !== null) {
    return index;
  }
  if (pending === null) {
    pending = fetch(INDEX_URL, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        index = data ?? { posts: [], photos: [] };
        return index;
      })
      .catch(() => {
        index = { posts: [], photos: [] };
        return index;
      });
  }
  return pending;
}

// Korean and Japanese have no spaces to lean on, so this stays a plain
// substring match. Every term has to appear somewhere in the entry.
export function search(query, photos) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (index === null || terms.length === 0) {
    return { posts: [], photos: [] };
  }

  const postHits = [];
  for (const post of index.posts) {
    const strong = `${post.title} ${post.tags.join(" ")} ${post.series}`.toLowerCase();
    const whole = `${strong} ${post.excerpt} ${post.text}`.toLowerCase();
    if (!terms.every((term) => whole.includes(term))) {
      continue;
    }
    postHits.push({ post, rank: terms.every((term) => strong.includes(term)) ? 0 : 1 });
  }
  postHits.sort((a, b) => a.rank - b.rank || (b.post.date || "").localeCompare(a.post.date || ""));

  const wanted = new Set();
  for (const photo of index.photos) {
    if (terms.every((term) => photo.words.toLowerCase().includes(term))) {
      wanted.add(photo.id);
    }
  }

  return {
    posts: postHits.map((hit) => hit.post),
    photos: photos.filter((photo) => wanted.has(photo.id)),
  };
}

export function searchField(onChange) {
  const form = document.createElement("form");
  form.className = "search";
  form.setAttribute("role", "search");

  const input = document.createElement("input");
  input.type = "search";
  input.className = "search-input";
  input.autocomplete = "off";
  input.setAttribute("aria-label", t("search.label"));
  input.placeholder = t("search.label");

  let timer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => onChange(input.value.trim()), 120);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value !== "") {
      event.stopPropagation();
      input.value = "";
      onChange("");
    }
  });
  form.addEventListener("submit", (event) => event.preventDefault());

  form.append(input);
  return {
    node: form,
    set: (value) => {
      input.value = value;
    },
    focus: () => input.focus(),
    relabel: () => {
      input.placeholder = t("search.label");
      input.setAttribute("aria-label", t("search.label"));
    },
  };
}
