import { t } from "../i18n.js";
import { uniqueId } from "./admin-utils.js";

// A minimal WYSIWYG canvas for the post schema: plain-text blocks
// (paragraph/heading/quote) edited directly via contenteditable, and atomic
// islands (photo/gallery/link-list) as contenteditable="false" nodes whose
// inner inputs stay interactive. No inline formatting exists in the schema,
// which keeps the editor away from execCommand entirely.

let canvas = null;
let getAssets = () => [];
let notifyChange = () => {};
let onFilesDropped = () => {};

export function initEditor(options) {
  canvas = options.canvas;
  getAssets = options.getAssets;
  notifyChange = options.onChange;
  onFilesDropped = options.onFilesDropped;

  canvas.addEventListener("paste", (event) => {
    event.preventDefault();
    insertPlainText(event.clipboardData?.getData("text/plain") ?? "");
  });

  canvas.addEventListener("dragover", (event) => {
    if (hasFiles(event)) {
      event.preventDefault();
      canvas.classList.add("is-dragover");
    }
  });

  canvas.addEventListener("dragleave", () => {
    canvas.classList.remove("is-dragover");
  });

  canvas.addEventListener("drop", (event) => {
    canvas.classList.remove("is-dragover");
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    moveCaretToPoint(event.clientX, event.clientY);
    onFilesDropped(Array.from(event.dataTransfer.files));
  });

  canvas.addEventListener("click", (event) => {
    const control = event.target instanceof HTMLElement ? event.target.closest("[data-isl]") : null;
    if (control === null) {
      return;
    }
    event.preventDefault();
    const island = control.closest(".ed-island");
    if (island === null) {
      return;
    }
    applyIslandControl(island, control.dataset.isl);
  });

  ensureTextBlock();
}

export function loadBlocks(blocks) {
  canvas.replaceChildren(...blocks.map((block) => blockToNode(block)).filter((node) => node !== null));
  ensureTextBlock();
}

export function serializeBlocks() {
  const blocks = [];
  for (const node of Array.from(canvas.children)) {
    const block = nodeToBlock(node);
    if (block !== null) {
      blocks.push(block);
    }
  }
  return blocks;
}

export function insertTextBlock(type) {
  const tag = type === "heading" ? "h3" : type === "quote" ? "blockquote" : "p";
  if (convertSelectedTextBlock(tag)) {
    return;
  }
  const block = textNode(tag, "");
  const anchor = currentBlock();
  const target = currentTextBlock();
  const onlyBlock = canvas.children.length === 1 ? canvas.firstElementChild : null;
  if (target !== null && isEmptyTextBlock(target)) {
    target.replaceWith(block);
  } else if (anchor !== null) {
    anchor.after(block);
  } else if (onlyBlock instanceof HTMLElement && isEmptyTextBlock(onlyBlock)) {
    onlyBlock.replaceWith(block);
  } else {
    canvas.append(block);
  }
  placeCaretAtEnd(block);
  notifyChange();
}

export function insertPhotoIsland(assetId) {
  insertIsland(photoIsland({ id: uniqueId("photo"), type: "photo", assetId, comment: "" }));
}

export function insertAllPhotoIslands() {
  for (const asset of getAssets()) {
    insertIsland(photoIsland({ id: uniqueId("photo"), type: "photo", assetId: asset.id, comment: "" }), { silent: true });
  }
  ensureTextBlock();
  notifyChange();
}

export function insertGalleryIsland() {
  insertIsland(galleryIsland({ id: uniqueId("gallery"), type: "gallery", assetIds: getAssets().map((asset) => asset.id) }));
}

export function insertLinkListIsland() {
  insertIsland(linkListIsland({ id: uniqueId("link-list"), type: "link-list", title: t("a.linklist.default.title"), linksText: "" }));
}

export function removeAssetIslands(assetId) {
  for (const island of canvas.querySelectorAll(`[data-block="photo"][data-asset-id="${assetId}"]`)) {
    island.remove();
  }
  for (const box of canvas.querySelectorAll(`.ed-gal-item input[data-asset-id="${assetId}"]`)) {
    box.closest(".ed-gal-item")?.remove();
  }
  for (const island of canvas.querySelectorAll('[data-block="gallery"]')) {
    updateGalleryCount(island);
  }
  ensureTextBlock();
  notifyChange();
}

export function refreshAssets() {
  const assets = getAssets();
  for (const island of canvas.querySelectorAll('[data-block="photo"]')) {
    const asset = assets.find((item) => item.id === island.dataset.assetId);
    const label = island.querySelector(".ed-island-label");
    if (asset !== undefined && label !== null) {
      label.textContent = asset.title || asset.file.name;
    }
  }
  for (const island of canvas.querySelectorAll('[data-block="gallery"]')) {
    syncGalleryItems(island, assets);
  }
}

function insertIsland(island, options = {}) {
  const anchor = currentBlock();
  if (anchor !== null) {
    anchor.after(island);
  } else {
    canvas.append(island);
  }
  if (options.silent === true) {
    return;
  }
  ensureTextBlock();
  const next = island.nextElementSibling;
  if (next instanceof HTMLElement && next.dataset.block === undefined) {
    placeCaretAtEnd(next);
  }
  notifyChange();
}

function applyIslandControl(island, action) {
  if (action === "remove") {
    island.remove();
  }
  if (action === "up" && island.previousElementSibling !== null) {
    island.previousElementSibling.before(island);
  }
  if (action === "down" && island.nextElementSibling !== null) {
    island.nextElementSibling.after(island);
  }
  ensureTextBlock();
  notifyChange();
}

function blockToNode(block) {
  switch (block.type) {
    case "heading":
      return textNode("h3", block.text ?? "");
    case "quote":
      return textNode("blockquote", block.text ?? "");
    case "paragraph":
      return textNode("p", block.text ?? "");
    case "photo":
      return photoIsland(block);
    case "gallery":
      return galleryIsland(block);
    case "link-list":
      return linkListIsland(block);
    default:
      return null;
  }
}

function nodeToBlock(node) {
  if (!(node instanceof HTMLElement)) {
    return null;
  }
  const kind = node.dataset.block;
  if (kind === "photo") {
    const comment = node.querySelector(".ed-comment")?.value ?? "";
    const imported = parseDataJson(node.dataset.photo);
    if (imported !== null) {
      return { id: node.dataset.blockId, type: "photo", photo: imported, comment };
    }
    return { id: node.dataset.blockId, type: "photo", assetId: node.dataset.assetId ?? "", comment };
  }
  if (kind === "gallery") {
    const imported = parseDataJson(node.dataset.photos);
    if (imported !== null) {
      return { id: node.dataset.blockId, type: "gallery", photos: imported };
    }
    const assetIds = Array.from(node.querySelectorAll(".ed-gal-item input:checked")).map((box) => box.dataset.assetId ?? "");
    return { id: node.dataset.blockId, type: "gallery", assetIds };
  }
  if (kind === "link-list") {
    return {
      id: node.dataset.blockId,
      type: "link-list",
      title: node.querySelector(".ed-ll-title")?.value ?? "",
      linksText: node.querySelector(".ed-ll-links")?.value ?? "",
    };
  }
  const text = node.innerText.replace(/\u00a0/g, " ").trim();
  if (text.length === 0) {
    return null;
  }
  const tag = node.tagName.toLowerCase();
  const type = tag === "h3" ? "heading" : tag === "blockquote" ? "quote" : "paragraph";
  return { id: uniqueId(type), type, text };
}

function textNode(tag, text) {
  const node = document.createElement(tag);
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    node.append(document.createTextNode(line));
    if (index < lines.length - 1) {
      node.append(document.createElement("br"));
    }
  });
  if (text.length === 0) {
    node.append(document.createElement("br"));
  }
  return node;
}

function photoIsland(block) {
  const island = islandShell("photo", block.id);
  if (isPhotoObject(block.photo)) {
    island.dataset.photo = JSON.stringify(block.photo);
    island.append(islandHead(block.photo.title || block.photo.src));
    const image = document.createElement("img");
    image.src = `../${block.photo.src}`;
    image.alt = typeof block.photo.alt === "string" ? block.photo.alt : "";
    image.addEventListener("error", () => image.remove(), { once: true });
    island.append(image, commentInput(block.comment));
    return island;
  }
  const asset = getAssets().find((item) => item.id === block.assetId);
  island.dataset.assetId = block.assetId ?? "";
  island.append(islandHead(asset !== undefined ? asset.title || asset.file.name : t("a.island.missing", { title: block.assetId ?? "?" })));
  if (asset !== undefined) {
    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = asset.alt || asset.title;
    island.append(image);
  }
  island.append(commentInput(block.comment));
  return island;
}

function commentInput(value) {
  const comment = document.createElement("input");
  comment.className = "ed-comment";
  comment.placeholder = t("a.field.comment");
  comment.value = typeof value === "string" ? value : "";
  return comment;
}

function isPhotoObject(value) {
  return typeof value === "object" && value !== null && typeof value.src === "string";
}

function parseDataJson(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function galleryIsland(block) {
  const island = islandShell("gallery", block.id);
  if (Array.isArray(block.photos)) {
    island.dataset.photos = JSON.stringify(block.photos);
    island.append(islandHead(t("a.gallery.imported", { n: block.photos.length })));
    const list = document.createElement("p");
    list.className = "ed-gal-static";
    list.textContent = block.photos.map((photo) => photo?.title || photo?.src || "?").join(" · ");
    island.append(list);
    return island;
  }
  island.append(islandHead(t("a.gallery.pick")));
  const tools = document.createElement("div");
  tools.className = "ed-gal-toolbar";
  const count = document.createElement("span");
  count.className = "ed-gal-count";
  const actions = document.createElement("span");
  actions.className = "ed-gal-actions";
  const selectAll = galleryAction(t("a.gallery.select.all"));
  const selectNone = galleryAction(t("a.gallery.select.none"));
  actions.append(selectAll, selectNone);
  tools.append(count, actions);
  const grid = document.createElement("div");
  grid.className = "ed-gal-grid";
  island.append(tools, grid);
  selectAll.addEventListener("click", () => {
    for (const box of grid.querySelectorAll("input")) box.checked = true;
    updateGalleryCount(island);
    notifyChange();
  });
  selectNone.addEventListener("click", () => {
    for (const box of grid.querySelectorAll("input")) box.checked = false;
    updateGalleryCount(island);
    notifyChange();
  });
  island.dataset.initialIds = (block.assetIds ?? []).join(",");
  syncGalleryItems(island, getAssets(), new Set(block.assetIds ?? []));
  return island;
}

function galleryAction(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ed-gal-action";
  button.textContent = label;
  return button;
}

function syncGalleryItems(island, assets, checkedIds = null) {
  const grid = island.querySelector(".ed-gal-grid");
  if (grid === null) {
    return;
  }
  const existing = new Set(Array.from(grid.querySelectorAll("input")).map((box) => box.dataset.assetId));
  const initial = checkedIds ?? new Set((island.dataset.initialIds ?? "").split(",").filter(Boolean));
  for (const asset of assets) {
    if (existing.has(asset.id)) {
      continue;
    }
    const item = document.createElement("label");
    item.className = "ed-gal-item";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.assetId = asset.id;
    box.checked = checkedIds !== null ? initial.has(asset.id) : true;
    const thumb = document.createElement("img");
    thumb.src = asset.url;
    thumb.alt = "";
    const name = document.createElement("span");
    name.textContent = asset.title || asset.file.name;
    item.append(box, thumb, name);
    box.addEventListener("change", () => updateGalleryCount(island));
    grid.append(item);
  }
  updateGalleryCount(island);
}

function updateGalleryCount(island) {
  const count = island.querySelector(".ed-gal-count");
  const grid = island.querySelector(".ed-gal-grid");
  if (count === null || grid === null) return;
  count.textContent = t("a.gallery.selected", {
    selected: grid.querySelectorAll("input:checked").length,
    total: grid.querySelectorAll("input").length,
  });
}

function linkListIsland(block) {
  const island = islandShell("link-list", block.id);
  island.append(islandHead(t("a.block.link-list")));
  const title = document.createElement("input");
  title.className = "ed-ll-title";
  title.placeholder = t("a.field.linklist.title");
  title.value = typeof block.title === "string" ? block.title : "";
  const links = document.createElement("textarea");
  links.className = "ed-ll-links";
  links.rows = 3;
  links.placeholder = t("a.field.linklist.links");
  links.value = typeof block.linksText === "string" ? block.linksText : "";
  island.append(title, links);
  return island;
}

function islandShell(kind, blockId) {
  const tag = kind === "photo" ? "figure" : kind === "link-list" ? "section" : "div";
  const island = document.createElement(tag);
  island.className = "ed-island";
  island.contentEditable = "false";
  island.dataset.block = kind;
  island.dataset.blockId = blockId ?? uniqueId(kind);
  return island;
}

function islandHead(labelText) {
  const head = document.createElement("div");
  head.className = "ed-island-head";
  const label = document.createElement("span");
  label.className = "ed-island-label";
  label.textContent = labelText;
  const controls = document.createElement("span");
  controls.className = "ed-island-controls";
  controls.append(
    islandControl("up", t("a.move.up")),
    islandControl("down", t("a.move.down")),
    islandControl("remove", t("a.remove")),
  );
  head.append(label, controls);
  return head;
}

function islandControl(action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ed-ctl";
  button.dataset.isl = action;
  button.textContent = label;
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}

function ensureTextBlock() {
  const last = canvas.lastElementChild;
  if (last === null || (last instanceof HTMLElement && last.dataset.block !== undefined)) {
    canvas.append(textNode("p", ""));
  }
  if (canvas.children.length === 0) {
    canvas.append(textNode("p", ""));
  }
}

function isEmptyTextBlock(node) {
  return node.dataset.block === undefined && node.innerText.replace(/\u00a0/g, "").trim().length === 0;
}

function convertSelectedTextBlock(tag) {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }
  const range = selection.getRangeAt(0);
  const startBlock = rangeBoundaryBlock(range, "start");
  const endBlock = rangeBoundaryBlock(range, "end");
  if (startBlock === null || endBlock === null) {
    return false;
  }

  const children = Array.from(canvas.children);
  const startIndex = children.indexOf(startBlock);
  const endIndex = children.indexOf(endBlock);
  if (startIndex < 0 || endIndex < startIndex) {
    return false;
  }
  const selectedBlocks = children.slice(startIndex, endIndex + 1);
  if (!selectedBlocks.every(isTextBlock)) {
    return false;
  }

  const startOffset = rangeBoundaryOffset(range, "start", startBlock);
  const endOffset = rangeBoundaryOffset(range, "end", endBlock);
  if (startOffset === null || endOffset === null || (startBlock === endBlock && startOffset >= endOffset)) {
    return false;
  }

  const converted = [];
  const updates = [];
  for (let index = 0; index < selectedBlocks.length; index += 1) {
    const block = selectedBlocks[index];
    const text = textBlockValue(block);
    const from = block === startBlock ? startOffset : 0;
    const to = block === endBlock ? endOffset : text.length;
    if (from < 0 || to < from || to > text.length) {
      return false;
    }

    const replacements = [];
    if (block === startBlock && from > 0) {
      replacements.push(textNode(textBlockTag(block), text.slice(0, from)));
    }
    if (to > from) {
      const selected = textNode(tag, text.slice(from, to));
      replacements.push(selected);
      converted.push(selected);
    }
    if (block === endBlock && to < text.length) {
      replacements.push(textNode(textBlockTag(block), text.slice(to)));
    }
    updates.push({ block, replacements });
  }

  if (converted.length === 0) {
    return false;
  }
  for (const { block, replacements } of updates) {
    block.replaceWith(...replacements);
  }
  selectConvertedBlocks(converted[0], converted[converted.length - 1]);
  notifyChange();
  return true;
}

function isTextBlock(node) {
  return node instanceof HTMLElement && node.dataset.block === undefined;
}

function rangeBoundaryBlock(range, boundary) {
  const container = boundary === "start" ? range.startContainer : range.endContainer;
  const offset = boundary === "start" ? range.startOffset : range.endOffset;
  const block = directTextBlock(container);
  if (block !== null) {
    return block;
  }
  if (container !== canvas) {
    return null;
  }
  const child = canvas.children[boundary === "start" ? offset : offset - 1];
  return isTextBlock(child) ? child : null;
}

function rangeBoundaryOffset(range, boundary, block) {
  const container = boundary === "start" ? range.startContainer : range.endContainer;
  const offset = boundary === "start" ? range.startOffset : range.endOffset;
  if (container === canvas) {
    return boundary === "start" ? 0 : textBlockValue(block).length;
  }
  const before = document.createRange();
  before.selectNodeContents(block);
  try {
    before.setEnd(container, offset);
  } catch {
    return null;
  }
  return before.toString().replace(/\u00a0/g, " ").length;
}

function directTextBlock(node) {
  let element = node instanceof HTMLElement ? node : node.parentElement;
  while (element !== null && element.parentElement !== canvas) {
    element = element.parentElement;
  }
  return isTextBlock(element) ? element : null;
}

function textBlockValue(node) {
  return node.innerText.replace(/\u00a0/g, " ");
}

function textBlockTag(node) {
  const tag = node.tagName.toLowerCase();
  return tag === "h3" || tag === "blockquote" ? tag : "p";
}

function selectConvertedBlocks(first, last) {
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  canvas.focus();
}

function currentBlock() {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return null;
  }
  let node = selection.getRangeAt(0).startContainer;
  while (node !== null && node.parentNode !== canvas) {
    node = node.parentNode;
  }
  return node instanceof HTMLElement ? node : null;
}

function currentTextBlock() {
  const block = currentBlock();
  return block !== null && block.dataset.block === undefined ? block : null;
}

function insertPlainText(text) {
  if (text.length === 0) {
    return;
  }
  if (document.execCommand("insertText", false, text)) {
    return;
  }
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNodeRef = document.createTextNode(text);
  range.insertNode(textNodeRef);
  range.setStartAfter(textNodeRef);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  notifyChange();
}

function moveCaretToPoint(x, y) {
  let range = null;
  if (typeof document.caretRangeFromPoint === "function") {
    range = document.caretRangeFromPoint(x, y);
  } else if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    if (position !== null) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
    }
  }
  if (range === null || !canvas.contains(range.startContainer)) {
    return;
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function placeCaretAtEnd(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  canvas.focus();
}

function hasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}
