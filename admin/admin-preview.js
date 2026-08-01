import { t } from "../i18n.js";
import { appendRichText } from "../rich-text.js?v=20260802-rich-v1";

export function renderPreview(preview, post, assets) {
  const title = document.createElement("h1");
  title.textContent = post.title || t("a.preview.untitled");
  const meta = document.createElement("p");
  meta.className = "post-meta";
  meta.textContent = [post.date, ...post.tags].filter(Boolean).join(" · ");
  const excerpt = document.createElement("p");
  excerpt.className = "post-lead";
  excerpt.textContent = post.excerpt;
  preview.replaceChildren(meta, title, excerpt, ...post.blocks.map((block) => previewBlock(block, assets)));
}

function previewBlock(block, assets) {
  switch (block.type) {
    case "heading":
      return textNode("h2", block.text, "post-heading", block.runs);
    case "paragraph":
      return textNode("p", block.text, "post-body-copy", block.runs);
    case "quote":
      return textNode("blockquote", block.text, "", block.runs);
    case "photo":
      return previewPhoto(block.photo, assets, block.comment);
    case "gallery":
      return previewGallery(block.photos, assets);
    case "link-list":
      return previewLinks(block);
    default:
      return document.createDocumentFragment();
  }
}

function textNode(tag, value, className = "", runs = []) {
  const node = document.createElement(tag);
  node.className = className;
  appendRichText(node, value, runs);
  return node;
}

function previewGallery(photos, assets) {
  const group = document.createElement("div");
  group.className = "inline-gallery";
  group.append(...photos.map((photo) => previewPhoto(photo, assets)));
  return group;
}

function previewLinks(block) {
  const section = document.createElement("section");
  section.className = "link-list";
  const heading = document.createElement("h3");
  heading.textContent = block.title;
  section.append(heading);
  const list = document.createElement("ul");
  for (const link of block.links) {
    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.textContent = link.label;
    item.append(anchor);
    list.append(item);
  }
  section.append(list);
  return section;
}

function previewPhoto(photo, assets, comment = "") {
  const figure = document.createElement("figure");
  figure.className = "photo-card";
  const asset = assets.find((item) => item.id === photo.assetId);
  if (asset !== undefined) {
    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = photo.alt;
    figure.append(image);
  }
  const caption = document.createElement("figcaption");
  caption.textContent = photoCaption(photo);
  figure.append(caption);
  if (typeof comment === "string" && comment.trim().length > 0) {
    const note = document.createElement("p");
    note.className = "preview-comment";
    note.textContent = comment.trim();
    figure.append(note);
  }
  return figure;
}

function photoCaption(photo) {
  const location = [photo.place, photo.year].filter(Boolean).join(", ");
  return location.length > 0 ? t("caption.with.location", { title: photo.title, location }) : t("caption.plain", { title: photo.title });
}
