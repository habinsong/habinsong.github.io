#!/usr/bin/env python3
"""Serve the site with a large in-memory content fixture for UI testing.

The repository files are never changed. JSON requests are intercepted and
served from generated records; every other asset is served from the checkout.
"""

from __future__ import annotations

import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
IMAGE_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'%3E%3Crect width='3' height='2' fill='%23d8d8d8'/%3E%3C/svg%3E"


def photo_record(index: int, post_id: str, series_index: int) -> dict[str, object]:
    year = str(2017 + (index % 10))
    medium = "film" if index % 3 == 0 else "digital"
    tone = "bw" if index % 5 == 0 else "color"
    return {
        "id": f"virtual-photo-{index:03d}",
        "title": f"Virtual frame {index:03d}",
        "medium": medium,
        "tone": tone,
        "src": IMAGE_SRC,
        "alt": f"Virtual archive frame {index:03d}",
        "place": f"Place {series_index + 1:02d}",
        "year": year,
        "details": "50mm",
        "width": 3 if index % 4 else 4,
        "height": 2 if index % 4 else 3,
        "date": f"{year}-06-{(index % 27) + 1:02d}",
        "time": "15:20",
        "subjects": ["landscape", f"subject-{index % 6}"],
        "exif": {
            "camera": "Virtual Camera",
            "lens": "Virtual Lens 50mm",
            "aperture": "f/2.8",
            "shutter": "1/500",
            "iso": "100",
        },
        "postId": post_id,
    }


def make_fixture(post_count: int, photo_count: int, series_count: int) -> dict[str, object]:
    series = [
        {"id": f"virtual-series-{index:02d}", "title": f"Virtual series {index + 1:02d}"}
        for index in range(series_count)
    ]
    posts: list[dict[str, object]] = []
    photos: list[dict[str, object]] = []
    for index in range(post_count):
        post_id = f"virtual-post-{index:03d}"
        series_index = index % series_count
        post_photos = [
            photo_record(photo_index, post_id, series_index)
            for photo_index in range(index * max(1, photo_count // post_count), (index + 1) * max(1, photo_count // post_count))
            if photo_index < photo_count
        ]
        if not post_photos:
            post_photos = [photo_record(index % photo_count, post_id, series_index)]
        photos.extend(post_photos)
        posts.append({
            "id": post_id,
            "title": f"Virtual post {index + 1:02d}",
            "date": f"{2017 + (index % 10)}-07-{(index % 27) + 1:02d}",
            "status": "published",
            "excerpt": f"A generated archive record {index + 1:02d} for layout testing.",
            "tags": [f"tag-{index % 5}", "virtual"],
            "path": f"content/posts/{post_id}.json",
            "series": series[index % series_count]["id"],
        })

    while len(photos) < photo_count:
        post = posts[len(photos) % len(posts)]
        photos.append(photo_record(len(photos), str(post["id"]), len(photos) % series_count))

    details = {}
    for post in posts:
        post_photos = [photo for photo in photos if photo["postId"] == post["id"]]
        cover = post_photos[0]
        details[post["id"]] = {
            "id": post["id"],
            "title": post["title"],
            "date": post["date"],
            "status": post["status"],
            "excerpt": post["excerpt"],
            "series": post["series"],
            "tags": post["tags"],
            "cover": cover,
            "blocks": [
                {"type": "photo", "photo": cover, "comment": "Generated fixture caption."},
                {"type": "paragraph", "text": "Generated content for responsive and pagination QA."},
            ],
        }
    return {
        "photos": {"version": 1, "photos": photos},
        "series": {"version": 1, "series": series},
        "posts": {"version": 1, "posts": posts},
        "details": details,
    }


class FixtureHandler(SimpleHTTPRequestHandler):
    fixture: dict[str, object]

    def do_GET(self) -> None:  # noqa: N802 - inherited HTTP method name
        path = unquote(urlsplit(self.path).path)
        payload: object | None = None
        if path == "/photos.json":
            payload = self.fixture["photos"]
        elif path == "/series.json":
            payload = self.fixture["series"]
        elif path == "/content/posts/index.json":
            payload = self.fixture["posts"]
        elif path.startswith("/content/posts/") and path.endswith(".json"):
            post_id = Path(path).stem
            payload = self.fixture["details"].get(post_id)
        if payload is not None:
            data = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def log_message(self, format: str, *args: object) -> None:
        if self.path.split("?", 1)[0] in {"/", "/photos.json", "/series.json", "/content/posts/index.json"}:
            super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--posts", type=int, default=30)
    parser.add_argument("--photos", type=int, default=72)
    parser.add_argument("--series", type=int, default=12)
    args = parser.parse_args()
    if min(args.posts, args.photos, args.series) < 1:
        parser.error("posts, photos, and series must be positive")
    fixture = make_fixture(args.posts, args.photos, args.series)
    handler = partial(FixtureHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    FixtureHandler.fixture = fixture
    print(f"virtual-content-server: http://127.0.0.1:{args.port}/")
    print(f"virtual-content: posts={args.posts} photos={args.photos} series={args.series}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
