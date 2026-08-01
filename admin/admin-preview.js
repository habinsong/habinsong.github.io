import { t } from "../i18n.js";

export function renderPreview(preview, post, assets) {
  const title = document.createElement("h3");
  title.textContent = post.title || t("a.preview.untitled");
  const meta = document.createElement("p");
  meta.className = "post-meta";
  meta.textContent = [post.date, ...post.tags].filter(Boolean).join(" · ");
  const excerpt = document.createElement("p");
  excerpt.textContent = post.excerpt;
  preview.replaceChildren(meta, title, excerpt, ...post.blocks.map((block) => previewBlock(block, assets)));
}

function previewBlock(block, assets) {
  switch (block.type) {
    case "heading":
      return textNode("h4", block.text);
    case "paragraph":
    case "quote":
      return textNode("p", block.text);
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

function textNode(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

function previewGallery(photos, assets) {
  const group = document.createElement("div");
  group.className = "preview-gallery";
  group.append(...photos.map((photo) => previewPhoto(photo, assets)));
  return group;
}

function previewLinks(block) {
  const section = document.createElement("section");
  section.className = "preview-link-list";
  const heading = document.createElement("p");
  heading.textContent = block.title;
  section.append(heading);
  for (const link of block.links) {
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.textContent = link.label;
    section.append(anchor);
  }
  return section;
}

function previewPhoto(photo, assets, comment = "") {
  const figure = document.createElement("figure");
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
