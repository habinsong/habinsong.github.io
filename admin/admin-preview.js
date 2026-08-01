import { t } from "../i18n.js";

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
      return textNode("h2", block.text, "post-heading");
    case "paragraph":
      return textNode("p", block.text, "post-body-copy");
    case "quote":
      return textNode("blockquote", block.text);
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

function textNode(tag, value, className = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
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
    image.src = URL.createObjectURL(asset.file);
    image.alt = photo.alt;
    image.addEventListener("load", () => URL.revokeObjectURL(image.src), { once: true });
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
