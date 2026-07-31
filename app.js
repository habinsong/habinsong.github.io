import { initI18n, registerMessages, t, tCount } from "./i18n.js";
import { openLightbox } from "./lightbox.js";
import { SITE_MESSAGES } from "./messages.js";
import { loadJson, loadPhotos, loadPosts, loadSeries, normalizePostDetail } from "./site-data.js";
import { archiveYear, collectPostPhotos, lightboxItem, photoCard, postArticle, postCard, postNav, seriesCard } from "./site-render.js";
import { emptyState, requireElement } from "./site-utils.js";

registerMessages(SITE_MESSAGES);
initI18n();

const state = { filter: "all", photos: [], posts: [], series: [], detailPhotos: [] };
const grid = requireElement("#photo-grid");
const photoCount = requireElement("#gallery-count");
const postsList = requireElement("#posts-list");
const seriesList = requireElement("#series-list");
const archiveList = requireElement("#archive-list");
const postDetail = requireElement("#post-detail");
const seriesDetail = requireElement("#series-detail");
const photoTemplate = requireElement("#photo-card-template");
const postTemplate = requireElement("#post-card-template");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));

requireElement("#year").textContent = String(new Date().getFullYear());

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter ?? "all";
    updatePressedFilter();
    renderPhotos();
  });
}

grid.addEventListener("photo:open", (event) => {
  const visible = visiblePhotos();
  const start = visible.findIndex((photo) => photo.id === event.detail.id);
  openLightbox(visible.map(lightboxItem), Math.max(start, 0));
});

postDetail.addEventListener("photo:open", (event) => {
  const start = state.detailPhotos.findIndex((photo) => photo.id === event.detail.id);
  openLightbox(state.detailPhotos.map(lightboxItem), Math.max(start, 0));
});

window.addEventListener("hashchange", () => {
  renderRoute();
});

window.addEventListener("langchange", () => {
  renderAll();
  renderRoute({ keepScroll: true });
});

const [photos, posts, series] = await Promise.all([loadPhotos(), loadPosts(), loadSeries()]);
state.photos = photos;
state.posts = posts;
state.series = series;
renderAll();
await renderRoute({ keepScroll: true });

function renderAll() {
  renderPhotos();
  renderPosts();
  renderSeries();
  renderArchive();
}

function updatePressedFilter() {
  for (const button of filterButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
  }
}

function visiblePhotos() {
  return state.photos.filter((photo) => matchesFilter(photo));
}

function renderPhotos() {
  const visible = visiblePhotos();
  photoCount.textContent = countText(visible.length, state.photos.length);
  if (visible.length === 0) {
    grid.replaceChildren(emptyState(t("empty.photos.title")));
    return;
  }
  grid.replaceChildren(...visible.map((photo) => photoCard(photo, photoTemplate)));
}

function renderPosts() {
  if (state.posts.length === 0) {
    postsList.replaceChildren(emptyState(t("empty.posts.title")));
    return;
  }
  postsList.replaceChildren(...state.posts.map((post) => postCard(post, postTemplate, seriesTitleOf(post.series))));
}

function renderSeries() {
  if (state.series.length === 0) {
    seriesList.replaceChildren(emptyState(t("empty.series.title")));
    return;
  }
  seriesList.replaceChildren(...state.series.map((entry) => seriesCard(entry, postsInSeries(entry.id).length)));
}

function renderArchive() {
  const years = archiveYears();
  if (years.length === 0) {
    archiveList.replaceChildren(emptyState(t("empty.archive.title")));
    return;
  }
  archiveList.replaceChildren(...years.map((year) => archiveYear(
    year,
    state.posts.filter((post) => yearOf(post.date) === year),
    state.photos.filter((photo) => photo.year === year).length,
    seriesTitleOf,
  )));
}

function archiveYears() {
  const years = new Set();
  for (const post of state.posts) {
    const year = yearOf(post.date);
    if (year.length > 0) {
      years.add(year);
    }
  }
  for (const photo of state.photos) {
    if (/^\d{4}$/.test(photo.year)) {
      years.add(photo.year);
    }
  }
  return Array.from(years).sort().reverse();
}

function yearOf(date) {
  return /^\d{4}/.test(date) ? date.slice(0, 4) : "";
}

function seriesTitleOf(seriesId) {
  if (typeof seriesId !== "string" || seriesId.length === 0) {
    return "";
  }
  return state.series.find((entry) => entry.id === seriesId)?.title ?? "";
}

function postsInSeries(seriesId) {
  return state.posts.filter((post) => post.series === seriesId);
}

function countText(visible, total) {
  if (total === 0) {
    return "";
  }
  if (visible === total) {
    return tCount("count.photos", total);
  }
  return t("count.filtered", { visible, total });
}

async function renderRoute(options = {}) {
  const postId = hashParam("post");
  const seriesId = hashParam("series");
  seriesDetail.hidden = true;
  seriesDetail.replaceChildren();
  if (postId.length === 0) {
    postDetail.hidden = true;
    postDetail.replaceChildren();
    state.detailPhotos = [];
  }
  if (postId.length > 0) {
    await renderPostRoute(postId, options);
    return;
  }
  if (seriesId.length > 0) {
    renderSeriesRoute(seriesId, options);
    return;
  }
  document.title = t("doc.title");
}

async function renderPostRoute(postId, options) {
  const summary = state.posts.find((post) => post.id === postId);
  if (summary === undefined) {
    postDetail.hidden = false;
    postDetail.replaceChildren(emptyState(t("post.notfound.title"), t("post.notfound.copy")));
    return;
  }
  try {
    const post = normalizePostDetail(await loadJson(summary.path), summary);
    state.detailPhotos = collectPostPhotos(post);
    const position = state.posts.indexOf(summary);
    postDetail.hidden = false;
    postDetail.replaceChildren(
      postArticle(post, photoTemplate, seriesTitleOf(summary.series)),
      postNav(state.posts[position + 1], state.posts[position - 1]),
    );
    document.title = t("doc.title.post", { title: post.title });
    if (options.keepScroll !== true) {
      postDetail.scrollIntoView({ block: "start" });
    }
  } catch (error) {
    console.error(error);
    postDetail.hidden = false;
    postDetail.replaceChildren(emptyState(t("post.failed.title"), t("post.failed.copy", { path: summary.path })));
  }
}

function renderSeriesRoute(seriesId, options) {
  const entry = state.series.find((item) => item.id === seriesId);
  if (entry === undefined) {
    seriesDetail.hidden = false;
    seriesDetail.replaceChildren(emptyState(t("series.notfound.title"), t("series.notfound.copy")));
    return;
  }
  const article = document.createElement("article");
  article.className = "post-article";
  const back = document.createElement("a");
  back.href = "#series";
  back.className = "back-link";
  back.textContent = t("series.back");
  const title = document.createElement("h2");
  title.textContent = entry.title;
  article.append(back, title);
  if (entry.description.length > 0) {
    const description = document.createElement("p");
    description.className = "post-lead";
    description.textContent = entry.description;
    article.append(description);
  }
  const posts = postsInSeries(entry.id);
  if (posts.length === 0) {
    article.append(emptyState(t("series.empty.posts")));
  } else {
    const list = document.createElement("div");
    list.className = "posts-list";
    list.append(...posts.map((post) => postCard(post, postTemplate, "")));
    article.append(list);
  }
  seriesDetail.hidden = false;
  seriesDetail.replaceChildren(article);
  document.title = t("doc.title.post", { title: entry.title });
  if (options.keepScroll !== true) {
    seriesDetail.scrollIntoView({ block: "start" });
  }
}

function hashParam(name) {
  const hash = new URL(window.location.href).hash;
  const prefix = `#${name}=`;
  return hash.startsWith(prefix) ? decodeURIComponent(hash.slice(prefix.length)) : "";
}

function matchesFilter(photo) {
  switch (state.filter) {
    case "film":
      return photo.medium === "film";
    case "digital":
      return photo.medium === "digital";
    case "bw":
      return photo.tone === "bw";
    case "all":
    default:
      return true;
  }
}
