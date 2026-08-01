#!/usr/bin/env python3
"""올리기: 내려받은 ZIP을 풀고, 사이트를 만들고, 깃허브에 올린다.

    python3 scripts/publish.py          내려받기 폴더의 최신 ZIP을 찾아 전부 처리
    python3 scripts/publish.py -y       확인 없이 바로
    python3 scripts/publish.py 파일.zip 특정 ZIP을 지정

ZIP이 없으면 지금 폴더 상태 그대로 사이트를 만들어 올린다. 글을 내리거나
시리즈 설명을 고친 뒤에도 이 명령 하나면 된다.
"""
from __future__ import annotations

import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"


def main() -> None:
    args = [value for value in sys.argv[1:] if value not in {"-y", "--yes"}]
    assume_yes = len(args) != len(sys.argv[1:])

    bundle = Path(args[0]).expanduser() if args else newest_bundle()
    if bundle is not None and not bundle.exists():
        stop(f"그런 파일이 없습니다: {bundle}")

    if bundle is None:
        print("새 ZIP이 없습니다. 지금 폴더 상태 그대로 올립니다.")
    else:
        print(f"ZIP: {bundle.name}")
        for line in bundle_summary(bundle):
            print(f"  {line}")

    if not assume_yes and not ask("올릴까요?"):
        print("그만둡니다.")
        return

    if bundle is not None:
        unpack(bundle)

    run(["python3", "scripts/release.py"])

    if not changed():
        print("바뀐 것이 없습니다. 올리지 않습니다.")
        return

    run(["git", "add", "-A"])
    run(["git", "commit", "-m", commit_message()])
    run(["git", "push"])
    print("\n올렸습니다. 1~2분 뒤 https://habinsong.github.io/ 에서 보입니다.")


def newest_bundle() -> Path | None:
    if not DOWNLOADS.is_dir():
        return None
    bundles = sorted(DOWNLOADS.glob("*-content-bundle.zip"), key=lambda path: path.stat().st_mtime)
    return bundles[-1] if bundles else None


def bundle_summary(bundle: Path) -> list[str]:
    lines = []
    with zipfile.ZipFile(bundle) as archive:
        names = archive.namelist()
        for name in names:
            if name.startswith("content/posts/") and not name.endswith("index.merge.json"):
                try:
                    post = json.loads(archive.read(name))
                    lines.append(f"글: {post.get('title', name)}")
                except (json.JSONDecodeError, KeyError):
                    lines.append(f"글: {name}")
        photos = [name for name in names if name.startswith("photos/")]
        if photos:
            lines.append(f"사진: {len(photos)}장")
    return lines or ["(내용을 읽지 못했습니다)"]


def unpack(bundle: Path) -> None:
    with zipfile.ZipFile(bundle) as archive:
        for member in archive.infolist():
            target = (ROOT / member.filename).resolve()
            if not target.is_relative_to(ROOT):
                stop(f"ZIP 안의 경로가 폴더를 벗어납니다: {member.filename}")
        archive.extractall(ROOT)
    print(f"풀었습니다: {bundle.name}")


def commit_message() -> str:
    try:
        posts = json.loads((ROOT / "content/posts/index.json").read_text(encoding="utf-8"))["posts"]
    except (OSError, json.JSONDecodeError, KeyError):
        return "글 갱신"
    published = [post for post in posts if post.get("status") == "published"]
    if not published:
        return "글 갱신"
    newest = max(published, key=lambda post: post.get("date", ""))
    return f"글: {newest.get('title', '제목 없음')}"


def changed() -> bool:
    result = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True)
    return result.stdout.strip() != ""


def ask(question: str) -> bool:
    try:
        answer = input(f"{question} [Y/n] ").strip().lower()
    except EOFError:
        return False
    return answer in {"", "y", "yes", "ㅇ"}


def run(command: list[str]) -> None:
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode != 0:
        stop(f"멈췄습니다: {' '.join(command)}")


def stop(message: str) -> None:
    raise SystemExit(f"publish-error: {message}")


if __name__ == "__main__":
    main()
