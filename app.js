import { currentLocale, initI18n, registerMessages, t, tCount } from "./i18n.js";
import { initKeys } from "./keys.js";
import { openLightbox } from "./lightbox.js";
import { SITE_MESSAGES } from "./messages.js?v=20260801-pages";
import { loadJson, loadPhotos, loadPosts, loadSeries, normalizePostDetail } from "./site-data.js";
import { archiveYear, collectPostPhotos, lightboxItem, photoCard, placeHref, postArticle, postCard, postHref, postNav, seriesCard } from "./site-render.js";
import { LIGHTS, ORIENTATIONS, SEASONS, emptyState, requireElement } from "./site-utils.js";
import { mountShare } from "./share.js";
import { mountSound } from "./sound.js";
import { mountStory } from "./story.js";
import { viewMenu } from "./view-menu.js?v=20260802-gallery-ui";
import { mountZine } from "./zine.js";
import { loadIndex, search, searchField } from "./search.js";

registerMessages(SITE_MESSAGES);
initI18n();

// A roll is a hundred frames and an archive keeps growing, so neither list is
// poured onto the page whole. Posts are paged, photographs load a screenful at
// a time — each section gets its own small page so the home page stays
// readable as the archive grows.
const POSTS_PER_PAGE = 10;
const SERIES_PER_PAGE = 8;
const PHOTOS_PER_PAGE = 24;
const ARCHIVE_YEARS_PER_PAGE = 6;

const state = {
  filter: "all",
  photos: [],
  posts: [],
  series: [],
  detailPhotos: [],
  postsPage: 1,
  seriesPage: 1,
  galleryPage: 1,
  archivePage: 1,
  tag: "",
  query: "",
  /* every way of narrowing the same wall of photographs; they stack */
  narrow: {},
};

/* The gallery reads like the index at the back of a book: one line per way in,
   the values that are actually on a photograph, and how many frames each one
   leaves. Adding a way in means adding a line here and nothing else. */
const INDEXES = [
  { key: "place", labelKey: "places.title", values: (photos) => byName(unique(photos.map((photo) => photo.place))) },
  { key: "subject", labelKey: "subjects.title", values: (photos) => byName(unique(photos.flatMap((photo) => photo.subjects))) },
  { key: "year", labelKey: "years.title", values: (photos) => unique(photos.map((photo) => photo.year)).filter((year) => /^\d{4}$/.test(year)).sort().reverse() },
  { key: "season", labelKey: "seasons.title", values: (photos) => present(SEASONS, photos, "season"), label: (value) => t(`season.${value}`) },
  { key: "light", labelKey: "notes.light", values: (photos) => present(LIGHTS, photos, "light"), label: (value) => t(`light.${value}`) },
  { key: "format", labelKey: "formats.title", values: (photos) => byName(unique(photos.map((photo) => photo.format))) },
  { key: "camera", labelKey: "cameras.title", values: (photos) => byName(unique(photos.map((photo) => photo.exif.camera))) },
  { key: "orientation", labelKey: "orientations.title", values: (photos) => present(ORIENTATIONS, photos, "orientation"), label: (value) => t(`orientation.${value}`) },
];
const grid = requireElement("#photo-grid");
const photoCount = requireElement("#gallery-count");
const postsList = requireElement("#posts-list");
const seriesList = requireElement("#series-list");
const archiveList = requireElement("#archive-list");
const postsPager = requireElement("#posts-pager");
const seriesPager = requireElement("#series-pager");
const archivePager = requireElement("#archive-pager");
const tagBar = requireElement("#posts-tag");

/* Both lists can be read more than one way, so each heading carries a visible
   segmented control. The list view is the quickest way to understand a growing
   archive, while cards remain available when the reader wants more air. */
const postsView = viewMenu({
  storageKey: "habin-view-posts",
  options: [
    { id: "list", labelKey: "view.posts.list" },
    { id: "cards", labelKey: "view.posts.cards" },
  ],
  onPick: () => renderPosts(),
});
/* Three useful ways into the same wall: a thumbnail grid for scanning, a list
   for reading captions, and a contact sheet for quickly comparing frames. */
const galleryView = viewMenu({
  storageKey: "habin-view-gallery-v2",
  defaultId: "contact",
  options: [
    { id: "grid", labelKey: "view.gallery.grid" },
    { id: "list", labelKey: "view.gallery.list" },
    { id: "contact", labelKey: "view.gallery.contact" },
  ],
  onPick: () => renderPhotos(),
});
const field = searchField((value) => runSearch(value));
requireElement("#search-slot").append(field.node);

requireElement("#posts-view").append(postsView.node);
requireElement("#gallery-view").append(galleryView.node);
const photoPager = requireElement("#gallery-pager");
const narrowBar = requireElement("#gallery-narrow");
const filterDetails = requireElement("#gallery-index-details");
const indexRows = buildIndexRows(requireElement("#gallery-index"));
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
    state.galleryPage = 1;
    updatePressedFilter();
    renderPhotos();
    renderIndexes();
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
  /* A link to a narrowed gallery has to work when it lands in a tab that is
     already open. Jumping to "#gallery" carries no narrowing and is left to
     pass by, so reaching for the section does not undo what was chosen. */
  if (applyGalleryFromHash()) {
    renderPhotos();
    renderIndexes();
  }
  renderRoute();
});

window.addEventListener("langchange", () => {
  postsView.relabel();
  galleryView.relabel();
  field.relabel();
  renderAll();
  renderRoute({ keepScroll: true });
});

initKeys({
  focusSearch: () => field.focus(),
  onEscape: () => {
    if (state.query !== "") {
      field.set("");
      runSearch("");
    }
  },
});

const [photos, posts, series] = await Promise.all([loadPhotos(), loadPosts(), loadSeries()]);
state.photos = photos;
state.posts = posts;
state.series = series;
applyGalleryFromHash();
renderAll();
applySearchFromHash();
applyTagFromHash();
await renderRoute({ keepScroll: true });
openPhotoFromHash();

function renderAll() {
  renderPhotos();
  renderIndexes();
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
  grid.classList.toggle("is-grid", galleryView.value() === "grid");
  grid.classList.toggle("is-list", galleryView.value() === "list");
  grid.classList.toggle("is-contact", galleryView.value() === "contact");
  const visible = visiblePhotos();
  photoCount.textContent = countText(visible.length, state.photos.length);
  if (visible.length === 0) {
    grid.replaceChildren(emptyState(t(isNarrowed() ? "empty.narrowed.title" : "empty.photos.title")));
    photoPager.replaceChildren();
    return;
  }
  const pages = Math.max(1, Math.ceil(visible.length / PHOTOS_PER_PAGE));
  state.galleryPage = Math.min(Math.max(state.galleryPage, 1), pages);
  const start = (state.galleryPage - 1) * PHOTOS_PER_PAGE;
  grid.replaceChildren(...visible.slice(start, start + PHOTOS_PER_PAGE).map((photo) => photoCard(photo, photoTemplate)));
  photoPager.replaceChildren(...(pages > 1 ? [pager(pages, state.galleryPage, goToGalleryPage, "pager.gallery.aria")] : []));
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
  postsList.replaceChildren(...page.map((post, index) => postCard(post, postTemplate, seriesTitleOf(post.series), start + index + 1)));
  postsPager.replaceChildren(...(pages > 1 ? [pager(pages, state.postsPage, goToPostsPage, "pager.posts.aria")] : []));
}

function activeTagChip() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tag-clear";
  button.textContent = t("tag.clear", { tag: state.tag, n: taggedPosts().length });
  button.addEventListener("click", () => pickTag(state.tag));
  return button;
}

function pager(pages, current, onChange, ariaKey) {
  const nav = document.createElement("nav");
  nav.className = "pager";
  nav.setAttribute("aria-label", t(ariaKey));
  nav.append(pagerStep(-1, "pager.prev", current > 1, current, onChange));
  for (let page = 1; page <= pages; page += 1) {
    nav.append(pagerNumber(page, current, onChange));
  }
  nav.append(pagerStep(1, "pager.next", current < pages, current, onChange));
  return nav;
}

function pagerNumber(page, current, onChange) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pager-page";
  button.textContent = String(page);
  if (page === current) {
    button.setAttribute("aria-current", "page");
  }
  button.addEventListener("click", () => onChange(page));
  return button;
}

function pagerStep(delta, labelKey, enabled, current, onChange) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pager-step";
  button.textContent = t(labelKey);
  button.disabled = !enabled;
  button.addEventListener("click", () => onChange(current + delta));
  return button;
}

function goToPostsPage(page) {
  state.postsPage = page;
  renderPosts();
  requireElement("#posts").scrollIntoView({ block: "start" });
}

function goToSeriesPage(page) {
  state.seriesPage = page;
  renderSeries();
  requireElement("#series").scrollIntoView({ block: "start" });
}

function goToGalleryPage(page) {
  state.galleryPage = page;
  renderPhotos();
  requireElement("#gallery").scrollIntoView({ block: "start" });
}

function goToArchivePage(page) {
  state.archivePage = page;
  renderArchive();
  requireElement("#archive").scrollIntoView({ block: "start" });
}

function renderSeries() {
  if (state.series.length === 0) {
    seriesList.replaceChildren(emptyState(t("empty.series.title")));
    seriesPager.replaceChildren();
    return;
  }
  const pages = Math.max(1, Math.ceil(state.series.length / SERIES_PER_PAGE));
  state.seriesPage = Math.min(Math.max(state.seriesPage, 1), pages);
  const start = (state.seriesPage - 1) * SERIES_PER_PAGE;
  seriesList.replaceChildren(...state.series.slice(start, start + SERIES_PER_PAGE).map((entry) => seriesCard(entry, postsInSeries(entry.id).length)));
  seriesPager.replaceChildren(...(pages > 1 ? [pager(pages, state.seriesPage, goToSeriesPage, "pager.series.aria")] : []));
}

function renderArchive() {
  const years = archiveYears();
  if (years.length === 0) {
    archiveList.replaceChildren(emptyState(t("empty.archive.title")));
    archivePager.replaceChildren();
    return;
  }
  const pages = Math.max(1, Math.ceil(years.length / ARCHIVE_YEARS_PER_PAGE));
  state.archivePage = Math.min(Math.max(state.archivePage, 1), pages);
  const start = (state.archivePage - 1) * ARCHIVE_YEARS_PER_PAGE;
  archiveList.replaceChildren(...years.slice(start, start + ARCHIVE_YEARS_PER_PAGE).map((year) => archiveYear(
    year,
    state.posts.filter((post) => yearOf(post.date) === year),
    state.photos.filter((photo) => photo.year === year).length,
    seriesTitleOf,
  )));
  archivePager.replaceChildren(...(pages > 1 ? [pager(pages, state.archivePage, goToArchivePage, "pager.archive.aria")] : []));
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
      soundSlot(post),
      postArticle(post, photoTemplate, seriesTitleOf(summary.series)),
      postTools(summary),
      postNav(state.posts[position + 1], state.posts[position - 1]),
    );
    mountZine(postDetail);
    mountStory(postDetail);
    mountShare(postDetail);
    mountSound(postDetail);
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

/* The same row of controls the written-out pages carry, so a post reached by
   an old "#post=" link is no poorer than one reached by its own address. */
function postTools(summary) {
  const tools = document.createElement("div");
  tools.className = "post-tools";

  const story = document.createElement("div");
  story.className = "story-slot";

  const zine = document.createElement("div");
  zine.className = "zine-slot";
  zine.dataset.zine = "post";
  zine.dataset.zineId = summary.id;
  zine.dataset.zineTitle = summary.title;
  zine.dataset.zineLead = summary.excerpt;
  zine.dataset.zineDate = summary.date;
  zine.dataset.zinePath = summary.path;

  const share = document.createElement("div");
  share.className = "share-slot";
  share.dataset.shareUrl = new URL(postHref(summary.id), window.location.origin).href;
  share.dataset.shareTitle = summary.title;

  tools.append(story, zine, share);
  return tools;
}

function soundSlot(post) {
  const slot = document.createElement("div");
  if (typeof post.soundtrack?.url === "string") {
    slot.className = "sound-slot";
    slot.dataset.soundUrl = post.soundtrack.url;
    slot.dataset.soundLabel = typeof post.soundtrack.label === "string" ? post.soundtrack.label : "";
  }
  return slot;
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
    list.setAttribute("role", "list");
    list.append(...posts.map((post, index) => postCard(post, postTemplate, "", index + 1)));
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
    list.setAttribute("role", "list");
    list.append(...found.posts.map((post, index) => postCard(
      { ...post, tags: post.tags, series: "" },
      postTemplate,
      post.series,
      index + 1,
    )));
    nodes.push(list);
  }

  if (found.photos.length > 0) {
    const strip = document.createElement("div");
    strip.className = "photo-grid is-contact";
    strip.setAttribute("role", "list");
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

/* someone opened a link to one photograph: move to its gallery page, then put
   it on screen */
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
  const page = Math.floor(position / PHOTOS_PER_PAGE) + 1;
  if (state.galleryPage !== page) {
    state.galleryPage = page;
    renderPhotos();
  }
  openLightbox(visible.map(lightboxItem), position);
}

/* The address carries one thing at a time — a post, a search, a photograph —
   except when narrowing the gallery, where place, year and season travel
   together as "#place=seoul&year=2026". */
function hashParam(name) {
  const hash = new URL(window.location.href).hash.replace(/^#/, "");
  return new URLSearchParams(hash).get(name) ?? "";
}

function matchesFilter(photo, overrides = {}) {
  const narrow = { ...state.narrow, ...overrides };
  return matchesMedium(photo, state.filter)
    && INDEXES.every(({ key }) => carries(photo, key, narrow[key] ?? ""));
}

function carries(photo, key, value) {
  if (value === "") {
    return true;
  }
  if (key === "subject") {
    return photo.subjects.includes(value);
  }
  if (key === "camera") {
    return photo.exif.camera === value;
  }
  return photo[key] === value;
}

function matchesMedium(photo, filter) {
  switch (filter) {
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

/* ── the index at the back of the book ──────────────────── */
/* Each row is the same shape: everything, then every value that is actually on
   a photograph, with the number of frames choosing it would leave. The counts
   read the other rows, so a row never offers a dead end. */

function buildIndexRows(host) {
  const rows = {};
  for (const index of INDEXES) {
    const row = document.createElement("div");
    row.className = "index-row";
    row.hidden = true;

    const label = document.createElement("h3");
    label.className = "index-label";
    label.dataset.i18n = index.labelKey;
    label.textContent = t(index.labelKey);

    const items = document.createElement("div");
    items.className = "index-items";
    items.setAttribute("role", "group");
    items.dataset.i18nAttrs = `aria-label:index.aria.${index.key}`;
    items.setAttribute("aria-label", t(`index.aria.${index.key}`));

    row.append(label, items);
    host.append(row);
    rows[index.key] = { row, items };
  }
  return rows;
}

function renderIndexes() {
  filterDetails.open = isNarrowed();
  for (const index of INDEXES) {
    const { row, items } = indexRows[index.key];
    const values = index.values(state.photos);
    row.hidden = values.length === 0;
    items.replaceChildren(...(values.length === 0 ? [] : [
      indexChoice(index, ""),
      ...values.map((value) => indexChoice(index, value)),
    ]));
  }
  renderNarrowBar();
}

function indexChoice(index, value) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "index-choice";
  button.setAttribute("aria-pressed", String(narrowed(index.key) === value));
  button.append(document.createTextNode(value === "" ? t("index.all") : labelFor(index, value)));

  const count = document.createElement("span");
  count.className = "index-count";
  count.textContent = String(state.photos.filter((photo) => matchesFilter(photo, { [index.key]: value })).length);
  button.append(count);

  button.addEventListener("click", () => narrow(index.key, value));
  return button;
}

function labelFor(index, value) {
  return index.label === undefined ? value : index.label(value);
}

function narrowed(key) {
  return state.narrow[key] ?? "";
}

function isNarrowed() {
  return INDEXES.some((index) => narrowed(index.key) !== "");
}

function narrow(key, value) {
  state.narrow[key] = narrowed(key) === value ? "" : value;
  state.galleryPage = 1;
  syncGalleryHash();
  renderPhotos();
  renderIndexes();
}

function clearNarrowing() {
  state.narrow = {};
  state.galleryPage = 1;
  syncGalleryHash();
  renderPhotos();
  renderIndexes();
}

function renderNarrowBar() {
  if (!isNarrowed()) {
    narrowBar.replaceChildren();
    return;
  }
  const note = document.createElement("p");
  note.className = "narrow-note";
  note.textContent = INDEXES
    .filter((index) => narrowed(index.key) !== "")
    .map((index) => labelFor(index, narrowed(index.key)))
    .join(" · ");

  const nodes = [note];
  /* a place worth narrowing to is a place with a page of its own */
  if (narrowed("place") !== "") {
    const link = document.createElement("a");
    link.className = "narrow-page";
    link.href = placeHref(narrowed("place"));
    link.textContent = t("narrow.page", { place: narrowed("place") });
    nodes.push(link);
  }
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "narrow-clear";
  clear.textContent = t("narrow.clear");
  clear.addEventListener("click", () => clearNarrowing());
  nodes.push(clear);
  narrowBar.replaceChildren(...nodes);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function byName(values) {
  return values.sort((a, b) => a.localeCompare(b, currentLocale()));
}

function present(candidates, photos, key) {
  return candidates.filter((candidate) => photos.some((photo) => photo[key] === candidate));
}

function syncGalleryHash() {
  if (!isNarrowed()) {
    history.replaceState(null, "", window.location.pathname);
    return;
  }
  const params = new URLSearchParams();
  for (const index of INDEXES) {
    if (narrowed(index.key) !== "") {
      params.set(index.key, narrowed(index.key));
    }
  }
  history.replaceState(null, "", `#${params.toString()}`);
}

function applyGalleryFromHash() {
  const wanted = {};
  for (const index of INDEXES) {
    const value = hashParam(index.key);
    if (value !== "" && index.values(state.photos).includes(value)) {
      wanted[index.key] = value;
    }
  }
  if (Object.keys(wanted).length === 0) {
    return false;
  }
  state.narrow = wanted;
  state.galleryPage = 1;
  return true;
}
