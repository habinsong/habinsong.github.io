# Habin Song Photographs Design System

## 0. Research Log

- Embedded refs: user supplied Magnum Photos and Alex Burke Photo blog → picked minimalist editorial execution because both references use restrained navigation, image-first layout, light type, factual captions, and no decorative effects.
- Live references: Magnum informed serif/sans editorial captions, wide image hierarchy, and word-only navigation; Alex Burke informed single-column photo essays, medium filters, and technical caption syntax.
- Skipped lanes: image generation and stock/reference imagery — no user photographs were supplied and the brief requires the user's own photographs, not placeholders.

## 1. Atmosphere & Identity

A quiet photographic index: white paper, black ink, generous air, and captions that behave like darkroom notes. The signature is restraint — rectangular photographs, factual metadata, no decorative color, no hover zoom, no modal theatrics.

Copy principles:
- No taglines, no poetic self-description, no marketing voice. Headings name what a section contains ("글", "갤러리", "소개") and nothing more.
- Public pages never explain the site's own tooling or hosting; workflow instructions live only on the admin page.
- No uppercase eyebrow/kicker labels above headings — a heading stands alone.
- The admin page is reachable at `/admin/` but is not linked from public navigation.

## 2. Color

Only grayscale is allowed. No hue-based accents, no gradients, no tinted overlays.

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Paper | `--paper` | `#ffffff` | Page background |
| Ink | `--ink` | `#111111` | Primary text and focus |
| Soft ink | `--ink-soft` | `#222222` | Large headings |
| Muted text | `--muted` | `#5c5c5c` | Body copy |
| Quiet text | `--quiet` | `#8a8a8a` | Metadata and captions |
| Line | `--line` | `#d8d8d8` | Strong dividers |
| Soft line | `--line-soft` | `#eeeeee` | Subtle dividers |
| Surface | `--surface` | `#f7f7f7` | Empty image frame |
| Deep surface | `--surface-deep` | `#000000` | Reserved for black photographic assets only |

Rules:
- If it is not grayscale, it does not ship.
- Photographs may contain their native color; interface chrome may not.
- No box shadows for depth. Separation comes from whitespace, lines, and tonal contrast.

## 3. Typography

| Level | Size | Weight | Line height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| H1 | `clamp(28px, 4vw, 44px)` | 300 | 1.2 | -0.015em | Page intro |
| H2 | `clamp(21px, 2.6vw, 28px)` | 300 | 1.25 | -0.01em | Section headers |
| Lead | `16px–18px` | 400 | 1.7 | 0 | Intro and about copy |
| Caption | `18px` | 300 | 1.5 | 0 | Photo title/location |
| Meta | `12px` | 300 | 1.6 | 0.04em | Medium, tone, technical detail |
| Nav | `12px–14px` | 300 | 1.4 | 0.12–0.18em | Navigation and filters |

Font stack:
- Serif: Georgia, Times New Roman, serif
- Sans: Helvetica Neue, Arial, sans-serif
- Mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace

Rules:
- Light type only; no bold display treatment, no oversized display headlines.
- Captions stay directly under photographs.
- Copy is factual, not promotional.

Line breaking (per language, via `:lang()`):
- Korean: `word-break: keep-all` — lines break between words, never inside a word.
- Japanese / Chinese: per-character wrapping with `line-break: strict` so punctuation never starts a line.
- All languages: `overflow-wrap: break-word` as overflow safety, `text-wrap: balance` on headings, `text-wrap: pretty` on body text where supported.
- These rules also apply inside the self-contained `404.html`.

## 4. Spacing & Layout

Base unit: 4px.

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight offsets |
| `--space-2` | 8px | Small gaps |
| `--space-3` | 12px | Caption spacing |
| `--space-4` | 16px | Mobile padding |
| `--space-5` | 20px | Navigation gap |
| `--space-6` | 24px | Desktop padding |
| `--space-8` | 32px | Section head gap |
| `--space-10` | 40px | Footer bottom |
| `--space-12` | 48px | Gallery filter gap |
| `--space-16` | 64px | Photo row gap |
| `--space-20` | 80px | Major vertical rhythm |

Grid:
- Max content width: 1120px.
- Reading measure: 720px.
- Desktop gallery: 12-column editorial grid with every fifth image full-width.
- Mobile gallery: single-column.

## 5. Components

### Language Switcher
- Structure: text-only bar above the header with four native-name buttons (한국어 / English / 日本語 / 中文).
- States: active language uses ink color plus underline and `aria-pressed="true"`; hover softens to ink.
- Behavior: choice persists in `localStorage` (`habin-lang`), `?lang=` query overrides, first visit falls back to `navigator.languages`, then English. Switching re-renders all dynamic content and updates `<html lang>`.
- Rule: every user-facing string (site, admin, 404) resolves through the `i18n.js` catalog; no hardcoded single-language copy. Personal names and the wordmark are exempt.

### Site Header
- Structure: wordmark link + two text navigation links.
- States: hover softens to muted gray; focus shows 1px black outline.
- Accessibility: semantic header/nav; no icon-only controls.

### Filter Bar
- Structure: toolbar of native buttons for All, Film, Digital, B/W.
- States: active button uses underline and `aria-pressed="true"`; focus ring is visible.
- Motion: color/border transition only.

### Photo Card
- Structure: figure → image frame → image → figcaption.
- Variants: normal image, missing-image fallback, full-width editorial position.
- States: no hover zoom, no overlay, no lightbox.
- Accessibility: real alt text from `photos.json`; captions remain visible text.

### Empty State
- Structure: one quiet muted sentence under a soft top border ("아직 게시된 사진이 없습니다.").
- Purpose: avoids fake stock imagery when no user photographs are present; publishing workflow instructions stay on the admin page, not here.

### Post Card
- Structure: article link with date/medium metadata, title, excerpt, and optional lead image.
- States: text hover softens to muted gray; no card lift, no image zoom.
- Accessibility: card title is the link target; excerpt remains readable text.

### Post Detail
- Structure: post header (date · series), ordered content blocks, persistent captions, and source links.
- Blocks: paragraph, heading, photo (with optional comment), gallery, quote, and link-list.
- Photo comments render as muted serif text directly under the caption — the story behind the frame.
- Accessibility: every image requires alt text; external links include visible host text when useful.

### Series
- Structure: card grid of series (title link, post count, optional description); `#series=<id>` route shows the series description plus its posts.
- Data: `series.json` manifest; posts reference a series by id in the posts index.
- Purpose: project-based organization — the primary pattern on working photographers' sites.

### Archive
- Structure: year rows (newest first) with post/photograph counts and post links; years derive from post dates and photo year fields.
- Purpose: the chronological "photography life" view alongside the curated series view.

### Lightbox
- Structure: native `<dialog>` opened with `showModal()` — full-bleed paper background, image, caption/meta, counter, Prev/Next/Close text buttons.
- Interaction: photo frames are buttons; arrow keys navigate, Escape closes (native), backdrop click closes, focus trapping and restoration are native dialog behavior.
- Restraint: no zoom, no animation, grayscale chrome only. This supersedes the earlier "no lightbox" rule — full-frame viewing is core to a photography archive, and the native dialog keeps it accessible without theatrics.

### Admin Composer (WYSIWYG canvas)
- Structure: metadata form + a `contenteditable` document canvas (`admin/editor.js`) with a block toolbar, an asset panel for photo metadata, live preview, and export actions.
- Canvas: type directly; Enter starts a new paragraph; the toolbar switches the current block between Text / Heading / Quote. Paste is forced to plain text. The canvas serializes to the same JSON block schema the public renderer consumes.
- Islands: photos, galleries, and link lists are atomic `contenteditable="false"` nodes with ↑ / ↓ / × controls and interactive inner inputs (photo comment, gallery checkboxes, link lines). Backspace from adjacent text removes a whole island — standard atomic-embed behavior.
- Images: drop files onto the canvas to insert at the caret (`caretRangeFromPoint`), use the Photo toolbar button (opens the file picker, inserts at caret), "Add all photos", or per-asset "Insert" buttons. Photo metadata (alt, medium, tone, place, year, ratio, details) is edited in the asset panel; islands show live thumbnails via object URLs. Assets can be deleted (their islands are removed too).
- Autofill: on add, the real pixel aspect ratio is measured, and JPEG EXIF fills year and details (camera, lens, focal length, aperture, shutter, ISO) — all still editable.
- Import: "Import JSON" loads an exported post back into the canvas for editing; its photos keep their repository `src` paths (rendered from the served site) and re-export without needing the original files.
- Series: free-text series field with a datalist of existing series; export bundle includes `series.merge.json` when set.
- States: validation errors use border/text weight only; no color accents.
- Storage: browser `localStorage` draft (block JSON, not HTML) plus IndexedDB for image files — assets and their islands survive reloads. Reset clears both.
- Accessibility: toolbar has `role="toolbar"`, canvas is `role="textbox"` `aria-multiline`, island controls carry localized `aria-label`s, and all controls are native buttons/inputs.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 150ms | ease | Link and filter state changes |

Rules:
- No page-load animation, parallax, carousel, hover zoom, or modal lightbox.
- Respect `prefers-reduced-motion`.
- Only `color`, `border-color`, and `opacity` transitions are used.

## 7. Depth & Surface

Strategy: borders-only plus whitespace.

| Type | Value | Usage |
|------|-------|-------|
| Default border | `1px solid var(--line)` | Empty state, missing image frame |
| Subtle border | `1px solid var(--line-soft)` | Header, filters, section dividers |

No shadows. No rounded image corners. Photographs remain rectangular.

## 8. Accessibility Constraints & Accepted Debt

Constraints:
- WCAG 2.2 AA target.
- Visible keyboard focus for every link and button.
- Native buttons for filters with `aria-pressed` state.
- `<html lang>` follows the selected language (`ko` / `en` / `ja` / `zh-Hans`); markup defaults to English fallback text before scripts run.
- Captions are persistent, not hidden behind hover.

Internationalization:
- Four languages: Korean, English, Japanese, Simplified Chinese.
- Catalogs: `messages.js` (site) and `admin/admin-messages.js` (admin) registered into `i18n.js`; `404.html` inlines its own dictionary because GitHub Pages serves it at arbitrary paths where relative imports break.
- Missing keys fall back to English, then to the key itself.

Discovery files (release script output):
- `robots.txt` always (allows all, disallows `/admin/`).
- `feed.xml` (Atom) and `sitemap.xml` only when `site.json` `baseUrl` is set; the script prints `feed-skip` otherwise.
- `.well-known/security.txt` (RFC 9116) with the contact email and a one-year expiry.

Security posture:
- Zero external dependencies at runtime — no CDN scripts, fonts, or analytics; nothing to supply-chain.
- All rendering uses `textContent`/DOM APIs (no `innerHTML`, no `eval`); link URLs are restricted to http(s); post/photo ids are slugged.
- CSP via `<meta http-equiv>` on every page (GitHub Pages cannot set response headers): `default-src 'none'` baseline, `script-src 'self'` (404.html allows its inline script by sha256 hash — recompute if that script changes), `img-src` adds `data:`/`https:` (and `blob:` on admin for thumbnails), `base-uri 'none'`, `form-action 'none'`. Meta CSP cannot express `frame-ancestors`/HSTS — accepted Pages limitation.
- `Referrer-Policy: strict-origin-when-cross-origin` via meta; external links carry `rel="noopener noreferrer"`.
- The admin form never submits (JS `preventDefault` + CSP `form-action 'none'`).
- `release.py` rejects path traversal (all local paths must resolve inside the repository, post paths must live under `content/posts/`) and escapes XML text and attributes in the feed.

Accepted debt:

| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| `baseUrl` empty in `site.json` | `site.json` | Final GitHub Pages URL not confirmed | Set the published URL to enable `feed.xml` and `sitemap.xml` |
| No photographs yet | `photos.json` / `content/posts/index.json` | User has not provided image assets | Add files under `photos/` and publish post manifests |
| Admin cannot write directly to GitHub Pages | `admin/` | GitHub Pages has no server/database; direct GitHub API auth would expose operational complexity | Export ZIP locally, then run `scripts/release.py` after placing files in repo |
| Post-detail language stays as authored | `content/posts/*.json` | Post bodies are user content, written in one language per post | Author may publish per-language posts if needed |
