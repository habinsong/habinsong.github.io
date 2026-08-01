import { t } from "../i18n.js";
import { copyRichTextRuns } from "../rich-text.js?v=20260802-rich-v1";
import { EXIF_FIELDS } from "../site-utils.js";
import { videoId } from "../sound.js";
import { extensionOf, isRecord, safeUrl, slug, text, uniqueId } from "./admin-utils.js";

function rawText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeSavedBlock(raw) {
  const record = isRecord(raw) ? raw : {};
  return { id: text(record.id, uniqueId("block")), type: text(record.type, "paragraph"), ...record };
}

export function newAsset(file) {
  const title = file.name.replace(/\.[^.]+$/, "");
  return {
    id: uniqueId(slug(title)),
    file,
    url: URL.createObjectURL(file),
    title,
    alt: "",
    medium: "digital",
    tone: "color",
    place: "",
    year: new Date().getFullYear().toString(),
    date: "",
    time: "",
    format: "",
    subjects: "",
    details: "",
    exif: emptyExif(),
    width: 3,
    height: 2,
  };
}

export function emptyExif() {
  return Object.fromEntries(EXIF_FIELDS.map((field) => [field, ""]));
}

/* A draft saved before a field existed comes back without it. Every asset read
   from storage is brought up to the shape the panel expects. */
export function restoredAsset(record) {
  return {
    date: "",
    time: "",
    format: "",
    subjects: "",
    details: "",
    ...record,
    exif: { ...emptyExif(), ...(isRecord(record.exif) ? record.exif : {}) },
  };
}

/* Only what was actually written down goes into the file. A frame with no
   notes carries no empty note. */
function writtenExif(exif) {
  const kept = Object.entries(isRecord(exif) ? exif : {})
    .filter(([field, value]) => EXIF_FIELDS.includes(field) && rawText(value).length > 0)
    .map(([field, value]) => [field, rawText(value)]);
  return kept.length > 0 ? Object.fromEntries(kept) : null;
}

export function buildPost(form, state) {
  const data = new FormData(form);
  const title = rawText(data.get("title"));
  const id = slug(title) || "untitled-post";
  const seriesTitle = rawText(data.get("series"));
  const post = {
    id,
    title,
    date: text(data.get("date"), new Date().toISOString().slice(0, 10)),
    status: text(data.get("status"), "published"),
    excerpt: text(data.get("excerpt"), ""),
    series: seriesTitle.length > 0 ? slug(seriesTitle) : "",
    seriesTitle,
    tags: splitTags(text(data.get("tags"), "")),
    cover: coverPhoto(form, state),
    blocks: state.blocks.flatMap((block) => exportBlocks(form, state, block)),
  };
  const soundtrack = rawText(data.get("soundtrack"));
  if (soundtrack.length > 0) {
    post.soundtrack = { url: soundtrack, label: rawText(data.get("soundtrackLabel")) };
  }
  return post;
}

export function postSummary(post) {
  const summary = {
    id: post.id,
    title: post.title,
    date: post.date,
    status: post.status,
    excerpt: post.excerpt,
    tags: post.tags,
    path: `content/posts/${post.id}.json`,
  };
  if (post.series.length > 0) {
    summary.series = post.series;
  }
  return summary;
}

export function photoFromAsset(form, state, assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (asset === undefined) {
    return null;
  }
  const postId = slug(text(new FormData(form).get("title"), "untitled-post"));
  const filename = `${asset.id}.${extensionOf(asset.file.name)}`;
  const exif = writtenExif(asset.exif);
  const photo = {
    id: asset.id,
    title: text(asset.title, asset.file.name),
    medium: asset.medium,
    tone: asset.tone,
    src: `photos/${postId}/${filename}`,
    alt: text(asset.alt, asset.title),
    place: asset.place,
    year: asset.year,
    details: asset.details,
    width: asset.width,
    height: asset.height,
    assetId: asset.id,
  };
  for (const [field, value] of [["date", asset.date], ["time", asset.time], ["format", asset.format]]) {
    if (rawText(value).length > 0) {
      photo[field] = rawText(value);
    }
  }
  const subjects = splitTags(rawText(asset.subjects));
  if (subjects.length > 0) {
    photo.subjects = subjects;
  }
  if (exif !== null) {
    photo.exif = exif;
  }
  return photo;
}

export function allPhotos(post) {
  const photos = [];
  for (const block of post.blocks) {
    if (block.type === "photo") {
      photos.push(block.photo);
    }
    if (block.type === "gallery") {
      photos.push(...block.photos);
    }
  }
  return photos;
}

export function stripAssetIds(post) {
  const { seriesTitle, ...clean } = post;
  return {
    ...clean,
    cover: stripPhoto(post.cover),
    blocks: post.blocks.map(stripBlock),
  };
}

export function validatePost(post) {
  const errors = [];
  if (post.title.trim().length === 0) errors.push(t("a.err.title"));
  if (post.excerpt.trim().length === 0) errors.push(t("a.err.excerpt"));
  if (post.blocks.length === 0) errors.push(t("a.err.blocks"));
  if (post.soundtrack !== undefined && videoId(post.soundtrack.url) === "") errors.push(t("a.err.soundtrack"));
  for (const block of post.blocks) {
    validateBlock(block, errors);
  }
  return errors;
}

function exportBlocks(form, state, block) {
  switch (block.type) {
    case "paragraph": {
      const rich = exportedTextBlock(block);
      return rich.runs === undefined ? splitParagraphs(rich.text) : [rich];
    }
    case "heading":
    case "quote":
      return [exportedTextBlock(block)];
    case "photo": {
      const photo = isRecord(block.photo) ? block.photo : photoFromAsset(form, state, block.assetId);
      if (photo === null) {
        return [];
      }
      const comment = rawText(block.comment);
      return [comment.length > 0 ? { type: "photo", photo, comment } : { type: "photo", photo }];
    }
    case "gallery": {
      const photos = Array.isArray(block.photos)
        ? block.photos.filter(isRecord)
        : (block.assetIds ?? []).map((id) => photoFromAsset(form, state, id)).filter((photo) => photo !== null);
      return photos.length === 0 ? [] : [{ type: "gallery", photos }];
    }
    case "link-list": {
      const links = parseLinks(block.linksText ?? "");
      return links.length === 0 ? [] : [{ type: "link-list", title: text(block.title, "Links"), links }];
    }
    default:
      return [];
  }
}

function exportedTextBlock(block) {
  const value = text(block.text, "");
  const exported = { type: block.type, text: value };
  const runs = copyRichTextRuns(block.runs);
  if (runs.length > 0 && runs.map((run) => run.text).join("") === value) {
    exported.runs = runs;
  }
  return exported;
}

function splitParagraphs(value) {
  return value
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => ({ type: "paragraph", text: part }));
}

function coverPhoto(form, state) {
  for (const block of state.blocks) {
    if (block.type !== "photo") {
      continue;
    }
    if (isRecord(block.photo)) {
      return block.photo;
    }
    if (typeof block.assetId === "string") {
      const photo = photoFromAsset(form, state, block.assetId);
      if (photo !== null) {
        return photo;
      }
    }
  }
  return null;
}

function parseLinks(value) {
  return value.split("\n").map((line) => {
    const [label, url] = line.split("|").map((part) => part.trim());
    return { label: label ?? "", url: url ?? "" };
  }).filter((link) => link.label.length > 0 && safeUrl(link.url).length > 0);
}

function splitTags(value) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function stripBlock(block) {
  if (block.type === "photo") {
    const clean = { type: "photo", photo: stripPhoto(block.photo) };
    if (typeof block.comment === "string" && block.comment.length > 0) {
      clean.comment = block.comment;
    }
    return clean;
  }
  if (block.type === "gallery") return { type: "gallery", photos: block.photos.map(stripPhoto) };
  return block;
}

function stripPhoto(photo) {
  if (photo === null) return null;
  const { assetId, ...clean } = photo;
  return clean;
}

function validateBlock(block, errors) {
  if (block.type === "photo" && block.photo.alt.trim().length === 0) {
    errors.push(t("a.err.alt", { title: block.photo.title }));
  }
  if (block.type === "gallery") {
    for (const photo of block.photos) {
      if (photo.alt.trim().length === 0) errors.push(t("a.err.alt", { title: photo.title }));
    }
  }
}
