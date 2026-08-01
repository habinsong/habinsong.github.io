import { currentLocale, initI18n, registerMessages, t } from "../i18n.js";
import { SITE_MESSAGES } from "../messages.js";
import { copyRichTextRuns } from "../rich-text.js?v=20260802-rich-v1";
import { ADMIN_MESSAGES } from "./admin-messages.js?v=20260802-workspace-v10";
import { clearPersistedAssets, loadPersistedAssets, persistAsset, removePersistedAsset } from "./asset-store.js";
import { buildPost, newAsset, normalizeSavedBlock, restoredAsset } from "./admin-model.js?v=20260802-model-v3";
import { downloadJsonFile, downloadZipFile } from "./admin-export.js?v=20260802-model-v3";
import {
  initEditor,
  insertAllPhotoIslands,
  insertGalleryIsland,
  insertLinkListIsland,
  insertPhotoIsland,
  loadBlocks,
  refreshAssets,
  removeAssetIslands,
  serializeBlocks,
  insertTextBlock,
  formatText,
} from "./editor.js?v=20260802-workspace-v10";
import { readImageInfo } from "./exif.js";
import { toWebp } from "./webp.js";
import { assetStatusSummary, renderAssets, updateAssetStatuses } from "./admin-render.js?v=20260802-workspace-v10";
import { renderPreview } from "./admin-preview.js?v=20260802-workspace-v10";
import { gcd, isRecord, requireElement, setFormValue, today, uniqueId } from "./admin-utils.js";

registerMessages(SITE_MESSAGES);
registerMessages(ADMIN_MESSAGES);
initI18n();

const DRAFT_KEY = "habin-photo-admin-draft-v1";
const state = { assets: [], blocks: [] };
let insertOnNextFiles = false;
let photoStatusMessage = { key: "a.assets.empty", variables: {} };

const form = requireElement("#post-form");
const photoFiles = requireElement("#photo-files");
const photoPickerButton = requireElement("#photo-picker-button");
const photoZone = requireElement("#photo-zone");
const photoProgress = requireElement("#photo-progress");
const photoStatus = requireElement("#photo-status");
const seriesDatalist = requireElement("#series-list");
const assetList = requireElement("#asset-list");
const assetCount = requireElement("#asset-count");
const assetDetailsToggle = requireElement("#asset-details-toggle");
const canvas = requireElement("#editor-canvas");
const preview = requireElement("#preview");
const previewInline = requireElement("#preview-inline");
const previewDialog = requireElement("#preview-dialog");
const previewToggle = requireElement("#preview-toggle");
const previewClose = requireElement("#preview-close");
const editorNotice = requireElement("#editor-notice");
const status = requireElement("#save-status");
const validation = requireElement("#validation-output");
const downloadJson = requireElement("#download-json");
const downloadZip = requireElement("#download-zip");
const importJson = requireElement("#import-json");
const importFile = requireElement("#import-file");
const resetDraft = requireElement("#reset-draft");
const seriesTitleById = new Map();

initEditor({
  canvas,
  getAssets: () => state.assets,
  onChange: editorChanged,
  onFilesDropped: (files) => addAssets(files, { insert: true }),
});

document.title = t("a.doc.title");
await restoreDraft();
renderAll();
loadSeriesOptions();

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  importFile.value = "";
  if (file === undefined) {
    return;
  }
  try {
    applyImportedPost(JSON.parse(await file.text()));
    validation.textContent = t("a.msg.imported", { file: file.name });
  } catch (error) {
    console.error(error);
    validation.textContent = t("a.msg.import.failed");
  }
});

window.addEventListener("langchange", () => {
  document.title = t("a.doc.title");
  validation.textContent = "";
  editorNotice.textContent = "";
  renderPhotoStatus();
  loadBlocks(state.blocks);
  renderAll();
});

previewToggle.addEventListener("click", () => {
  renderCurrentPreview();
  if (!previewDialog.open) {
    previewDialog.showModal();
  }
});

previewClose.addEventListener("click", () => previewDialog.close());

form.addEventListener("submit", (event) => {
  // Enter in a text field can trigger implicit form submission, which would
  // reload the page; CSP form-action 'none' is the second layer.
  event.preventDefault();
});

form.addEventListener("input", (event) => {
  if (event.target instanceof Node && canvas.contains(event.target)) {
    editorChanged();
    return;
  }
  saveDraft();
  renderCurrentPreview();
});

form.addEventListener("mousedown", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("[data-ed-text], [data-ed-format], [data-ed-size]") !== null) {
    event.preventDefault();
  }
});

photoFiles.addEventListener("change", () => {
  addAssets(Array.from(photoFiles.files ?? []), { insert: insertOnNextFiles });
  insertOnNextFiles = false;
  photoFiles.value = "";
});

photoPickerButton.addEventListener("click", () => photoFiles.click());

photoZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  photoZone.classList.add("is-dragover");
});

photoZone.addEventListener("dragleave", () => {
  photoZone.classList.remove("is-dragover");
});

photoZone.addEventListener("drop", (event) => {
  event.preventDefault();
  photoZone.classList.remove("is-dragover");
  addAssets(Array.from(event.dataTransfer?.files ?? []));
});

assetDetailsToggle.addEventListener("click", () => {
  const details = Array.from(assetList.querySelectorAll(".asset-details"));
  const shouldOpen = details.some((item) => !item.open);
  details.forEach((item) => { item.open = shouldOpen; });
  updateAssetListControls();
});

assetList.addEventListener("click", () => {
  window.setTimeout(updateAssetListControls, 0);
});

form.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const inlineFormat = target.dataset.edFormat;
  if (inlineFormat !== undefined) {
    formatText(inlineFormat);
    return;
  }
  const textSize = target.dataset.edSize;
  if (textSize !== undefined) {
    formatText("size", textSize);
    return;
  }
  const textType = target.dataset.edText;
  if (textType !== undefined) {
    insertTextBlock(textType);
    return;
  }
  const insertKind = target.dataset.edInsert;
  if (insertKind !== undefined) {
    handleInsert(insertKind);
    return;
  }
  const assetId = target.dataset.insertAsset;
  if (assetId !== undefined) {
    insertPhotoIsland(assetId);
    return;
  }
  const deleteId = target.dataset.deleteAsset;
  if (deleteId !== undefined) {
    state.assets = state.assets.filter((asset) => asset.id !== deleteId);
    removePersistedAsset(deleteId).catch(() => {});
    removeAssetIslands(deleteId);
    renderAssetsPanel();
    return;
  }
  if (target === importJson) {
    importFile.click();
    return;
  }
  await handleAction(target);
});

function handleInsert(kind) {
  if (kind === "photo") {
    insertOnNextFiles = true;
    editorNotice.textContent = "";
    photoFiles.click();
    return;
  }
  if (kind === "link-list") {
    insertLinkListIsland();
    return;
  }
  if (state.assets.length === 0) {
    editorNotice.textContent = t("a.msg.noassets");
    return;
  }
  if (kind === "all-photos") {
    insertAllPhotoIslands();
  } else if (kind === "gallery") {
    insertGalleryIsland();
  }
}

async function restoreDraft() {
  try {
    const records = await loadPersistedAssets();
    state.assets = records
      .sort((left, right) => (left.addedAt ?? Number.MAX_SAFE_INTEGER) - (right.addedAt ?? Number.MAX_SAFE_INTEGER))
      .map((record) => ({ ...restoredAsset(record), url: URL.createObjectURL(record.file) }));
  } catch (error) {
    console.error(error);
    state.assets = [];
  }
  const saved = window.localStorage.getItem(DRAFT_KEY);
  if (saved === null) {
    setDefaultDate();
    loadBlocks([]);
    return;
  }
  try {
    const draft = JSON.parse(saved);
    setFormValue(form, "title", typeof draft.title === "string" ? draft.title : "");
    setFormValue(form, "date", typeof draft.date === "string" ? draft.date : today());
    setFormValue(form, "status", typeof draft.status === "string" ? draft.status : "published");
    setFormValue(form, "series", typeof draft.seriesTitle === "string" ? draft.seriesTitle : "");
    setFormValue(form, "tags", Array.isArray(draft.tags) ? draft.tags.join(", ") : "");
    setFormValue(form, "excerpt", typeof draft.excerpt === "string" ? draft.excerpt : "");
    applySoundtrack(draft.soundtrack);
    const savedBlocks = Array.isArray(draft.blocks) ? draft.blocks : [];
    reorderAssets([
      ...(Array.isArray(draft.assetOrder) ? draft.assetOrder : []),
      ...assetIdsFromBlocks(savedBlocks),
    ]);
    state.blocks = savedBlocks.map(normalizeSavedBlock);
    loadBlocks(state.blocks);
  } catch (error) {
    console.error(error);
    window.localStorage.removeItem(DRAFT_KEY);
    setDefaultDate();
    loadBlocks([]);
  }
}

function applySoundtrack(soundtrack) {
  const record = isRecord(soundtrack) ? soundtrack : {};
  setFormValue(form, "soundtrack", typeof record.url === "string" ? record.url : "");
  setFormValue(form, "soundtrackLabel", typeof record.label === "string" ? record.label : "");
}

function applyImportedPost(data) {
  if (!isRecord(data) || !Array.isArray(data.blocks)) {
    throw new Error("Not a post JSON file");
  }
  setFormValue(form, "title", typeof data.title === "string" ? data.title : "");
  setFormValue(form, "date", typeof data.date === "string" ? data.date : today());
  setFormValue(form, "status", data.status === "draft" ? "draft" : "published");
  setFormValue(form, "excerpt", typeof data.excerpt === "string" ? data.excerpt : "");
  setFormValue(form, "tags", Array.isArray(data.tags) ? data.tags.join(", ") : "");
  const seriesId = typeof data.series === "string" ? data.series : "";
  setFormValue(form, "series", seriesTitleById.get(seriesId) ?? seriesId);
  applySoundtrack(data.soundtrack);
  state.blocks = data.blocks.map(importBlock).filter((block) => block !== null);
  loadBlocks(state.blocks);
  editorChanged();
}

function importBlock(block) {
  if (!isRecord(block)) {
    return null;
  }
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote": {
      const imported = { id: uniqueId(block.type), type: block.type, text: typeof block.text === "string" ? block.text : "" };
      const runs = copyRichTextRuns(block.runs);
      if (runs.length > 0) imported.runs = runs;
      return imported;
    }
    case "photo":
      return isRecord(block.photo)
        ? { id: uniqueId("photo"), type: "photo", photo: block.photo, comment: typeof block.comment === "string" ? block.comment : "" }
        : null;
    case "gallery":
      return Array.isArray(block.photos) ? { id: uniqueId("gallery"), type: "gallery", photos: block.photos.filter(isRecord) } : null;
    case "link-list": {
      const links = Array.isArray(block.links) ? block.links.filter(isRecord) : [];
      return {
        id: uniqueId("link-list"),
        type: "link-list",
        title: typeof block.title === "string" ? block.title : "",
        linksText: links.map((link) => `${link.label ?? ""} | ${link.url ?? ""}`).join("\n"),
      };
    }
    default:
      return null;
  }
}

function setDefaultDate() {
  setFormValue(form, "date", today());
  setFormValue(form, "status", "published");
}

async function addAssets(files, options = {}) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (images.length === 0) {
    return;
  }

  setPhotoStatus("a.msg.converting", { n: images.length });
  photoProgress.max = images.length;
  photoProgress.value = 0;
  photoProgress.hidden = false;
  const added = [];
  let before = 0;
  let after = 0;
  for (const [index, file] of images.entries()) {
    setPhotoStatus("a.msg.converting.progress", {
      current: index + 1,
      total: images.length,
      file: file.name,
    });
    /* the picture is stored as WebP, but the camera data and the real pixel
       size are read from the file as it came off the card */
    const stored = await toWebp(file);
    const asset = newAsset(stored);
    asset.addedAt = Date.now() + index;
    await fillFromImage(asset, file);
    state.assets.push(asset);
    persistAsset(asset).catch(() => {});
    added.push(asset);
    before += file.size;
    after += stored.size;
    photoProgress.value = index + 1;
  }
  photoProgress.hidden = true;
  setPhotoStatus("a.msg.converted", {
    n: added.length,
    before: megabytes(before),
    after: megabytes(after),
  });
  refreshAssets();
  if (options.insert === true) {
    for (const asset of added) {
      insertPhotoIsland(asset.id);
    }
  }
  editorChanged();
  renderAssetsPanel();
}

function megabytes(bytes) {
  return (bytes / 1048576).toFixed(1);
}

async function fillFromImage(asset, file) {
  const info = await readImageInfo(file);
  if (info.width > 0 && info.height > 0) {
    const divisor = gcd(info.width, info.height);
    asset.width = info.width / divisor;
    asset.height = info.height / divisor;
  }
  /* The camera already wrote the note; it is copied into its own boxes so the
     site can set it as a note rather than as one run-on line. Focal length has
     no box of its own and stays in the free line beside the lens. */
  fillNotes(asset, info.exif);
  const focal = focalLength(info.exif);
  if (focal.length > 0 && asset.details.length === 0) {
    asset.details = focal;
  }
  const shot = shotDate(info.exif);
  if (shot.length > 0) {
    asset.date = shot;
    asset.year = shot.slice(0, 4);
  }
}

function fillNotes(asset, exif) {
  const written = {
    camera: cameraName(exif),
    lens: exif.lens ?? "",
    aperture: exif.fnumber === undefined ? "" : `f/${(exif.fnumber.num / exif.fnumber.den).toFixed(1).replace(/\.0$/, "")}`,
    shutter: shutterSpeed(exif),
    iso: typeof exif.iso === "number" && exif.iso > 0 ? String(exif.iso) : "",
  };
  for (const [field, value] of Object.entries(written)) {
    if (value.length > 0 && asset.exif[field].length === 0) {
      asset.exif[field] = value;
    }
  }
}

function cameraName(exif) {
  const make = exif.make ?? "";
  const model = exif.model ?? "";
  return model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(" ");
}

function shutterSpeed(exif) {
  if (exif.exposure === undefined) {
    return "";
  }
  const value = exif.exposure.num / exif.exposure.den;
  return value >= 1 ? `${value}s` : `1/${Math.round(exif.exposure.den / exif.exposure.num)}`;
}

function focalLength(exif) {
  return exif.focal === undefined ? "" : `${Math.round(exif.focal.num / exif.focal.den)}mm`;
}

function shotDate(exif) {
  const stamp = exif.dateTimeOriginal ?? "";
  const match = /^(\d{4}):(\d{2}):(\d{2})/.exec(stamp);
  return match === null ? "" : `${match[1]}-${match[2]}-${match[3]}`;
}

async function handleAction(target) {
  const post = buildPost(form, state);
  if (target === downloadJson) {
    downloadJsonFile(post, validation);
  } else if (target === downloadZip) {
    await downloadZipFile(post, state, validation);
  } else if (target === resetDraft) {
    resetAll();
  }
}

async function loadSeriesOptions() {
  try {
    const response = await fetch("../series.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const entries = Array.isArray(payload?.series) ? payload.series : [];
    seriesDatalist.replaceChildren(...entries.flatMap((entry) => {
      if (typeof entry?.title !== "string" || entry.title.length === 0) {
        return [];
      }
      if (typeof entry.id === "string" && entry.id.length > 0) {
        seriesTitleById.set(entry.id, entry.title);
      }
      const option = document.createElement("option");
      option.value = entry.title;
      return [option];
    }));
  } catch {
    // The datalist is a convenience; free-form series input still works.
  }
}

function editorChanged() {
  editorNotice.textContent = "";
  state.blocks = serializeBlocks();
  saveDraft();
  renderCurrentPreview();
  updateAssetStatuses(assetList, state);
  updateAssetListControls();
}

function renderAll() {
  renderAssetsPanel();
  renderCurrentPreview();
}

function renderAssetsPanel() {
  renderAssets(assetList, state, (asset) => {
    persistAsset(asset).catch(() => {});
    refreshAssets();
    editorChanged();
  });
  updateAssetListControls();
}

function updateAssetListControls() {
  const count = state.assets.length;
  const summary = assetStatusSummary(state);
  assetCount.textContent = count === 0 ? "" : t("a.assets.count", { n: count, used: summary.used, ready: summary.ready });
  assetDetailsToggle.hidden = count === 0;
  const details = Array.from(assetList.querySelectorAll(".asset-details"));
  const shouldExpand = details.some((item) => !item.open);
  assetDetailsToggle.textContent = t(shouldExpand ? "a.assets.expand" : "a.assets.collapse");
  if (count === 0) {
    setPhotoStatus("a.assets.empty");
  } else if (photoStatusMessage.key === "a.assets.empty") {
    setPhotoStatus("a.msg.photos.ready", { n: count });
  }
}

function setPhotoStatus(key, variables = {}) {
  photoStatusMessage = { key, variables };
  renderPhotoStatus();
}

function renderPhotoStatus() {
  photoStatus.removeAttribute("data-i18n");
  photoStatus.textContent = t(photoStatusMessage.key, photoStatusMessage.variables);
}

function renderCurrentPreview() {
  const post = buildPost(form, state);
  renderPreview(preview, post, state.assets);
  renderPreview(previewInline, post, state.assets);
}

function reorderAssets(ids) {
  const position = new Map();
  for (const id of ids) {
    if (typeof id === "string" && !position.has(id)) position.set(id, position.size);
  }
  state.assets.sort((left, right) => {
    const leftPosition = position.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = position.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function assetIdsFromBlocks(blocks) {
  const ids = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    if (block.type === "photo") {
      const id = typeof block.assetId === "string" ? block.assetId : isRecord(block.photo) ? block.photo.assetId : "";
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
    if (block.type === "gallery") {
      if (Array.isArray(block.assetIds)) ids.push(...block.assetIds);
      if (Array.isArray(block.photos)) {
        ids.push(...block.photos.filter(isRecord).map((photo) => photo.assetId).filter((id) => typeof id === "string"));
      }
    }
  }
  return ids;
}

function saveDraft() {
  const post = buildPost(form, state);
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
    ...post,
    blocks: state.blocks,
    assetOrder: state.assets.map((asset) => asset.id),
  }));
  status.removeAttribute("data-i18n");
  status.textContent = `${t("a.status.saved")} · ${new Date().toLocaleTimeString(currentLocale())}`;
}

function resetAll() {
  window.localStorage.removeItem(DRAFT_KEY);
  clearPersistedAssets().catch(() => {});
  state.assets = [];
  state.blocks = [];
  form.reset();
  setDefaultDate();
  loadBlocks([]);
  renderAll();
  editorNotice.textContent = "";
  validation.textContent = t("a.msg.reset");
  photoProgress.hidden = true;
}
