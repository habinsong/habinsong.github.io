import { DEFAULT_RATIO, LIGHTS, isRecord, lightOf, mediumValue, normalizeExif, normalizeSubjects, orientationOf, photoDate, photoTime, positiveNumber, seasonOf, slug, text } from "./site-utils.js";

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
  /* A full date is worth more than a year: it puts the frame in a season. When
     only a year was written down, the year is all the frame answers to. */
  const date = photoDate(record.date);
  const season = seasonOf(date);
  const time = photoTime(record.time);
  const width = positiveNumber(record.width, DEFAULT_RATIO.width);
  const height = positiveNumber(record.height, DEFAULT_RATIO.height);
  const light = text(record.light, "");
  return Object.freeze({
    id: text(record.id, slug(title, index)),
    title,
    medium: mediumValue(record.medium),
    tone,
    src: text(record.src, ""),
    alt: text(record.alt, title),
    place: text(record.place, ""),
    year: text(record.year, "") || date.slice(0, 4),
    date,
    season,
    time,
    light: LIGHTS.includes(light) ? light : lightOf(time, season),
    format: text(record.format, ""),
    subjects: normalizeSubjects(record.subjects),
    orientation: orientationOf(width, height),
    details: text(record.details, ""),
    exif: normalizeExif(record.exif),
    postId: text(record.postId, ""),
    width,
    height,
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
    soundtrack: normalizeSoundtrack(record.soundtrack),
    blocks: Array.isArray(record.blocks) ? record.blocks : [],
  });
}

export function normalizeSoundtrack(raw) {
  const record = isRecord(raw) ? raw : {};
  const url = text(record.url, "");
  return url.length === 0 ? null : Object.freeze({ url, label: text(record.label, "") });
}
