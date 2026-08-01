// Sending a page to someone. These are ordinary links to ordinary addresses —
// no buttons loaded from anyone else's server, so nothing here can watch who
// read what. The copy control uses the clipboard the reader already has.

import { t } from "./i18n.js";
import { text } from "./site-utils.js";

const SAID_SO = 1600;

const ELSEWHERE = [
  { name: "X", href: ({ url, title }) => `https://twitter.com/intent/tweet?url=${url}&text=${title}` },
  { name: "Threads", href: ({ url, title }) => `https://www.threads.net/intent/post?text=${title}%20${url}` },
];

export function mountShare(root = document) {
  for (const slot of root.querySelectorAll(".share-slot")) {
    if (slot.dataset.shareReady === "true") {
      continue;
    }
    slot.dataset.shareReady = "true";
    slot.append(controls(slot));
  }
}

function controls(slot) {
  const url = text(slot.dataset.shareUrl, window.location.href);
  const title = text(slot.dataset.shareTitle, document.title);
  const encoded = { url: encodeURIComponent(url), title: encodeURIComponent(title) };

  const row = document.createElement("div");
  row.className = "share-row";

  for (const target of ELSEWHERE) {
    const link = document.createElement("a");
    link.className = "share-link";
    link.href = target.href(encoded);
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.textContent = target.name;
    row.append(link);
  }

  const mail = document.createElement("a");
  mail.className = "share-link";
  mail.href = `mailto:?subject=${encoded.title}&body=${encoded.url}`;
  mail.dataset.i18n = "share.mail";
  mail.textContent = t("share.mail");
  row.append(mail, copyButton(url));
  return row;
}

function copyButton(url) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "share-link is-copy";
  button.dataset.i18n = "share.copy";
  button.textContent = t("share.copy");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    /* the label says what happened, then goes back to what it does */
    const resting = button.dataset.i18n;
    delete button.dataset.i18n;
    button.textContent = t("share.copied");
    window.setTimeout(() => {
      button.dataset.i18n = resting;
      button.textContent = t(resting);
    }, SAID_SO);
  });
  return button;
}
