import { currentLocale, initI18n, registerMessages, t } from "../i18n.js";
import { SITE_MESSAGES } from "../messages.js";
import { ADMIN_MESSAGES } from "./admin-messages.js?v=20260802-admin-qa";
import { clearPersistedAssets, loadPersistedAssets, persistAsset, removePersistedAsset } from "./asset-store.js";
import { buildPost, newAsset, normalizeSavedBlock, restoredAsset } from "./admin-model.js";
import { downloadJsonFile, downloadZipFile } from "./admin-export.js";
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
  setBlockType,
} from "./editor.js?v=20260802-editor-fix";
import { readImageInfo } from "./exif.js";
import { toWebp } from "./webp.js";
import { renderAssets } from "./admin-render.js?v=20260802-admin-qa";
import { renderPreview } from "./admin-preview.js";
import { gcd, isRecord, requireElement, setFormValue, today, uniqueId } from "./admin-utils.js";

registerMessages(SITE_MESSAGES);
registerMessages(ADMIN_MESSAGES);
initI18n();

const DRAFT_KEY = "habin-photo-admin-draft-v1";
const PREVIEW_KEY = "habin-photo-admin-preview-v1";
const state = { assets: [], blocks: [] };
let insertOnNextFiles = false;

const form = requireElement("#post-form");
const photoFiles = requireElement("#photo-files");
const photoZone = requireElement("#photo-zone");
const seriesDatalist = requireElement("#series-list");
const assetList = requireElement("#asset-list");
const assetCount = requireElement("#asset-count");
const assetDetailsToggle = requireElement("#asset-details-toggle");
const canvas = requireElement("#editor-canvas");
const preview = requireElement("#preview");
const previewPanel = preview.closest(".preview-panel");
const previewToggle = requireElement("#preview-toggle");
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
setPreviewVisibility(window.localStorage.getItem(PREVIEW_KEY) !== "off");
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
  updatePreviewToggle();
  validation.textContent = "";
  loadBlocks(state.blocks);
  renderAll();
});

previewToggle.addEventListener("click", () => {
  const visible = previewToggle.getAttribute("aria-pressed") !== "true";
  setPreviewVisibility(visible);
  window.localStorage.setItem(PREVIEW_KEY, visible ? "on" : "off");
});

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

photoFiles.addEventListener("change", () => {
  addAssets(Array.from(photoFiles.files ?? []), { insert: insertOnNextFiles });
  insertOnNextFiles = false;
  photoFiles.value = "";
});

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
  const blockType = target.dataset.edBlock;
  if (blockType !== undefined) {
    setBlockType(blockType);
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
    photoFiles.click();
    return;
  }
  if (kind === "link-list") {
    insertLinkListIsland();
    return;
  }
  if (state.assets.length === 0) {
    validation.textContent = t("a.msg.noassets");
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
    state.assets = records.map((record) => ({ ...restoredAsset(record), url: URL.createObjectURL(record.file) }));
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
    state.blocks = Array.isArray(draft.blocks) ? draft.blocks.map(normalizeSavedBlock) : [];
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
    case "quote":
      return { id: uniqueId(block.type), type: block.type, text: typeof block.text === "string" ? block.text : "" };
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

  validation.textContent = t("a.msg.converting", { n: images.length });
  const added = [];
  let before = 0;
  let after = 0;
  for (const file of images) {
    /* the picture is stored as WebP, but the camera data and the real pixel
       size are read from the file as it came off the card */
    const stored = await toWebp(file);
    const asset = newAsset(stored);
    await fillFromImage(asset, file);
    state.assets.push(asset);
    persistAsset(asset).catch(() => {});
    added.push(asset);
    before += file.size;
    after += stored.size;
  }
  validation.textContent = t("a.msg.converted", {
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
  state.blocks = serializeBlocks();
  saveDraft();
  renderCurrentPreview();
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
  assetCount.textContent = count === 0 ? "" : t("a.assets.count", { n: count });
  assetDetailsToggle.hidden = count === 0;
  const details = Array.from(assetList.querySelectorAll(".asset-details"));
  const shouldExpand = details.some((item) => !item.open);
  assetDetailsToggle.textContent = t(shouldExpand ? "a.assets.expand" : "a.assets.collapse");
}

function renderCurrentPreview() {
  renderPreview(preview, buildPost(form, state), state.assets);
}

function setPreviewVisibility(visible) {
  previewPanel.hidden = !visible;
  previewToggle.setAttribute("aria-pressed", String(visible));
  previewToggle.closest(".admin-shell")?.classList.toggle("is-preview-hidden", !visible);
  updatePreviewToggle();
}

function updatePreviewToggle() {
  const visible = previewToggle.getAttribute("aria-pressed") === "true";
  previewToggle.textContent = t(visible ? "a.preview.toggle.on" : "a.preview.toggle.off");
}

function saveDraft() {
  const post = buildPost(form, state);
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...post, blocks: state.blocks }));
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
  validation.textContent = t("a.msg.reset");
}
