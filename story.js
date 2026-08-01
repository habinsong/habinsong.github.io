// A post can be read two ways. "Read" is the page as it is written: text and
// photographs in a column, all of it there at once. "Sequence" gives every
// block the height of the screen to itself and lets each one arrive as it is
// reached, which is closer to turning the pages of a book than to scrolling.
//
// Nothing is hidden until the observer says so, so a reader without script, or
// one who has asked for less motion, still gets the whole post.

import { viewMenu } from "./view-menu.js";

const BLOCKS = ".post-body-copy, .post-heading, blockquote, .photo-card, .inline-gallery, .link-list";

/* If the observer has said nothing at all by now it is not going to, and a
   post that never arrives is worse than one that arrives all at once. */
const PATIENCE = 1200;

let watcher = null;

export function mountStory(root = document) {
  const slot = root.querySelector(".story-slot");
  const article = root.querySelector(".post-article");
  if (slot === null || article === null || slot.dataset.storyReady === "true") {
    return;
  }
  slot.dataset.storyReady = "true";

  const menu = viewMenu({
    storageKey: "habin-view-post",
    options: [
      { id: "read", labelKey: "view.post.read" },
      { id: "story", labelKey: "view.post.story" },
    ],
    onPick: (mode) => apply(article, mode),
  });
  slot.append(menu.node);
  window.addEventListener("langchange", () => menu.relabel());
  apply(article, menu.value());
}

function apply(article, mode) {
  watcher?.disconnect();
  watcher = null;
  const blocks = Array.from(article.querySelectorAll(BLOCKS));
  article.classList.toggle("is-story", mode === "story");
  for (const block of blocks) {
    block.classList.remove("is-arrived");
  }
  if (mode !== "story") {
    return;
  }
  if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const block of blocks) {
      block.classList.add("is-arrived");
    }
    return;
  }
  let heard = false;
  watcher = new IntersectionObserver((entries) => {
    heard = true;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-arrived");
        watcher.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
  for (const block of blocks) {
    watcher.observe(block);
  }
  window.setTimeout(() => {
    if (heard) {
      return;
    }
    watcher?.disconnect();
    watcher = null;
    for (const block of blocks) {
      block.classList.add("is-arrived");
    }
  }, PATIENCE);
}
