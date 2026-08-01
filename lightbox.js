import { t } from "./i18n.js";
import { requireElement } from "./site-utils.js";

let items = [];
let index = 0;
let wired = false;
let restoreHash = null;

function stampHash() {
  const id = items[index]?.id ?? "";
  if (id !== "") {
    history.replaceState(null, "", `#photo=${encodeURIComponent(id)}`);
  }
}

function closeNow(dialog) {
  clearHash();
  dialog.close();
}

function clearHash() {
  if (restoreHash !== null) {
    history.replaceState(null, "", restoreHash === "" ? window.location.pathname : restoreHash);
    restoreHash = null;
  }
}

export function openLightbox(list, start) {
  if (!Array.isArray(list) || list.length === 0) {
    return;
  }
  items = list;
  index = Math.min(Math.max(start, 0), items.length - 1);
  /* a photograph on screen deserves an address someone can send */
  if (restoreHash === null) {
    restoreHash = window.location.hash;
  }
  const dialog = requireElement("#lightbox");
  wireOnce(dialog);
  show(dialog);
  if (!dialog.open) {
    dialog.showModal();
  }
}

function wireOnce(dialog) {
  if (wired) {
    return;
  }
  wired = true;
  requireElement("#lightbox-close").addEventListener("click", () => closeNow(dialog));
  /* Escape closes the dialog on its own, and some browsers are quiet about the
     close event, so the address is put back on every route out. */
  dialog.addEventListener("cancel", clearHash);
  dialog.addEventListener("close", clearHash);
  requireElement("#lightbox-prev").addEventListener("click", () => step(dialog, -1));
  requireElement("#lightbox-next").addEventListener("click", () => step(dialog, 1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(dialog, -1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(dialog, 1);
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeNow(dialog);
    }
  });
}

function step(dialog, direction) {
  if (items.length < 2) {
    return;
  }
  index = (index + direction + items.length) % items.length;
  show(dialog);
}

function show(dialog) {
  const item = items[index];
  const image = requireElement("#lightbox-image");
  image.src = item.src;
  image.alt = item.alt;
  requireElement("#lightbox-caption").textContent = item.caption;
  requireElement("#lightbox-meta").textContent = item.meta;
  requireElement("#lightbox-counter").textContent = items.length > 1 ? t("lb.counter", { current: index + 1, total: items.length }) : "";
  const single = items.length < 2;
  requireElement("#lightbox-prev").hidden = single;
  requireElement("#lightbox-next").hidden = single;
  stampHash();
}
