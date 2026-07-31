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
    "app.js",
    "i18n.js",
    "messages.js",
    "lightbox.js",
    "site-utils.js",
    "site-data.js",
    "site-render.js",
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
    write_discovery_files(site, posts_index)
    print(f"release-ok: {OUT}")


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
        for block_index, block in enumerate(blocks):
            validate_block(block, f"{post['path']} blocks[{block_index}]")


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
    if not src.startswith(("http://", "https://")) and not safe_local_path(src, location).exists():
        raise ReleaseError(f"Missing post photo asset: {src}")


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


def write_discovery_files(site: dict[str, Any], posts_index: dict[str, Any]) -> None:
    base_url = site["baseUrl"].rstrip("/")
    robots = ["User-agent: *", "Allow: /", "Disallow: /admin/"]
    if base_url:
        robots.append(f"Sitemap: {base_url}/sitemap.xml")
        (OUT / "sitemap.xml").write_text(sitemap_xml(base_url), encoding="utf-8")
        (OUT / "feed.xml").write_text(feed_xml(site, base_url, posts_index), encoding="utf-8")
        (OUT / "rss.xml").write_text(rss_xml(site, base_url, posts_index), encoding="utf-8")
    else:
        print("feed-skip: set baseUrl in site.json to generate feed.xml and sitemap.xml")
    for extra in site.get("sitemaps", []):
        robots.append(f"Sitemap: {extra}")
    (OUT / "robots.txt").write_text("\n".join(robots) + "\n", encoding="utf-8")
    well_known = OUT / ".well-known"
    well_known.mkdir(exist_ok=True)
    expires = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ")
    security = [f"Contact: mailto:{site['email']}", f"Expires: {expires}", "Preferred-Languages: ko, en"]
    (well_known / "security.txt").write_text("\n".join(security) + "\n", encoding="utf-8")


def sitemap_xml(base_url: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{escape(base_url)}/</loc></url>\n"
        "</urlset>\n"
    )


def feed_xml(site: dict[str, Any], base_url: str, posts_index: dict[str, Any]) -> str:
    published = [post for post in posts_index["posts"] if post["status"] == "published"]
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
        link = f"{base_url}/#post={post['id']}"
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
    published = [post for post in posts_index["posts"] if post["status"] == "published"]
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
        link = f"{base_url}/#post={post['id']}"
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
