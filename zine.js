// A zine is the site folded down to paper: a cover, the writing, one plate to
// a page, a colophon. It is built from the same JSON the pages are built from,
// laid out for a sheet rather than a screen, and handed to the browser's own
// print path — which is what turns it into a PDF with real type in it, at the
// full size of every photograph. Nothing is fetched from anywhere else.

import { t } from "./i18n.js";
import { loadJson, normalizePhoto } from "./site-data.js";
import { captionText, darkroomNotes, metaText } from "./site-render.js";
import { isRecord, text } from "./site-utils.js";

const IMAGE_WAIT = 5000;

export function mountZine(root = document) {
  for (const slot of root.querySelectorAll(".zine-slot")) {
    if (slot.dataset.zineReady === "true") {
      continue;
    }
    slot.dataset.zineReady = "true";
    slot.append(openButton(slot));
  }
}

function openButton(slot) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zine-open";
  button.dataset.i18n = "zine.open";
  button.textContent = t("zine.open");
  button.addEventListener("click", async () => {
    button.disabled = true;
    const label = button.textContent;
    button.textContent = t("zine.building");
    try {
      await open(slot);
    } catch (error) {
      console.error(error);
      window.alert(t("zine.failed"));
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
  return button;
}

async function open(slot) {
  const [site, chapters] = await Promise.all([siteConfig(), collect(slot)]);
  if (chapters.length === 0) {
    throw new Error("Nothing to bind");
  }
  const book = document.createElement("div");
  book.className = "zine";
  book.append(bar(book), pages(site, slot, chapters));
  document.body.append(book);
  document.body.classList.add("is-zine");
  document.addEventListener("keydown", escapeToClose, true);
  await settled(book);
  window.print();
}

function bar(book) {
  const strip = document.createElement("div");
  strip.className = "zine-bar";

  const hint = document.createElement("p");
  hint.className = "zine-hint";
  hint.dataset.i18n = "zine.hint";
  hint.textContent = t("zine.hint");

  const print = document.createElement("button");
  print.type = "button";
  print.className = "lightbox-button";
  print.dataset.i18n = "zine.print";
  print.textContent = t("zine.print");
  print.addEventListener("click", () => window.print());

  const close = document.createElement("button");
  close.type = "button";
  close.className = "lightbox-button";
  close.dataset.i18n = "zine.close";
  close.textContent = t("zine.close");
  close.addEventListener("click", () => closeZine());

  strip.append(hint, print, close);
  return strip;
}

function escapeToClose(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeZine();
  }
}

function closeZine() {
  document.removeEventListener("keydown", escapeToClose, true);
  document.body.classList.remove("is-zine");
  document.querySelector(".zine")?.remove();
}

async function siteConfig() {
  try {
    const site = await loadJson("/site.json");
    return isRecord(site) ? site : {};
  } catch {
    return {};
  }
}

/* One post, or every published post in a series, oldest first — a series read
   on paper runs the way it was shot. */
async function collect(slot) {
  if (slot.dataset.zine === "series") {
    const index = await loadJson("/content/posts/index.json");
    const members = (Array.isArray(index.posts) ? index.posts : [])
      .filter((post) => isRecord(post) && post.status === "published" && post.series === slot.dataset.zineId)
      .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
    return Promise.all(members.map(async (summary) => ({ summary, post: await loadJson(`/${summary.path}`) })));
  }
  const summary = {
    id: slot.dataset.zineId ?? "",
    title: slot.dataset.zineTitle ?? "",
    date: slot.dataset.zineDate ?? "",
    excerpt: slot.dataset.zineLead ?? "",
  };
  return [{ summary, post: await loadJson(`/${slot.dataset.zinePath}`) }];
}

function pages(site, slot, chapters) {
  const book = document.createElement("article");
  book.className = "zine-book";

  const plates = { count: 0 };
  /* One post needs no title page — the cover already is one. A series gives
     every post its own, so the reader knows where one ends and the next opens. */
  const body = chapters.flatMap((chapter) => chapterNodes(chapter, plates, chapters.length > 1));
  book.append(
    cover(site, slot, chapters, plates.count),
    ...body,
    colophon(site, chapters),
  );
  return book;
}

function cover(site, slot, chapters, plateCount) {
  const page = document.createElement("section");
  page.className = "zine-page zine-cover";

  const author = document.createElement("p");
  author.className = "zine-author";
  author.textContent = text(site.author, text(site.title, ""));

  const title = document.createElement("h1");
  title.textContent = text(slot.dataset.zineTitle, chapters[0].summary.title ?? "");

  const lead = document.createElement("p");
  lead.className = "zine-lead";
  lead.textContent = text(slot.dataset.zineLead, text(chapters[0].summary.excerpt, ""));

  const stamp = document.createElement("p");
  stamp.className = "zine-stamp";
  const dates = chapters.map((chapter) => text(chapter.summary.date, "")).filter(Boolean).sort();
  stamp.textContent = [span(dates), plateCount > 0 ? t("zine.plates", { n: plateCount }) : ""]
    .filter(Boolean)
    .join(" · ");

  page.append(author, title, lead, stamp);
  return page;
}

function span(dates) {
  if (dates.length === 0) {
    return "";
  }
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first === last ? first : `${first} — ${last}`;
}

function chapterNodes({ summary, post }, plates, withOpener) {
  const nodes = [];
  if (withOpener) {
    const opener = document.createElement("section");
    opener.className = "zine-page zine-chapter";
    const heading = document.createElement("h2");
    heading.textContent = text(post.title, text(summary.title, ""));
    const stamp = document.createElement("p");
    stamp.className = "zine-stamp";
    stamp.textContent = text(summary.date, "");
    const lead = document.createElement("p");
    lead.className = "zine-lead";
    lead.textContent = text(post.excerpt, text(summary.excerpt, ""));
    opener.append(stamp, heading, lead);
    nodes.push(opener);
  }
  for (const block of Array.isArray(post.blocks) ? post.blocks : []) {
    nodes.push(...blockNodes(block, plates));
  }
  return nodes;
}

function blockNodes(block, plates) {
  if (!isRecord(block)) {
    return [];
  }
  switch (block.type) {
    case "heading":
      return [copy("h3", "zine-heading", block.text)];
    case "paragraph":
      return [copy("p", "zine-copy", block.text)];
    case "quote":
      return [copy("blockquote", "zine-quote", block.text)];
    case "photo":
      return [plate(block.photo, text(block.comment, ""), plates)];
    case "gallery":
      return (Array.isArray(block.photos) ? block.photos : []).map((photo) => plate(photo, "", plates));
    case "link-list":
      return [links(block)];
    default:
      return [];
  }
}

function copy(tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text(value, "");
  return node;
}

/* One photograph to a page, numbered, with everything known about it set
   underneath — the way a plate is presented in a printed book. */
function plate(raw, comment, plates) {
  const photo = normalizePhoto(raw, plates.count);
  plates.count += 1;

  const figure = document.createElement("figure");
  figure.className = "zine-page zine-plate";

  const frame = document.createElement("div");
  frame.className = "zine-frame";
  const image = document.createElement("img");
  image.src = photo.src.startsWith("http") ? photo.src : `/${photo.src}`;
  image.alt = photo.alt;
  image.loading = "eager";
  image.decoding = "sync";
  frame.append(image);

  const caption = document.createElement("figcaption");
  const number = document.createElement("p");
  number.className = "zine-number";
  number.textContent = t("zine.plate", { n: plates.count });
  const main = document.createElement("p");
  main.className = "caption-main";
  main.textContent = captionText(photo);
  const meta = document.createElement("p");
  meta.className = "caption-meta";
  meta.textContent = metaText(photo);
  caption.append(number, main, meta);

  const notes = darkroomNotes(photo);
  if (notes !== null) {
    caption.append(notes);
  }
  if (comment.length > 0) {
    const note = document.createElement("p");
    note.className = "photo-comment";
    note.textContent = comment;
    caption.append(note);
  }

  figure.append(frame, caption);
  return figure;
}

function links(block) {
  const section = document.createElement("section");
  section.className = "zine-links";
  const heading = document.createElement("h3");
  heading.className = "zine-heading";
  heading.textContent = text(block.title, t("post.links.title"));
  const list = document.createElement("ul");
  for (const link of Array.isArray(block.links) ? block.links : []) {
    if (!isRecord(link)) {
      continue;
    }
    const item = document.createElement("li");
    item.textContent = [text(link.label, ""), text(link.url, "")].filter(Boolean).join(" — ");
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function colophon(site, chapters) {
  const page = document.createElement("section");
  page.className = "zine-page zine-colophon";

  const heading = document.createElement("h2");
  heading.dataset.i18n = "zine.colophon";
  heading.textContent = t("zine.colophon");

  const lines = [
    text(site.title, ""),
    text(site.author, ""),
    text(site.baseUrl, ""),
    text(site.email, ""),
    t("zine.printed", { date: new Date().toISOString().slice(0, 10) }),
    ...chapters.map((chapter) => text(chapter.summary.title, "")),
  ].filter(Boolean);

  const list = document.createElement("ul");
  list.className = "zine-colophon-list";
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  page.append(heading, list);
  return page;
}

/* A print started before the plates have arrived prints empty frames, so the
   dialog waits for every one of them to land — but never for long, and never
   on a frame that failed: a missing plate should not hold up the rest. */
async function settled(book) {
  const images = Array.from(book.querySelectorAll("img"));
  await Promise.race([
    Promise.all(images.map(arrived)),
    new Promise((resolve) => window.setTimeout(resolve, IMAGE_WAIT)),
  ]);
}

function arrived(image) {
  if (image.complete) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", resolve, { once: true });
  });
}
