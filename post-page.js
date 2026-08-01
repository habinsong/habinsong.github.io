// A post page is written out as finished HTML so it can be read without any
// script at all. This only adds the two things the markup cannot carry: the
// interface labels in the reader's language, and the lightbox.

import { initI18n, registerMessages } from "./i18n.js";
import { openLightbox } from "./lightbox.js";
import { SITE_MESSAGES } from "./messages.js?v=20260802-clear-ui";
import { mountShare } from "./share.js?v=20260802-clear-ui";
import { mountSound } from "./sound.js";

registerMessages(SITE_MESSAGES);
initI18n();
mountShare();
mountSound();

/* A post page carries no index of its own; searching from here hands the
   words to the front page, which has them. */
const search = document.querySelector("#search-slot input");
search?.closest("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = search.value.trim();
  window.location.href = query === "" ? "/" : `/#q=${encodeURIComponent(query)}`;
});

const frames = Array.from(document.querySelectorAll(".photo-card .photo-frame"));
const items = frames.map((frame) => {
  const card = frame.closest(".photo-card");
  const image = frame.querySelector("img");
  return {
    id: card?.dataset.photoId ?? "",
    src: image?.getAttribute("src") ?? "",
    alt: image?.getAttribute("alt") ?? "",
    caption: card?.querySelector(".caption-main")?.textContent ?? "",
    meta: card?.querySelector(".caption-meta")?.textContent ?? "",
    /* the notes are already written into the page; the dialog shows a copy */
    notes: card?.querySelector(".darkroom-notes") ?? null,
  };
});

frames.forEach((frame, index) => {
  frame.addEventListener("click", () => openLightbox(items, index));
});
