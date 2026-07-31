import { t } from "../i18n.js";
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
    details: "",
    width: 3,
    height: 2,
  };
}

export function buildPost(form, state) {
  const data = new FormData(form);
  const title = rawText(data.get("title"));
  const id = slug(title) || "untitled-post";
  const seriesTitle = rawText(data.get("series"));
  return {
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
  return {
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
  for (const block of post.blocks) {
    validateBlock(block, errors);
  }
  return errors;
}

function exportBlocks(form, state, block) {
  switch (block.type) {
    case "paragraph":
      return splitParagraphs(block.text ?? "");
    case "heading":
    case "quote":
      return [{ type: block.type, text: text(block.text, "") }];
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
    case "link-list":
      return [{ type: "link-list", title: text(block.title, "Links"), links: parseLinks(block.linksText ?? "") }];
    default:
      return [];
  }
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
