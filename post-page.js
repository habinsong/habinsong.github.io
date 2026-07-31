// A post page is written out as finished HTML so it can be read without any
// script at all. This only adds the two things the markup cannot carry: the
// interface labels in the reader's language, and the lightbox.

import { initI18n, registerMessages } from "./i18n.js";
import { openLightbox } from "./lightbox.js";
import { SITE_MESSAGES } from "./messages.js";

registerMessages(SITE_MESSAGES);
initI18n();

const frames = Array.from(document.querySelectorAll(".photo-card .photo-frame"));
const items = frames.map((frame) => {
  const card = frame.closest(".photo-card");
  const image = frame.querySelector("img");
  return {
    src: image?.getAttribute("src") ?? "",
    alt: image?.getAttribute("alt") ?? "",
    caption: card?.querySelector(".caption-main")?.textContent ?? "",
    meta: card?.querySelector(".caption-meta")?.textContent ?? "",
  };
});

frames.forEach((frame, index) => {
  frame.addEventListener("click", () => openLightbox(items, index));
});
