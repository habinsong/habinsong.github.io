import { DEFAULT_RATIO, isRecord, mediumValue, positiveNumber, slug, text } from "./site-utils.js";

const PHOTOS_URL = "photos.json";
const POSTS_INDEX_URL = "content/posts/index.json";
const SERIES_URL = "series.json";

export async function loadPhotos() {
  try {
    return normalizePhotosPayload(await loadJson(PHOTOS_URL));
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function loadPosts() {
  try {
    return normalizePostsPayload(await loadJson(POSTS_INDEX_URL));
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function loadSeries() {
  try {
    return normalizeSeriesPayload(await loadJson(SERIES_URL));
  } catch (error) {
    console.error(error);
    return [];
  }
}

export function normalizeSeriesPayload(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.series)) {
    return [];
  }
  return payload.series.map(normalizeSeries).filter((entry) => entry.id.length > 0);
}

export function normalizeSeries(raw, position = 0) {
  const record = isRecord(raw) ? raw : {};
  const title = text(record.title, `Series ${position + 1}`);
  return Object.freeze({
    id: text(record.id, slug(title, position)),
    title,
    description: text(record.description, ""),
  });
}

export async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status}`);
  }
  return response.json();
}

export function normalizePhotosPayload(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.photos)) {
    return [];
  }
  return payload.photos.map(normalizePhoto).filter((photo) => photo.src.length > 0);
}

export function normalizePostsPayload(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.posts)) {
    return [];
  }
  return payload.posts
    .map(normalizePost)
    .filter((post) => post.status === "published")
    .sort((a, b) => (b.date || "0000").localeCompare(a.date || "0000"));
}

export function normalizePhoto(raw, index = 0) {
  const record = isRecord(raw) ? raw : {};
  const title = text(record.title, `Frame ${String(index + 1).padStart(2, "0")}`);
  const tone = text(record.tone, "color").toLowerCase() === "bw" ? "bw" : "color";
  return Object.freeze({
    id: text(record.id, slug(title, index)),
    title,
    medium: mediumValue(record.medium),
    tone,
    src: text(record.src, ""),
    alt: text(record.alt, title),
    place: text(record.place, ""),
    year: text(record.year, ""),
    details: text(record.details, ""),
    postId: text(record.postId, ""),
    width: positiveNumber(record.width, DEFAULT_RATIO.width),
    height: positiveNumber(record.height, DEFAULT_RATIO.height),
  });
}

export function normalizePost(raw, index = 0) {
  const record = isRecord(raw) ? raw : {};
  const title = text(record.title, `Post ${index + 1}`);
  const id = text(record.id, slug(title, index));
  return Object.freeze({
    id,
    title,
    status: text(record.status, "draft"),
    date: text(record.date, ""),
    excerpt: text(record.excerpt, ""),
    series: text(record.series, ""),
    path: text(record.path, `content/posts/${id}.json`),
    tags: Array.isArray(record.tags) ? record.tags.map((tag) => text(tag, "")).filter(Boolean) : [],
  });
}

export function normalizePostDetail(payload, summary) {
  const record = isRecord(payload) ? payload : {};
  return Object.freeze({
    id: text(record.id, summary.id),
    title: text(record.title, summary.title),
    date: text(record.date, summary.date),
    excerpt: text(record.excerpt, summary.excerpt),
    blocks: Array.isArray(record.blocks) ? record.blocks : [],
  });
}
