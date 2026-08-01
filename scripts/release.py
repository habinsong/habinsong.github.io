#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from datetime import timedelta
from urllib.parse import parse_qs, quote, urlparse
from xml.sax.saxutils import escape, quoteattr

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_release"

PUBLIC_FILES = [
    "index.html",
    "404.html",
    "styles.css",
    "base.css",
    "layout.css",
    "gallery.css",
    "posts.css",
    "responsive.css",
    "lightbox.css",
    "zine.css",
    "app.js",
    "i18n.js",
    "messages.js",
    "lightbox.js",
    "site-utils.js",
    "site-data.js",
    "site-render.js",
    "post-page.js",
    "view-menu.js",
    "search.js",
    "keys.js",
    "zine.js",
    "story.js",
    "share.js",
    "sound.js",
    "photos.json",
    "series.json",
    "site.json",
    ".nojekyll",
]
PUBLIC_DIRS = ["admin", "content", "photos"]


@dataclass(frozen=True)
class ReleaseError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


# What a frame was made with. The order and the keys match site-utils.js; the
# English words here are only what shows before the page's script has put the
# reader's own language in their place.
EXIF_FIELDS = ["camera", "lens", "film", "aperture", "shutter", "iso"]
EXIF_LABELS = {
    "camera": "Camera",
    "lens": "Lens",
    "film": "Film",
    "aperture": "Aperture",
    "shutter": "Shutter",
    "iso": "ISO",
}

# Where the sun stood. Kept in step with site-utils.js so a page written out
# here says the same thing the front page says about the same photograph.
SEASONS = ["winter", "spring", "summer", "autumn"]
LIGHTS = ["blue", "golden", "day", "night"]
LIGHT_LABELS = {"blue": "Blue hour", "golden": "Golden hour", "day": "Daylight", "night": "Night"}
SUN = {
    "spring": (6.2, 19.0),
    "summer": (5.4, 19.6),
    "autumn": (6.6, 18.0),
    "winter": (7.6, 17.4),
    "": (6.5, 18.5),
}
GOLDEN_HOURS = 1.0
BLUE_HOURS = 0.6


def season_of(date: str) -> str:
    match = re.match(r"^\d{4}-(\d{2})", date or "")
    if match is None:
        return ""
    month = int(match.group(1))
    return SEASONS[(month % 12) // 3] if 1 <= month <= 12 else ""


def light_of(time: str, season: str) -> str:
    match = re.fullmatch(r"(\d{2}):(\d{2})", time or "")
    if match is None:
        return ""
    hour = int(match.group(1)) + int(match.group(2)) / 60
    up, down = SUN.get(season, SUN[""])
    if up <= hour <= up + GOLDEN_HOURS or down - GOLDEN_HOURS <= hour <= down:
        return "golden"
    if up - BLUE_HOURS <= hour < up or down < hour <= down + BLUE_HOURS:
        return "blue"
    return "day" if up < hour < down else "night"

MERGE_SOURCES = [
    ("photos.merge.json", "photos.json", "photos"),
    ("series.merge.json", "series.json", "series"),
    ("content/posts/index.merge.json", "content/posts/index.json", "posts"),
]


def merge_pending_bundles() -> None:
    for source_name, target_name, key in MERGE_SOURCES:
        source_path = ROOT / source_name
        if not source_path.exists():
            continue
        incoming = read_json(source_path).get(key)
        target_path = ROOT / target_name
        target = read_json(target_path)
        existing = target.get(key)
        if not isinstance(incoming, list) or not isinstance(existing, list):
            raise ReleaseError(f"Cannot merge {source_name}: {key} must be an array in both files")
        position_of = {item["id"]: index for index, item in enumerate(existing) if isinstance(item, dict) and "id" in item}
        added = updated = 0
        for item in incoming:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                raise ReleaseError(f"{source_name} items need a string id")
            if item["id"] in position_of:
                existing[position_of[item["id"]]] = item
                updated += 1
            else:
                position_of[item["id"]] = len(existing)
                existing.append(item)
                added += 1
        target_path.write_text(json.dumps(target, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        source_path.unlink()
        print(f"merged: {source_name} -> {target_name} (+{added} new, {updated} updated)")


def main() -> None:
    merge_pending_bundles()
    site = read_json(ROOT / "site.json")
    photos = read_json(ROOT / "photos.json")
    series = read_json(ROOT / "series.json")
    posts_index = read_json(ROOT / "content/posts/index.json")
    validate_site_config(site)
    validate_photos_manifest(photos)
    series_ids = validate_series_manifest(series)
    validate_posts_index(posts_index, series_ids)
    validate_post_files(posts_index)
    build_release()
    cards = write_share_cards(posts_index)
    write_post_pages(site, posts_index, cards)
    write_series_pages(site, posts_index)
    write_archive_pages(site, posts_index)
    places = write_place_pages(site)
    write_search_index(posts_index)
    write_discovery_files(site, posts_index, places, cards)
    print(f"release-ok: {OUT}")


# A link pasted into a chat window is shown as a card 1200 by 630, and a
# photograph dropped into that shape is cropped by whoever is showing it. So
# the card is made here: the whole frame, uncropped, on the same white paper
# the site is printed on. The photographs keep their own colour — the rule has
# always been that the chrome is grey and the pictures are not.
CARD_SIZE = (1200, 630)
CARD_MARGIN = 60


def write_share_cards(posts_index: dict[str, Any]) -> dict[str, str]:
    wanted: dict[str, str] = {}
    photos = read_json(ROOT / "photos.json").get("photos", [])
    first = next((str(photo["src"]) for photo in photos if isinstance(photo, dict) and photo.get("src")), "")
    if first:
        wanted["index"] = first
    for summary in published_posts(posts_index):
        cover = first_photo(read_json(ROOT / summary["path"]))
        if cover and not cover.startswith(("http://", "https://")):
            wanted[summary["id"]] = cover
    if not wanted:
        return {}

    try:
        from PIL import Image
    except ImportError:
        print("card-skip: no pillow, share previews fall back to the photograph itself")
        return {}

    (OUT / "cards").mkdir(parents=True, exist_ok=True)
    made: dict[str, str] = {}
    for name, src in wanted.items():
        source = safe_local_path(src, f"share card {name}")
        if not source.exists():
            continue
        with Image.open(source) as frame:
            card = Image.new("RGB", CARD_SIZE, (255, 255, 255))
            plate = frame.convert("RGB")
            plate.thumbnail((CARD_SIZE[0] - CARD_MARGIN * 2, CARD_SIZE[1] - CARD_MARGIN * 2), Image.LANCZOS)
            card.paste(plate, ((CARD_SIZE[0] - plate.width) // 2, (CARD_SIZE[1] - plate.height) // 2))
            card.save(OUT / "cards" / f"{name}.png", "PNG", optimize=True)
        made[name] = f"cards/{name}.png"
    if made:
        print(f"cards: {len(made)} share preview(s)")
    return made


def validate_series_manifest(manifest: dict[str, Any]) -> set[str]:
    series = manifest.get("series")
    if not isinstance(series, list):
        raise ReleaseError("series.json must contain a series array")
    ids: set[str] = set()
    for position, entry in enumerate(series):
        if not isinstance(entry, dict):
            raise ReleaseError(f"series[{position}] must be an object")
        series_id = required_text(entry, "id", f"series[{position}]")
        if series_id in ids:
            raise ReleaseError(f"Duplicate series id: {series_id}")
        ids.add(series_id)
        required_text(entry, "title", f"series[{position}]")
        description = entry.get("description")
        if description is not None and not isinstance(description, str):
            raise ReleaseError(f"series[{position}] description must be a string")
    return ids


def validate_site_config(site: dict[str, Any]) -> None:
    required_text(site, "title", "site.json")
    email = required_text(site, "email", "site.json")
    if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) is None:
        raise ReleaseError(f"site.json email looks invalid: {email}")
    base_url = site.get("baseUrl")
    if not isinstance(base_url, str):
        raise ReleaseError("site.json baseUrl must be a string (may be empty)")
    if base_url and not base_url.startswith(("http://", "https://")):
        raise ReleaseError(f"site.json baseUrl must be http(s): {base_url}")
    sitemaps = site.get("sitemaps", [])
    if not isinstance(sitemaps, list):
        raise ReleaseError("site.json sitemaps must be an array of URLs")
    for entry in sitemaps:
        if not isinstance(entry, str) or not entry.startswith(("http://", "https://")):
            raise ReleaseError(f"site.json sitemaps entry must be an http(s) URL: {entry}")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ReleaseError(f"Missing required JSON file: {path.relative_to(ROOT)}")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ReleaseError(f"JSON root must be an object: {path.relative_to(ROOT)}")
    return data


def validate_photos_manifest(manifest: dict[str, Any]) -> None:
    photos = manifest.get("photos")
    if not isinstance(photos, list):
        raise ReleaseError("photos.json must contain a photos array")
    ids: set[str] = set()
    for index, photo in enumerate(photos):
        if not isinstance(photo, dict):
            raise ReleaseError(f"photos[{index}] must be an object")
        photo_id = required_text(photo, "id", f"photos[{index}]")
        if photo_id in ids:
            raise ReleaseError(f"Duplicate photo id: {photo_id}")
        ids.add(photo_id)
        validate_capture_data(photo, f"photos[{index}]")
        src = required_text(photo, "src", f"photos[{index}]")
        if src.startswith("http://") or src.startswith("https://"):
            continue
        if not safe_local_path(src, f"photos[{index}]").exists():
            raise ReleaseError(f"Missing photo asset: {src}")
        medium = required_text(photo, "medium", f"photos[{index}]")
        if medium not in {"film", "digital"}:
            raise ReleaseError(f"Invalid medium for {photo_id}: {medium}")
        tone = required_text(photo, "tone", f"photos[{index}]")
        if tone not in {"bw", "color"}:
            raise ReleaseError(f"Invalid tone for {photo_id}: {tone}")


def validate_posts_index(index: dict[str, Any], series_ids: set[str]) -> None:
    posts = index.get("posts")
    if not isinstance(posts, list):
        raise ReleaseError("content/posts/index.json must contain a posts array")
    ids: set[str] = set()
    for position, post in enumerate(posts):
        if not isinstance(post, dict):
            raise ReleaseError(f"posts[{position}] must be an object")
        post_id = required_text(post, "id", f"posts[{position}]")
        if post_id in ids:
            raise ReleaseError(f"Duplicate post id: {post_id}")
        ids.add(post_id)
        status = required_text(post, "status", f"posts[{position}]")
        if status not in {"draft", "published"}:
            raise ReleaseError(f"Invalid status for {post_id}: {status}")
        required_text(post, "title", f"posts[{position}]")
        required_text(post, "path", f"posts[{position}]")
        series = post.get("series")
        if series is not None:
            if not isinstance(series, str):
                raise ReleaseError(f"posts[{position}] series must be a string")
            if len(series) > 0 and series not in series_ids:
                raise ReleaseError(f"Unknown series for {post_id}: {series} (add it to series.json)")


def validate_post_files(index: dict[str, Any]) -> None:
    for post in index["posts"]:
        if post["status"] != "published":
            continue
        if not post["path"].startswith("content/posts/"):
            raise ReleaseError(f"Post path must live under content/posts/: {post['path']}")
        path = safe_local_path(post["path"], f"post {post['id']}")
        data = read_json(path)
        if data.get("id") != post["id"]:
            raise ReleaseError(f"Post id mismatch: {post['path']}")
        blocks = data.get("blocks")
        if not isinstance(blocks, list) or len(blocks) == 0:
            raise ReleaseError(f"Published post needs blocks: {post['path']}")
        validate_soundtrack(data.get("soundtrack"), post["path"])
        for block_index, block in enumerate(blocks):
            validate_block(block, f"{post['path']} blocks[{block_index}]")


# The address is checked here so a bad paste is caught before it is published
# rather than showing a reader an empty frame.
def validate_soundtrack(value: Any, location: str) -> None:
    if value is None:
        return
    if not isinstance(value, dict):
        raise ReleaseError(f"{location} soundtrack must be an object")
    url = required_text(value, "url", f"{location} soundtrack")
    if youtube_id(url) == "":
        raise ReleaseError(f"{location} soundtrack url is not a YouTube address: {url}")
    label = value.get("label")
    if label is not None and not isinstance(label, str):
        raise ReleaseError(f"{location} soundtrack label must be a string")


def youtube_id(value: str) -> str:
    hosts = {"youtu.be", "youtube.com", "m.youtube.com", "youtube-nocookie.com"}
    parsed = urlparse(value)
    host = parsed.netloc.lower().removeprefix("www.")
    if host not in hosts:
        return ""
    if host == "youtu.be":
        candidate = parsed.path.lstrip("/")
    elif parsed.path == "/watch":
        candidate = parse_qs(parsed.query).get("v", [""])[0]
    elif parsed.path.startswith(("/embed/", "/shorts/", "/live/")):
        candidate = parsed.path.split("/")[2] if len(parsed.path.split("/")) > 2 else ""
    else:
        candidate = ""
    return candidate if re.fullmatch(r"[\w-]{11}", candidate) else ""


def validate_block(block: Any, location: str) -> None:
    if not isinstance(block, dict):
        raise ReleaseError(f"{location} must be an object")
    block_type = required_text(block, "type", location)
    if block_type in {"heading", "paragraph", "quote"}:
        required_text(block, "text", location)
    elif block_type == "photo":
        validate_photo_object(block.get("photo"), location)
        comment = block.get("comment")
        if comment is not None and not isinstance(comment, str):
            raise ReleaseError(f"{location} photo comment must be a string")
    elif block_type == "gallery":
        photos = block.get("photos")
        if not isinstance(photos, list) or len(photos) == 0:
            raise ReleaseError(f"{location} gallery needs photos")
        for photo in photos:
            validate_photo_object(photo, location)
    elif block_type == "link-list":
        links = block.get("links")
        if not isinstance(links, list):
            raise ReleaseError(f"{location} link-list needs links")
        for link in links:
            if not isinstance(link, dict):
                raise ReleaseError(f"{location} link must be an object")
            required_text(link, "label", location)
            url = required_text(link, "url", location)
            if not (url.startswith("https://") or url.startswith("http://")):
                raise ReleaseError(f"{location} link URL must be http(s): {url}")
    else:
        raise ReleaseError(f"Unsupported block type at {location}: {block_type}")


def validate_photo_object(value: Any, location: str) -> None:
    if not isinstance(value, dict):
        raise ReleaseError(f"{location} photo must be an object")
    src = required_text(value, "src", location)
    required_text(value, "alt", location)
    validate_capture_data(value, location)
    if not src.startswith(("http://", "https://")) and not safe_local_path(src, location).exists():
        raise ReleaseError(f"Missing post photo asset: {src}")


# A frame may say when it was made and what made it. Both are optional; what is
# written down has to be written down in a shape the pages can read back.
def validate_capture_data(photo: dict[str, Any], location: str) -> None:
    date = photo.get("date")
    if date is not None:
        if not isinstance(date, str) or re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", date) is None:
            raise ReleaseError(f"{location} date must be YYYY, YYYY-MM or YYYY-MM-DD: {date}")
    time = photo.get("time")
    if time is not None:
        if not isinstance(time, str) or re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time) is None:
            raise ReleaseError(f"{location} time must be HH:MM on a 24-hour clock: {time}")
    light = photo.get("light")
    if light is not None and light not in LIGHTS:
        raise ReleaseError(f"{location} light must be one of {', '.join(LIGHTS)}: {light}")
    fmt = photo.get("format")
    if fmt is not None and not isinstance(fmt, str):
        raise ReleaseError(f"{location} format must be a string")
    subjects = photo.get("subjects")
    if subjects is not None:
        if not isinstance(subjects, list):
            raise ReleaseError(f"{location} subjects must be an array of strings")
        for subject in subjects:
            if not isinstance(subject, str) or not subject.strip():
                raise ReleaseError(f"{location} every subject must be a non-empty string")
    exif = photo.get("exif")
    if exif is None:
        return
    if not isinstance(exif, dict):
        raise ReleaseError(f"{location} exif must be an object")
    for key, value in exif.items():
        if key not in EXIF_FIELDS:
            raise ReleaseError(f"{location} unknown exif field: {key} (use {', '.join(EXIF_FIELDS)})")
        if not isinstance(value, str):
            raise ReleaseError(f"{location} exif {key} must be a string")


def required_text(data: dict[str, Any], key: str, location: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or len(value.strip()) == 0:
        raise ReleaseError(f"{location} requires non-empty {key}")
    return value.strip()


def safe_local_path(value: str, location: str) -> Path:
    candidate = (ROOT / value).resolve()
    if not candidate.is_relative_to(ROOT):
        raise ReleaseError(f"{location} path escapes the repository: {value}")
    return candidate


def build_release() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for relative in PUBLIC_FILES:
        source = ROOT / relative
        if not source.exists():
            raise ReleaseError(f"Missing release file: {relative}")
        target = OUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for relative in PUBLIC_DIRS:
        source = ROOT / relative
        target = OUT / relative
        if source.exists():
            ignore = shutil.ignore_patterns("*.merge.json", "example-post.json")
            shutil.copytree(source, target, ignore=ignore)

# A post used to live behind "#post=<id>", which a search engine reads as one
# address for the whole site. Posts and series are written as pages of their
# own so each can be found, linked and shared on its own.

def write_post_pages(site: dict[str, Any], posts_index: dict[str, Any], cards: dict[str, str]) -> None:
    posts = published_posts(posts_index)
    titles = series_titles()
    for position, summary in enumerate(posts):
        post = read_json(ROOT / summary["path"])
        newer = posts[position - 1] if position > 0 else None
        older = posts[position + 1] if position + 1 < len(posts) else None
        write_page(OUT / "posts" / summary["id"], post_page(site, summary, post, titles, newer, older, posts, cards))
    if posts:
        print(f"posts: {len(posts)} page(s)")


def write_series_pages(site: dict[str, Any], posts_index: dict[str, Any]) -> None:
    posts = published_posts(posts_index)
    count = 0
    for entry in read_json(ROOT / "series.json").get("series", []):
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            continue
        members = [post for post in posts if post.get("series") == entry["id"]]
        if not members:
            continue
        write_page(OUT / "series" / entry["id"], series_page(site, entry, members))
        count += 1
    if count:
        print(f"series: {count} page(s)")


def write_archive_pages(site: dict[str, Any], posts_index: dict[str, Any]) -> None:
    posts = published_posts(posts_index)
    years: dict[str, list[dict[str, Any]]] = {}
    for post in posts:
        year = str(post.get("date", ""))[:4]
        if re.fullmatch(r"\d{4}", year):
            years.setdefault(year, []).append(post)
    for year, members in years.items():
        write_page(OUT / "archive" / year, archive_page(site, year, members))
    if years:
        print(f"archive: {len(years)} year(s)")


# A travelling archive is read by where it was made as much as by when. The
# index on the front page narrows the gallery in place; these pages give each
# city an address of its own to send, and something for a crawler to find.
def write_place_pages(site: dict[str, Any]) -> dict[str, str]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for photo in read_json(ROOT / "photos.json").get("photos", []):
        if not isinstance(photo, dict):
            continue
        place = str(photo.get("place", "")).strip()
        if place and photo.get("src"):
            groups.setdefault(place, []).append(photo)

    places: dict[str, str] = {}
    for place in sorted(groups):
        key = place_slug(place)
        if key in places:
            raise ReleaseError(f"Two places share one address ({key}): {places[key]} and {place}")
        places[key] = place
        write_page(OUT / "places" / key, place_page(site, place, groups[place]))
    if places:
        print(f"places: {len(places)} page(s)")
    return places


def place_slug(value: str) -> str:
    key = re.sub(r"[\W_]+", "-", value.lower()).strip("-")
    if not key:
        raise ReleaseError(f"Place name gives no address: {value}")
    return key


def place_page(site, place, members) -> str:
    base_url = site["baseUrl"].rstrip("/")
    url = f"{base_url}/places/{quote(place_slug(place))}/" if base_url else ""
    cover = next((str(photo["src"]) for photo in members if photo.get("src")), "")
    main = [
        '<div class="place-page">',
        '  <a class="back-link" href="/#gallery" data-i18n="places.back">Back to the gallery</a>',
        f"  <h1>{escape(place)}</h1>",
        '  <div class="photo-grid" role="list">',
    ]
    for photo in members:
        main += [f"    {line}" for line in figure_html(photo, "")]
    main += ["  </div>", "</div>"]
    return page(site, title=place, description=place, url=url,
                image=f"{base_url}/{cover}" if cover and base_url else "",
                kind="website", head_extra=[], main=main)


def archive_page(site, year, members) -> str:
    base_url = site["baseUrl"].rstrip("/")
    url = f"{base_url}/archive/{year}/" if base_url else ""
    titles = series_titles()
    main = [
        '<article class="post-article">',
        '  <a class="back-link" href="/#archive" data-i18n="archive.back">Back to archive</a>',
        f"  <h1>{escape(year)}</h1>",
        '  <div class="posts-list" role="list">',
    ]
    for position, post in enumerate(members, start=1):
        parts = [post.get("date", ""), titles.get(post.get("series", ""), "")]
        parts += [str(tag) for tag in post.get("tags", []) if tag]
        main += [
            '    <article class="post-card" role="listitem">',
            f'      <span class="post-number" aria-hidden="true">{position:02d}</span>',
            f'      <p class="post-meta">{escape(" · ".join(part for part in parts if part))}</p>',
            f'      <h3><a class="post-link" href="/posts/{quote(post["id"])}/">{escape(post["title"])}</a></h3>',
            f'      <p class="post-excerpt">{escape(post.get("excerpt", ""))}</p>',
            "    </article>",
        ]
    main += ["  </div>", "</article>"]
    return page(site, title=year, description=f"{year}", url=url, image="",
                kind="website", head_extra=[], main=main)


# Searching a static site means shipping what there is to search. One small
# file holds every published post with its body flattened to plain text, and
# every photograph with the words written about it.

SEARCH_BODY_LIMIT = 2000


def write_search_index(posts_index: dict[str, Any]) -> None:
    titles = series_titles()
    entries = []
    for summary in published_posts(posts_index):
        post = read_json(ROOT / summary["path"])
        entries.append({
            "id": summary["id"],
            "title": summary["title"],
            "date": summary.get("date", ""),
            "excerpt": summary.get("excerpt", ""),
            "tags": [str(tag) for tag in summary.get("tags", [])],
            "series": titles.get(summary.get("series", ""), ""),
            "text": body_text(post)[:SEARCH_BODY_LIMIT],
        })

    photos = []
    for photo in read_json(ROOT / "photos.json").get("photos", []):
        if not isinstance(photo, dict) or not photo.get("src"):
            continue
        exif = photo.get("exif") if isinstance(photo.get("exif"), dict) else {}
        subjects = photo.get("subjects") if isinstance(photo.get("subjects"), list) else []
        photos.append({
            "id": str(photo.get("id", "")),
            "words": " ".join(
                [str(photo.get(field, "")) for field in ("title", "alt", "place", "year", "date", "format", "details")]
                + [str(subject) for subject in subjects]
                + [str(exif.get(field, "")) for field in EXIF_FIELDS]
            ).strip(),
        })

    (OUT / "search.json").write_text(
        json.dumps({"version": 1, "posts": entries, "photos": photos}, ensure_ascii=False),
        encoding="utf-8",
    )
    if entries or photos:
        print(f"search: {len(entries)} post(s), {len(photos)} photo(s)")


def body_text(post: dict[str, Any]) -> str:
    words: list[str] = []
    for block in post.get("blocks", []):
        if not isinstance(block, dict):
            continue
        if block.get("text"):
            words.append(str(block["text"]))
        if block.get("comment"):
            words.append(str(block["comment"]))
        photo = block.get("photo")
        if isinstance(photo, dict):
            words.append(str(photo.get("alt", "")))
        for entry in block.get("photos", []) or []:
            if isinstance(entry, dict):
                words.append(str(entry.get("alt", "")))
        for link in block.get("links", []) or []:
            if isinstance(link, dict):
                words.append(str(link.get("label", "")))
    return " ".join(word for word in words if word)


def write_page(directory: Path, html: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "index.html").write_text(html, encoding="utf-8")


def series_titles() -> dict[str, str]:
    titles: dict[str, str] = {}
    for entry in read_json(ROOT / "series.json").get("series", []):
        if isinstance(entry, dict) and isinstance(entry.get("id"), str):
            titles[entry["id"]] = str(entry.get("title", ""))
    return titles


def author_of(site: dict[str, Any]) -> str:
    return str(site.get("author") or site["title"])


def page(site: dict[str, Any], *, title: str, description: str, url: str,
         image: str, kind: str, head_extra: list[str], main: list[str],
         image_size: tuple[int, int] | None = None) -> str:
    head = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        # frame-src is here only so a reader who presses play on a post's sound
        # track gets it. Nothing loads from that host until they do.
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; "
        "style-src 'self'; img-src 'self' data: https:; connect-src 'self'; "
        "frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'none'\">",
        '<meta name="referrer" content="strict-origin-when-cross-origin">',
        '<meta name="color-scheme" content="light">',
        f"<title>{escape(title)} — {escape(site['title'])}</title>",
        f"<meta name=\"description\" content={quoteattr(description)}>",
        f"<meta property=\"og:title\" content={quoteattr(title)}>",
        f"<meta property=\"og:description\" content={quoteattr(description)}>",
        f'<meta property="og:type" content="{kind}">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    if url:
        head += [f'<link rel="canonical" href="{escape(url)}">', f'<meta property="og:url" content="{escape(url)}">']
    if image:
        head.append(f'<meta property="og:image" content="{escape(image)}">')
    if image_size is not None:
        head.append(f'<meta property="og:image:width" content="{image_size[0]}">')
        head.append(f'<meta property="og:image:height" content="{image_size[1]}">')
    head += head_extra
    head += [
        '<link rel="stylesheet" href="/styles.css">',
        '<script type="module" src="/post-page.js" defer></script>',
    ]

    body = [
        '<a class="skip-link" href="#main" data-i18n="skip">Skip to content</a>',
        '<div class="lang-bar"><nav class="lang-switch" aria-label="Language" data-i18n-attrs="aria-label:lang.aria">',
        '  <button type="button" data-lang="ko" lang="ko" aria-pressed="false">한국어</button>',
        '  <button type="button" data-lang="en" lang="en" aria-pressed="false">English</button>',
        '  <button type="button" data-lang="ja" lang="ja" aria-pressed="false">日本語</button>',
        '  <button type="button" data-lang="zh" lang="zh-Hans" aria-pressed="false">中文</button>',
        "</nav></div>",
        '<header class="site-header">',
        f'  <a class="wordmark" href="/">{escape(author_of(site))}</a>',
        '  <nav class="top-nav" aria-label="Primary navigation" data-i18n-attrs="aria-label:nav.aria">',
        '    <a href="/#posts" data-i18n="nav.posts">Posts</a>',
        '    <a href="/#series" data-i18n="nav.series">Series</a>',
        '    <a href="/#gallery" data-i18n="nav.gallery">Gallery</a>',
        '    <a href="/#archive" data-i18n="nav.archive">Archive</a>',
        '    <a href="/#about" data-i18n="nav.about">About</a>',
        "  </nav>",
        '  <div id="search-slot">',
        '    <form class="search" role="search">',
        '      <input type="search" class="search-input" autocomplete="off" data-i18n-attrs="placeholder:search.label;aria-label:search.label">',
        "    </form>",
        "  </div>",
        "</header>",
        '<main id="main">',
        '  <section class="post-detail">',
    ]
    body += [f"  {line}" for line in main]
    body += [
        "  </section>",
        "</main>",
        '<footer class="site-footer">',
        f'  <p>© {datetime.now(timezone.utc).year} {escape(author_of(site))}</p>',
        f"  <a href=\"mailto:{escape(site['email'])}\" data-i18n=\"footer.contact\">Contact</a>",
        "</footer>",
        '<dialog id="lightbox" class="lightbox" aria-label="Image viewer" data-i18n-attrs="aria-label:lb.aria">',
        '  <div class="lightbox-bar">',
        '    <p id="lightbox-counter" class="lightbox-counter"></p>',
        '    <button type="button" id="lightbox-mono" class="lightbox-button">In black and white</button>',
        '    <button type="button" id="lightbox-close" class="lightbox-button" data-i18n="lb.close">Close</button>',
        "  </div>",
        '  <figure class="lightbox-stage">',
        '    <img id="lightbox-image" alt="">',
        "    <figcaption>",
        '      <p id="lightbox-caption" class="caption-main"></p>',
        '      <p id="lightbox-meta" class="caption-meta"></p>',
        '      <div id="lightbox-notes"></div>',
        "    </figcaption>",
        "  </figure>",
        '  <div class="lightbox-nav">',
        '    <button type="button" id="lightbox-prev" class="lightbox-button" data-i18n="lb.prev">Previous</button>',
        '    <button type="button" id="lightbox-next" class="lightbox-button" data-i18n="lb.next">Next</button>',
        "  </div>",
        "</dialog>",
    ]
    return (
        '<!doctype html>\n<html lang="ko">\n<head>\n'
        + "\n".join(head)
        + "\n</head>\n<body>\n"
        + "\n".join(body)
        + "\n</body>\n</html>\n"
    )


def post_page(site, summary, post, titles, newer, older, siblings, cards) -> str:
    base_url = site["baseUrl"].rstrip("/")
    url = post_url(base_url, summary["id"]) if base_url else ""
    series_name = titles.get(summary.get("series", ""), "")
    card = cards.get(summary["id"], "")
    cover = card or first_photo(post)
    image = f"{base_url}/{quote(cover)}" if cover and base_url else ""
    date = summary.get("date", "")

    head_extra = []
    if date:
        head_extra.append(f'<meta property="article:published_time" content="{escape(date)}">')
    head_extra += ['<script type="application/ld+json">', article_ld(site, summary, url, image, series_name), "</script>"]

    meta = []
    if date:
        meta.append(f"<span>{escape(date)}</span>")
    if series_name:
        meta.append(
            f'<a class="post-series" href="/series/{quote(summary["series"])}/">{escape(series_name)}</a>'
        )
    for tag in summary.get("tags", []):
        meta.append(f'<a class="tag" href="/#tag={quote(str(tag))}">{escape(str(tag))}</a>')
    meta_line = ' <span class="meta-dot">·</span> '.join(meta)

    main = [
        '<article class="post-article">',
        '  <a class="back-link" href="/#posts" data-i18n="post.back">Back to posts</a>',
        f'  <p class="post-meta">{meta_line}</p>',
        f"  <h1>{escape(summary['title'])}</h1>",
        f'  <p class="post-lead">{escape(summary.get("excerpt", ""))}</p>',
    ]
    main += [f"  {line}" for line in sound_slot_html(post)]
    main += [f"  {line}" for line in blocks_html(post.get("blocks", []))]
    main.append("</article>")
    main += post_tools_html(summary, date, url)
    main += related_html(summary, siblings, titles)
    main += post_nav_html(older, newer)
    return page(site, title=summary["title"], description=summary.get("excerpt", ""), url=url,
                image=image, image_size=CARD_SIZE if card else None,
                kind="article", head_extra=head_extra, main=main)


# One quiet row under the post: how to read it, how to fold it into paper, and
# how to send it. Every control is filled in by script, so a page read without
# any leaves an empty row rather than a broken one.
def post_tools_html(summary: dict[str, Any], date: str, url: str) -> list[str]:
    return [
        '<div class="post-tools">',
        '  <div class="story-slot"></div>',
        *[f"  {line}" for line in zine_slot_html("post", summary["id"], summary["title"], extra={
            "zine-lead": summary.get("excerpt", ""),
            "zine-date": date,
            "zine-path": summary["path"],
        })],
        f'  <div class="share-slot" data-share-url={quoteattr(url)} data-share-title={quoteattr(summary["title"])}></div>',
        "</div>",
    ]


def sound_slot_html(post: dict[str, Any]) -> list[str]:
    soundtrack = post.get("soundtrack")
    if not isinstance(soundtrack, dict) or not isinstance(soundtrack.get("url"), str):
        return []
    label = str(soundtrack.get("label", ""))
    return [
        f'<div class="sound-slot" data-sound-url={quoteattr(soundtrack["url"])}'
        f" data-sound-label={quoteattr(label)}></div>"
    ]


# The end of a post is where a reader decides whether to stay. Posts from the
# same series come first, then ones that share a tag.
def related_html(summary, siblings, titles) -> list[str]:
    tags = {str(tag) for tag in summary.get("tags", [])}
    scored = []
    for other in siblings:
        if other["id"] == summary["id"]:
            continue
        shared = len(tags & {str(tag) for tag in other.get("tags", [])})
        same_series = 1 if summary.get("series") and other.get("series") == summary["series"] else 0
        if same_series or shared:
            scored.append((same_series, shared, other))
    if not scored:
        return []
    scored.sort(key=lambda row: (row[0], row[1], row[2].get("date", "")), reverse=True)

    lines = [
        '<section class="related">',
        '  <h2 data-i18n="post.related">Related posts</h2>',
        '  <div class="posts-list" role="list">',
    ]
    for position, (_, _, other) in enumerate(scored[:4], start=1):
        parts = [other.get("date", ""), titles.get(other.get("series", ""), "")]
        lines += [
            '    <article class="post-card" role="listitem">',
            f'      <span class="post-number" aria-hidden="true">{position:02d}</span>',
            f'      <p class="post-meta">{escape(" · ".join(part for part in parts if part))}</p>',
            f'      <h3><a class="post-link" href="/posts/{quote(other["id"])}/">{escape(other["title"])}</a></h3>',
            "    </article>",
        ]
    lines += ["  </div>", "</section>"]
    return lines


def series_page(site, entry, members) -> str:
    base_url = site["baseUrl"].rstrip("/")
    url = f"{base_url}/series/{quote(entry['id'])}/" if base_url else ""
    description = str(entry.get("description") or entry.get("title", ""))
    main = [
        '<article class="post-article">',
        '  <a class="back-link" href="/#series" data-i18n="series.back">Back to series</a>',
        f"  <h1>{escape(str(entry.get('title', '')))}</h1>",
    ]
    if entry.get("description"):
        main.append(f'  <p class="post-lead">{escape(str(entry["description"]))}</p>')
    main.append('  <div class="posts-list" role="list">')
    for position, post in enumerate(members, start=1):
        tags = " · ".join(str(tag) for tag in post.get("tags", []) if tag)
        meta_line = " · ".join(part for part in [post.get("date", ""), tags] if part)
        main += [
            '    <article class="post-card" role="listitem">',
            f'      <span class="post-number" aria-hidden="true">{position:02d}</span>',
            f'      <p class="post-meta">{escape(meta_line)}</p>',
            f'      <h3><a class="post-link" href="/posts/{quote(post["id"])}/">{escape(post["title"])}</a></h3>',
            f'      <p class="post-excerpt">{escape(post.get("excerpt", ""))}</p>',
            "    </article>",
        ]
    main.append("  </div>")
    main.append("</article>")
    main += [
        '<div class="post-tools">',
        *[f"  {line}" for line in zine_slot_html("series", str(entry["id"]), str(entry.get("title", "")))],
        f'  <div class="share-slot" data-share-url={quoteattr(url)} data-share-title={quoteattr(str(entry.get("title", "")))}></div>',
        "</div>",
    ]
    return page(site, title=str(entry.get("title", "")), description=description, url=url,
                image="", kind="website", head_extra=[], main=main)


# The button is written here; zine.js finds the slot and fills it in, so a page
# read without script simply has nothing where the button would be.
def zine_slot_html(kind: str, zine_id: str, title: str, extra: dict[str, str] | None = None) -> list[str]:
    attributes = {"zine": kind, "zine-id": zine_id, "zine-title": title, **(extra or {})}
    written = " ".join(f"data-{name}={quoteattr(str(value))}" for name, value in attributes.items() if value)
    return [f'<div class="zine-slot" {written}></div>']


def article_ld(site, summary, url, image, series_name) -> str:
    data: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": summary["title"],
        "description": summary.get("excerpt", ""),
        "inLanguage": "ko",
        "author": {"@type": "Person", "name": author_of(site)},
    }
    if summary.get("date"):
        data["datePublished"] = summary["date"]
        data["dateModified"] = summary["date"]
    if url:
        data["mainEntityOfPage"] = url
        data["url"] = url
    if image:
        data["image"] = [image]
    if series_name:
        data["isPartOf"] = {"@type": "CreativeWorkSeries", "name": series_name}
    if summary.get("tags"):
        data["keywords"] = ", ".join(str(tag) for tag in summary["tags"])
    return json.dumps(data, ensure_ascii=False, indent=2)


def first_photo(post: dict[str, Any]) -> str:
    for block in post.get("blocks", []):
        if not isinstance(block, dict):
            continue
        if block.get("type") == "photo" and isinstance(block.get("photo"), dict):
            return str(block["photo"].get("src", ""))
        if block.get("type") == "gallery":
            for photo in block.get("photos", []):
                if isinstance(photo, dict) and photo.get("src"):
                    return str(photo["src"])
    return ""


def blocks_html(blocks: list[Any]) -> list[str]:
    lines: list[str] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        kind = block.get("type")
        if kind == "heading":
            lines.append(f'<h2 class="post-heading">{escape(str(block.get("text", "")))}</h2>')
        elif kind == "paragraph":
            lines.append(f'<p class="post-body-copy">{escape(str(block.get("text", "")))}</p>')
        elif kind == "quote":
            lines.append(f"<blockquote>{escape(str(block.get('text', '')))}</blockquote>")
        elif kind == "photo":
            lines += figure_html(block.get("photo"), str(block.get("comment", "")))
        elif kind == "gallery":
            lines.append('<div class="inline-gallery">')
            for photo in block.get("photos", []):
                lines += [f"  {line}" for line in figure_html(photo, "")]
            lines.append("</div>")
        elif kind == "link-list":
            lines.append('<section class="link-list">')
            heading = str(block.get("title", ""))
            if heading:
                lines.append(f"  <h2>{escape(heading)}</h2>")
            lines.append("  <ul>")
            for link in block.get("links", []):
                if isinstance(link, dict) and str(link.get("url", "")).startswith(("http://", "https://")):
                    lines.append(
                        f"    <li><a href={quoteattr(str(link['url']))} rel=\"noopener noreferrer\">"
                        f"{escape(str(link.get('label', link['url'])))}</a></li>"
                    )
            lines += ["  </ul>", "</section>"]
    return lines


def figure_html(photo: Any, comment: str) -> list[str]:
    if not isinstance(photo, dict):
        return []
    src = str(photo.get("src", ""))
    alt = str(photo.get("alt", ""))
    width = photo.get("width") or 3
    height = photo.get("height") or 2
    caption = " · ".join(
        part for part in [str(photo.get("title", "")), str(photo.get("place", "")), str(photo.get("year", ""))] if part
    )
    details = str(photo.get("details", ""))
    lines = [
        f'<figure class="photo-card" data-photo-id="{escape(str(photo.get("id", "")))}"'
        f' data-medium="{escape(str(photo.get("medium", "digital")))}"'
        f' data-tone="{escape(str(photo.get("tone", "color")))}">',
        f'  <button type="button" class="photo-frame" style="--ratio: {width} / {height}">',
        f'    <img src="/{escape(src)}" alt={quoteattr(alt)} loading="lazy" decoding="async">',
        "  </button>",
        "  <figcaption>",
        f'    <p class="caption-main">{escape(caption)}</p>',
        f'    <p class="caption-meta">{escape(details)}</p>',
    ]
    lines += [f"    {line}" for line in notes_html(photo)]
    if comment:
        lines.append(f'    <p class="photo-comment">{escape(comment)}</p>')
    lines += ["  </figcaption>", "</figure>"]
    return lines


def notes_html(photo: dict[str, Any]) -> list[str]:
    exif = photo.get("exif") if isinstance(photo.get("exif"), dict) else {}
    rows: list[str] = []
    for field in EXIF_FIELDS:
        value = exif.get(field)
        if isinstance(value, str) and value.strip():
            rows.append(f'  <dt data-i18n="notes.{field}">{EXIF_LABELS[field]}</dt>')
            rows.append(f"  <dd>{escape(value.strip())}</dd>")
    time = str(photo.get("time", "")).strip()
    if time:
        rows.append('  <dt data-i18n="notes.time">Hour</dt>')
        rows.append(f"  <dd>{escape(time)}</dd>")
    light = str(photo.get("light", "")).strip() or light_of(time, season_of(str(photo.get("date", ""))))
    if light in LIGHTS:
        rows.append('  <dt data-i18n="notes.light">Light</dt>')
        rows.append(f'  <dd data-i18n="light.{light}">{LIGHT_LABELS[light]}</dd>')
    return ['<dl class="darkroom-notes">'] + rows + ["</dl>"] if rows else []


def post_nav_html(older: Any, newer: Any) -> list[str]:
    if older is None and newer is None:
        return []
    lines = ['<nav class="post-nav">']
    for summary, css, key, label in [
        (older, "is-prev", "post.prev", "Older"),
        (newer, "is-next", "post.next", "Newer"),
    ]:
        lines.append(f'  <div class="post-nav-slot {css}">')
        if isinstance(summary, dict):
            lines += [
                f'    <p class="post-nav-label" data-i18n="{key}">{label}</p>',
                f'    <a href="/posts/{quote(summary["id"])}/">{escape(summary["title"])}</a>',
            ]
        lines.append("  </div>")
    lines.append("</nav>")
    return lines


def write_discovery_files(site: dict[str, Any], posts_index: dict[str, Any],
                          places: dict[str, str], cards: dict[str, str]) -> None:
    base_url = site["baseUrl"].rstrip("/")
    robots = ["User-agent: *", "Allow: /", "Disallow: /admin/"]
    if base_url:
        robots.append(f"Sitemap: {base_url}/sitemap.xml")
        (OUT / "sitemap.xml").write_text(sitemap_xml(base_url, posts_index, places), encoding="utf-8")
        (OUT / "feed.xml").write_text(feed_xml(site, base_url, posts_index), encoding="utf-8")
        (OUT / "rss.xml").write_text(rss_xml(site, base_url, posts_index), encoding="utf-8")
    else:
        print("feed-skip: set baseUrl in site.json to generate feed.xml and sitemap.xml")
    for extra in site.get("sitemaps", []):
        robots.append(f"Sitemap: {extra}")
    (OUT / "robots.txt").write_text("\n".join(robots) + "\n", encoding="utf-8")
    write_home_card(site, cards)
    well_known = OUT / ".well-known"
    well_known.mkdir(exist_ok=True)
    expires = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ")
    security = [f"Contact: mailto:{site['email']}", f"Expires: {expires}", "Preferred-Languages: ko, en"]
    (well_known / "security.txt").write_text("\n".join(security) + "\n", encoding="utf-8")


# index.html is written by hand and copied as it is, so the picture a share
# preview needs is put in here, where the photograph list is known.
def write_home_card(site: dict[str, Any], cards: dict[str, str]) -> None:
    base_url = site["baseUrl"].rstrip("/")
    photos = read_json(ROOT / "photos.json").get("photos", [])
    first = cards.get("index") or next(
        (photo["src"] for photo in photos if isinstance(photo, dict) and photo.get("src")), "")
    if not base_url or not first:
        return
    target = OUT / "index.html"
    html = target.read_text(encoding="utf-8")
    if "og:image" in html:
        return
    lines = [f'    <meta property="og:image" content="{escape(base_url)}/{escape(quote(first))}">']
    if "index" in cards:
        lines.append(f'    <meta property="og:image:width" content="{CARD_SIZE[0]}">')
        lines.append(f'    <meta property="og:image:height" content="{CARD_SIZE[1]}">')
    lines.append('    <meta name="twitter:card" content="summary_large_image">')
    target.write_text(html.replace("  </head>", "\n".join(lines) + "\n  </head>", 1), encoding="utf-8")


def sitemap_xml(base_url: str, posts_index: dict[str, Any], places: dict[str, str]) -> str:
    posts = published_posts(posts_index)
    newest = next((post["date"] for post in posts if post.get("date")), "")
    entries = [(f"{base_url}/", newest)]
    entries += [(post_url(base_url, post["id"]), post.get("date", "")) for post in posts]

    titles = series_titles()
    for series_id in titles:
        members = [post for post in posts if post.get("series") == series_id]
        if members:
            entries.append((f"{base_url}/series/{quote(series_id)}/", members[0].get("date", "")))

    years: dict[str, str] = {}
    for post in posts:
        year = str(post.get("date", ""))[:4]
        if re.fullmatch(r"\d{4}", year) and year not in years:
            years[year] = post.get("date", "")
    entries += [(f"{base_url}/archive/{year}/", date) for year, date in years.items()]
    entries += [(f"{base_url}/places/{quote(key)}/", "") for key in places]

    body = ""
    for loc, date in entries:
        stamp = f"<lastmod>{escape(date)}</lastmod>" if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date or "") else ""
        body += f"  <url><loc>{escape(loc)}</loc>{stamp}</url>\n"
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}"
        "</urlset>\n"
    )


def published_posts(posts_index: dict[str, Any]) -> list[dict[str, Any]]:
    posts = [post for post in posts_index["posts"] if post["status"] == "published"]
    return sorted(posts, key=lambda post: post.get("date", ""), reverse=True)


def post_url(base_url: str, post_id: str) -> str:
    return f"{base_url}/posts/{quote(post_id)}/"


def feed_xml(site: dict[str, Any], base_url: str, posts_index: dict[str, Any]) -> str:
    published = published_posts(posts_index)
    dates = sorted(post.get("date", "") for post in published if isinstance(post.get("date"), str))
    updated = rfc3339(dates[-1] if dates and dates[-1] else "")
    title = escape(site["title"])
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        f"  <title>{title}</title>",
        f"  <link href={quoteattr(base_url + '/')}/>",
        f"  <link rel=\"self\" href={quoteattr(base_url + '/feed.xml')}/>",
        f"  <id>{escape(base_url)}/</id>",
        f"  <updated>{updated}</updated>",
        f"  <author><name>{title}</name></author>",
    ]
    for post in published:
        link = post_url(base_url, post["id"])
        lines += [
            "  <entry>",
            f"    <title>{escape(post['title'])}</title>",
            f"    <link href={quoteattr(link)}/>",
            f"    <id>{escape(link)}</id>",
            f"    <updated>{rfc3339(post.get('date', ''))}</updated>",
            f"    <summary>{escape(post.get('excerpt', ''))}</summary>",
            "  </entry>",
        ]
    lines.append("</feed>")
    return "\n".join(lines) + "\n"


def rss_xml(site: dict[str, Any], base_url: str, posts_index: dict[str, Any]) -> str:
    published = published_posts(posts_index)
    dates = sorted(post.get("date", "") for post in published if isinstance(post.get("date"), str))
    title = escape(site["title"])
    description = escape(site.get("description") or site["title"])
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        f"    <title>{title}</title>",
        f"    <link>{escape(base_url)}/</link>",
        f"    <description>{description}</description>",
        "    <language>ko</language>",
        f"    <lastBuildDate>{rfc822(dates[-1] if dates and dates[-1] else '')}</lastBuildDate>",
        f"    <atom:link href={quoteattr(base_url + '/rss.xml')} rel=\"self\" type=\"application/rss+xml\"/>",
    ]
    for post in published:
        link = post_url(base_url, post["id"])
        lines += [
            "    <item>",
            f"      <title>{escape(post['title'])}</title>",
            f"      <link>{escape(link)}</link>",
            f"      <guid isPermaLink=\"false\">{escape(link)}</guid>",
            f"      <pubDate>{rfc822(post.get('date', ''))}</pubDate>",
            f"      <description>{escape(post.get('excerpt', ''))}</description>",
            "    </item>",
        ]
    lines += ["  </channel>", "</rss>"]
    return "\n".join(lines) + "\n"


def rfc822(date: str) -> str:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date or ""):
        moment = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        moment = datetime.now(timezone.utc)
    return moment.strftime("%a, %d %b %Y %H:%M:%S +0000")


def rfc3339(date: str) -> str:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date or ""):
        return f"{date}T00:00:00Z"
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


if __name__ == "__main__":
    try:
        main()
    except ReleaseError as error:
        raise SystemExit(f"release-error: {error}") from error
