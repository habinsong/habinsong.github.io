#!/usr/bin/env python3
"""글 관리: 목록을 보고, 내리고, 다시 올리고, 지운다.

    python3 scripts/posts.py                올라간 글 목록
    python3 scripts/posts.py hide <id>      사이트에서 내린다 (파일은 남는다)
    python3 scripts/posts.py show <id>      다시 올린다
    python3 scripts/posts.py delete <id>    글과 그 사진을 지운다

바꾼 뒤에는 `python3 scripts/publish.py` 로 반영한다.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "content/posts/index.json"


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "list"
    if command == "list":
        show_list()
        return
    if len(sys.argv) < 3:
        stop(f"글 id가 필요합니다: python3 scripts/posts.py {command} <id>")
    post_id = sys.argv[2]
    if command == "hide":
        set_status(post_id, "draft")
    elif command == "show":
        set_status(post_id, "published")
    elif command == "delete":
        delete(post_id)
    else:
        stop(f"모르는 명령입니다: {command}")


def show_list() -> None:
    posts = read(INDEX)["posts"]
    if not posts:
        print("글이 없습니다.")
        return
    posts.sort(key=lambda post: post.get("date", ""), reverse=True)
    width = max(len(post["id"]) for post in posts)
    for post in posts:
        mark = "게시" if post.get("status") == "published" else "초안"
        print(f"{mark}  {post.get('date', ''):<10}  {post['id']:<{width}}  {post.get('title', '')}")
    print(f"\n총 {len(posts)}편 · 게시 {sum(1 for p in posts if p.get('status') == 'published')}편")


def set_status(post_id: str, status: str) -> None:
    index = read(INDEX)
    post = find(index["posts"], post_id)
    if post.get("status") == status:
        print(f"이미 {'게시' if status == 'published' else '초안'} 상태입니다: {post_id}")
        return
    post["status"] = status
    write(INDEX, index)
    word = "올렸습니다" if status == "published" else "내렸습니다"
    print(f"{word}: {post.get('title', post_id)}")
    print("python3 scripts/publish.py 로 반영하세요.")


def delete(post_id: str) -> None:
    index = read(INDEX)
    post = find(index["posts"], post_id)
    photo_dir = ROOT / "photos" / post_id
    post_file = ROOT / post.get("path", f"content/posts/{post_id}.json")

    print(f"지울 것: {post.get('title', post_id)}")
    print(f"  {post_file.relative_to(ROOT)}")
    if photo_dir.is_dir():
        print(f"  {photo_dir.relative_to(ROOT)}/ (사진 {len(list(photo_dir.iterdir()))}장)")
    if input("되돌릴 수 없습니다. 지울까요? [y/N] ").strip().lower() not in {"y", "yes"}:
        print("그만둡니다.")
        return

    index["posts"] = [entry for entry in index["posts"] if entry.get("id") != post_id]
    write(INDEX, index)

    photos_file = ROOT / "photos.json"
    photos = read(photos_file)
    before = len(photos["photos"])
    photos["photos"] = [
        photo for photo in photos["photos"] if not str(photo.get("src", "")).startswith(f"photos/{post_id}/")
    ]
    if len(photos["photos"]) != before:
        write(photos_file, photos)

    post_file.unlink(missing_ok=True)
    shutil.rmtree(photo_dir, ignore_errors=True)
    print("지웠습니다. python3 scripts/publish.py 로 반영하세요.")


def find(posts: list[dict], post_id: str) -> dict:
    for post in posts:
        if post.get("id") == post_id:
            return post
    known = ", ".join(post.get("id", "") for post in posts) or "(없음)"
    stop(f"그런 글이 없습니다: {post_id}\n있는 글: {known}")
    raise AssertionError


def read(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        stop(f"읽지 못했습니다: {path}")
        raise AssertionError


def write(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def stop(message: str) -> None:
    raise SystemExit(f"posts-error: {message}")


if __name__ == "__main__":
    main()
