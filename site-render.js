import { t, tCount } from "./i18n.js";
import { normalizePhoto } from "./site-data.js";
import { isRecord, safeUrl, text } from "./site-utils.js";

// Every post is its own page. The hash route still works for links that were
// shared before, but nothing on the site points at it any more.
export function postHref(id) {
  return `/posts/${encodeURIComponent(id)}/`;
}

export function photoCard(photo, template, options = {}) {
  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error("Photo template is not available");
  }

  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".photo-card");
  const frame = fragment.querySelector(".photo-frame");
  const image = fragment.querySelector("img");
  const caption = fragment.querySelector(".caption-main");
  const meta = fragment.querySelector(".caption-meta");
  if (!(card instanceof HTMLElement) || !(frame instanceof HTMLButtonElement) || !(image instanceof HTMLImageElement) || caption === null || meta === null) {
    throw new Error("Photo template is incomplete");
  }

  card.dataset.medium = photo.medium;
  card.dataset.tone = photo.tone;
  card.dataset.photoId = photo.id;
  frame.style.setProperty("--ratio", `${photo.width} / ${photo.height}`);
  image.src = photo.src;
  image.alt = photo.alt;
  image.width = photo.width;
  image.height = photo.height;
  caption.textContent = captionText(photo);
  meta.textContent = metaText(photo);
  image.addEventListener("error", () => showMissingImage(frame, image, photo.src), { once: true });
  frame.addEventListener("click", () => {
    card.dispatchEvent(new CustomEvent("photo:open", { bubbles: true, detail: { id: photo.id } }));
  });

  const comment = text(options.comment, "");
  if (comment.length > 0) {
    const note = document.createElement("p");
    note.className = "photo-comment";
    note.textContent = comment;
    caption.parentElement?.append(note);
  }
  return card;
}

export function postCard(post, template, seriesTitle = "") {
  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error("Post template is not available");
  }

  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".post-card");
  const meta = fragment.querySelector(".post-meta");
  const link = fragment.querySelector(".post-link");
  const excerpt = fragment.querySelector(".post-excerpt");
  if (!(card instanceof HTMLElement) || meta === null || !(link instanceof HTMLAnchorElement) || excerpt === null) {
    throw new Error("Post template is incomplete");
  }

  meta.textContent = [post.date, seriesTitle, ...post.tags].filter(Boolean).join(" · ");
  link.href = postHref(post.id);
  link.textContent = post.title;
  excerpt.textContent = post.excerpt;
  return card;
}

export function seriesCard(series, postCount) {
  const card = document.createElement("article");
  card.className = "series-card";
  const title = document.createElement("h3");
  const link = document.createElement("a");
  link.href = `#series=${encodeURIComponent(series.id)}`;
  link.textContent = series.title;
  title.append(link);
  const count = document.createElement("p");
  count.className = "series-count";
  count.textContent = tCount("count.posts", postCount);
  card.append(title, count);
  if (series.description.length > 0) {
    const description = document.createElement("p");
    description.className = "series-desc";
    description.textContent = series.description;
    card.append(description);
  }
  return card;
}

export function archiveYear(year, posts, photoCount, seriesTitleOf) {
  const block = document.createElement("section");
  block.className = "archive-year";
  const heading = document.createElement("h3");
  heading.textContent = year;
  const body = document.createElement("div");
  body.className = "archive-body";
  const counts = [];
  if (posts.length > 0) {
    counts.push(tCount("count.posts", posts.length));
  }
  if (photoCount > 0) {
    counts.push(tCount("count.photos", photoCount));
  }
  const meta = document.createElement("p");
  meta.className = "archive-meta";
  meta.textContent = counts.join(" · ");
  body.append(meta);
  if (posts.length > 0) {
    const list = document.createElement("ul");
    list.className = "archive-posts";
    for (const post of posts) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = postHref(post.id);
      link.textContent = post.title;
      const date = document.createElement("span");
      date.className = "archive-date";
      date.textContent = [post.date, seriesTitleOf(post.series)].filter(Boolean).join(" · ");
      item.append(link, date);
      list.append(item);
    }
    body.append(list);
  }
  block.append(heading, body);
  return block;
}

export function postArticle(post, photoTemplate, seriesTitle = "") {
  const article = document.createElement("article");
  article.className = "post-article";
  const back = document.createElement("a");
  back.href = "#posts";
  back.className = "back-link";
  back.textContent = t("post.back");
  const meta = document.createElement("p");
  meta.className = "post-meta";
  meta.textContent = [post.date, seriesTitle].filter(Boolean).join(" · ");
  const title = document.createElement("h2");
  title.textContent = post.title;
  const excerpt = document.createElement("p");
  excerpt.className = "post-lead";
  excerpt.textContent = post.excerpt;
  article.append(back, meta, title, excerpt, ...post.blocks.map((block) => blockNode(block, photoTemplate)));
  return article;
}

export function postNav(older, newer) {
  if (older === undefined && newer === undefined) {
    return document.createDocumentFragment();
  }
  const nav = document.createElement("nav");
  nav.className = "post-nav";
  nav.append(postNavLink(older, "post.prev"), postNavLink(newer, "post.next"));
  return nav;
}

function postNavLink(summary, labelKey) {
  const slot = document.createElement("div");
  slot.className = `post-nav-slot ${labelKey === "post.next" ? "is-next" : "is-prev"}`;
  if (summary === undefined) {
    return slot;
  }
  const label = document.createElement("p");
  label.className = "post-nav-label";
  label.textContent = t(labelKey);
  const link = document.createElement("a");
  link.href = postHref(summary.id);
  link.textContent = summary.title;
  slot.append(label, link);
  return slot;
}

export function collectPostPhotos(post) {
  const photos = [];
  for (const block of post.blocks) {
    if (!isRecord(block)) {
      continue;
    }
    if (block.type === "photo") {
      photos.push(normalizePhoto(block.photo, photos.length));
    }
    if (block.type === "gallery" && Array.isArray(block.photos)) {
      for (const photo of block.photos) {
        photos.push(normalizePhoto(photo, photos.length));
      }
    }
  }
  return photos;
}

export function lightboxItem(photo) {
  return {
    src: photo.src,
    alt: photo.alt,
    caption: captionText(photo),
    meta: metaText(photo),
  };
}

function blockNode(block, photoTemplate) {
  if (!isRecord(block)) {
    return document.createDocumentFragment();
  }
  switch (block.type) {
    case "heading":
      return headingBlock(block);
    case "paragraph":
      return textBlock("p", "post-body-copy", block);
    case "quote":
      return textBlock("blockquote", "", block);
    case "photo":
      return photoCard(normalizePhoto(block.photo), photoTemplate, { comment: block.comment });
    case "gallery":
      return galleryBlock(block, photoTemplate);
    case "link-list":
      return linkListBlock(block);
    default:
      return document.createDocumentFragment();
  }
}

function headingBlock(block) {
  const heading = document.createElement("h3");
  heading.className = "post-heading";
  heading.textContent = text(block.text, t("post.untitled.section"));
  return heading;
}

function textBlock(tag, className, block) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text(block.text, "");
  return node;
}

function galleryBlock(block, photoTemplate) {
  const gallery = document.createElement("div");
  gallery.className = "inline-gallery";
  const photos = Array.isArray(block.photos) ? block.photos : [];
  gallery.append(...photos.map((photo) => photoCard(normalizePhoto(photo), photoTemplate)));
  return gallery;
}

function linkListBlock(block) {
  const section = document.createElement("section");
  section.className = "link-list";
  const title = document.createElement("h3");
  title.textContent = text(block.title, t("post.links.title"));
  const list = document.createElement("ul");
  for (const item of Array.isArray(block.links) ? block.links : []) {
    const listItem = linkItem(item);
    if (listItem !== null) {
      list.append(listItem);
    }
  }
  section.append(title, list);
  return section;
}

function linkItem(item) {
  if (!isRecord(item)) {
    return null;
  }
  const url = safeUrl(text(item.url, ""));
  if (url.length === 0) {
    return null;
  }
  const listItem = document.createElement("li");
  const link = document.createElement("a");
  link.href = url;
  link.textContent = text(item.label, url);
  link.rel = "noopener noreferrer";
  listItem.append(link);
  return listItem;
}

export function captionText(photo) {
  const location = [photo.place, photo.year].filter(Boolean).join(", ");
  return location.length > 0 ? t("caption.with.location", { title: photo.title, location }) : t("caption.plain", { title: photo.title });
}

export function metaText(photo) {
  const medium = t(photo.medium === "film" ? "medium.film" : "medium.digital");
  const tone = t(photo.tone === "bw" ? "tone.bw" : "tone.color");
  return [medium, tone, photo.details].filter(Boolean).join(" · ");
}

function showMissingImage(frame, image, src) {
  image.remove();
  frame.classList.add("is-missing");
  frame.disabled = true;
  const label = document.createElement("span");
  label.className = "missing-label";
  label.textContent = t("photo.missing", { src });
  frame.append(label);
}
