import { initI18n, registerMessages, t, tCount } from "./i18n.js";
import { openLightbox } from "./lightbox.js";
import { SITE_MESSAGES } from "./messages.js";
import { loadJson, loadPhotos, loadPosts, loadSeries, normalizePostDetail } from "./site-data.js";
import { archiveYear, collectPostPhotos, lightboxItem, photoCard, postArticle, postCard, postNav, seriesCard } from "./site-render.js";
import { emptyState, requireElement } from "./site-utils.js";
import { viewMenu } from "./view-menu.js";
import { loadIndex, search, searchField } from "./search.js";

registerMessages(SITE_MESSAGES);
initI18n();

// A roll is a hundred frames and an archive keeps growing, so neither list is
// poured onto the page whole. Posts are paged, photographs load a screenful at
// a time — the gallery is meant to be scrolled, not clicked through.
const POSTS_PER_PAGE = 10;
const PHOTOS_PER_STEP = 24;

const state = {
  filter: "all",
  photos: [],
  posts: [],
  series: [],
  detailPhotos: [],
  postsPage: 1,
  photosShown: PHOTOS_PER_STEP,
  tag: "",
  query: "",
};
const grid = requireElement("#photo-grid");
const photoCount = requireElement("#gallery-count");
const postsList = requireElement("#posts-list");
const seriesList = requireElement("#series-list");
const archiveList = requireElement("#archive-list");
const postsPager = requireElement("#posts-pager");
const tagBar = requireElement("#posts-tag");

/* Both lists can be read more than one way, so each heading carries a small
   menu. Cards and the loose grid are the defaults — the ones that suit a
   handful of entries, which is what the site holds most of the time. */
const postsView = viewMenu({
  storageKey: "habin-view-posts",
  options: [
    { id: "cards", labelKey: "view.posts.cards" },
    { id: "list", labelKey: "view.posts.list" },
  ],
  onPick: () => renderPosts(),
});
const galleryView = viewMenu({
  storageKey: "habin-view-gallery",
  options: [
    { id: "grid", labelKey: "view.gallery.grid" },
    { id: "large", labelKey: "view.gallery.large" },
    { id: "dense", labelKey: "view.gallery.dense" },
  ],
  onPick: () => renderPhotos(),
});
const field = searchField((value) => runSearch(value));
requireElement("#search-slot").append(field.node);

requireElement("#posts-view").append(postsView.node);
requireElement("#gallery-view").append(galleryView.node);
const photoMore = requireElement("#gallery-more");
const postDetail = requireElement("#post-detail");
const searchPanel = requireElement("#search-results");
const pageSections = ["posts", "series", "gallery", "archive", "about"].map((id) => requireElement(`#${id}`));
const seriesDetail = requireElement("#series-detail");
const photoTemplate = requireElement("#photo-card-template");
const postTemplate = requireElement("#post-card-template");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));

requireElement("#year").textContent = String(new Date().getFullYear());

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter ?? "all";
    state.photosShown = PHOTOS_PER_STEP;
    updatePressedFilter();
    renderPhotos();
  });
}

postsList.addEventListener("tag:pick", (event) => {
  pickTag(event.detail.tag);
});

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
  postsView.relabel();
  galleryView.relabel();
  field.relabel();
  renderAll();
  renderRoute({ keepScroll: true });
});

const [photos, posts, series] = await Promise.all([loadPhotos(), loadPosts(), loadSeries()]);
state.photos = photos;
state.posts = posts;
state.series = series;
renderAll();
applySearchFromHash();
applyTagFromHash();
await renderRoute({ keepScroll: true });
openPhotoFromHash();

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
  grid.classList.toggle("is-large", galleryView.value() === "large");
  grid.classList.toggle("is-dense", galleryView.value() === "dense");
  const visible = visiblePhotos();
  photoCount.textContent = countText(visible.length, state.photos.length);
  if (visible.length === 0) {
    grid.replaceChildren(emptyState(t("empty.photos.title")));
    photoMore.replaceChildren();
    return;
  }
  const shown = Math.min(state.photosShown, visible.length);
  grid.replaceChildren(...visible.slice(0, shown).map((photo) => photoCard(photo, photoTemplate)));
  photoMore.replaceChildren(...(shown < visible.length ? [moreButton(visible.length - shown)] : []));
}

function moreButton(remaining) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "more-button";
  button.textContent = t("gallery.more", { n: remaining });
  button.addEventListener("click", () => {
    state.photosShown += PHOTOS_PER_STEP;
    renderPhotos();
  });
  return button;
}

function taggedPosts() {
  return state.tag === "" ? state.posts : state.posts.filter((post) => post.tags.includes(state.tag));
}

function pickTag(tag, options = {}) {
  state.tag = state.tag === tag ? "" : tag;
  state.postsPage = 1;
  renderPosts();
  if (options.quiet !== true) {
    requireElement("#posts").scrollIntoView({ block: "start" });
  }
}

function renderPosts() {
  postsList.classList.toggle("is-list", postsView.value() === "list");
  const posts = taggedPosts();
  tagBar.replaceChildren(...(state.tag === "" ? [] : [activeTagChip()]));
  if (posts.length === 0) {
    postsList.replaceChildren(emptyState(t(state.tag === "" ? "empty.posts.title" : "empty.tagged.title")));
    postsPager.replaceChildren();
    return;
  }
  const pages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  state.postsPage = Math.min(Math.max(state.postsPage, 1), pages);
  const start = (state.postsPage - 1) * POSTS_PER_PAGE;
  const page = posts.slice(start, start + POSTS_PER_PAGE);
  postsList.replaceChildren(...page.map((post) => postCard(post, postTemplate, seriesTitleOf(post.series))));
  postsPager.replaceChildren(...(pages > 1 ? [pager(pages)] : []));
}

function activeTagChip() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tag-clear";
  button.textContent = t("tag.clear", { tag: state.tag, n: taggedPosts().length });
  button.addEventListener("click", () => pickTag(state.tag));
  return button;
}

function pager(pages) {
  const nav = document.createElement("nav");
  nav.className = "pager";
  nav.setAttribute("aria-label", t("pager.aria"));
  nav.append(pagerStep(-1, "pager.prev", state.postsPage > 1));
  for (let page = 1; page <= pages; page += 1) {
    nav.append(pagerNumber(page));
  }
  nav.append(pagerStep(1, "pager.next", state.postsPage < pages));
  return nav;
}

function pagerNumber(page) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pager-page";
  button.textContent = String(page);
  button.setAttribute("aria-current", String(page === state.postsPage));
  button.addEventListener("click", () => goToPostsPage(page));
  return button;
}

function pagerStep(delta, labelKey, enabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pager-step";
  button.textContent = t(labelKey);
  button.disabled = !enabled;
  button.addEventListener("click", () => goToPostsPage(state.postsPage + delta));
  return button;
}

function goToPostsPage(page) {
  state.postsPage = page;
  renderPosts();
  requireElement("#posts").scrollIntoView({ block: "start" });
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

/* Searching swaps the page for its results and leaves the address behind, so
   a search can be sent to someone or reloaded. */
async function runSearch(query) {
  state.query = query;
  const clean = query.trim();
  history.replaceState(null, "", clean === "" ? window.location.pathname : `#q=${encodeURIComponent(clean)}`);

  for (const section of pageSections) {
    section.hidden = clean !== "";
  }
  if (clean === "") {
    searchPanel.hidden = true;
    searchPanel.replaceChildren();
    return;
  }

  await loadIndex();
  if (state.query.trim() !== clean) {
    return;
  }
  const found = search(clean, state.photos);
  searchPanel.hidden = false;
  searchPanel.replaceChildren(...searchResults(clean, found));
}

function searchResults(query, found) {
  const nodes = [];
  const heading = document.createElement("p");
  heading.className = "search-count";
  heading.textContent = t("search.count", {
    query,
    posts: found.posts.length,
    photos: found.photos.length,
  });
  nodes.push(heading);

  if (found.posts.length === 0 && found.photos.length === 0) {
    nodes.push(emptyState(t("search.none.title")));
    return nodes;
  }

  if (found.posts.length > 0) {
    const list = document.createElement("div");
    list.className = "posts-list is-list";
    list.append(...found.posts.map((post) => postCard(
      { ...post, tags: post.tags, series: "" },
      postTemplate,
      post.series,
    )));
    nodes.push(list);
  }

  if (found.photos.length > 0) {
    const strip = document.createElement("div");
    strip.className = "photo-grid is-dense";
    strip.append(...found.photos.map((photo) => photoCard(photo, photoTemplate)));
    strip.addEventListener("photo:open", (event) => {
      const start = found.photos.findIndex((photo) => photo.id === event.detail.id);
      openLightbox(found.photos.map(lightboxItem), Math.max(start, 0));
    });
    nodes.push(strip);
  }
  return nodes;
}

function applySearchFromHash() {
  const wanted = hashParam("q");
  if (wanted !== "") {
    field.set(wanted);
    runSearch(wanted);
  }
}

/* a link that carries a tag opens the list already narrowed to it */
function applyTagFromHash() {
  const wanted = hashParam("tag");
  if (wanted !== "" && state.posts.some((post) => post.tags.includes(wanted))) {
    pickTag(wanted, { quiet: true });
  }
}

/* someone opened a link to one photograph: show enough of the gallery to
   reach it, then put it on screen */
function openPhotoFromHash() {
  const wanted = hashParam("photo");
  if (wanted === "") {
    return;
  }
  const visible = visiblePhotos();
  const position = visible.findIndex((photo) => photo.id === wanted);
  if (position < 0) {
    return;
  }
  if (position >= state.photosShown) {
    state.photosShown = Math.ceil((position + 1) / PHOTOS_PER_STEP) * PHOTOS_PER_STEP;
    renderPhotos();
  }
  openLightbox(visible.map(lightboxItem), position);
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
