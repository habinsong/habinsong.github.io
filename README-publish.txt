게시 순서

1. 이 ZIP의 내용물을 저장소 루트에 풉니다.
2. 아래 릴리즈 스크립트를 실행합니다.

python3 scripts/release.py

3. 마지막 줄의 release-ok: 메시지를 확인하고 _release/에서 결과를 점검합니다.
4. git status --short로 글, 사진, 색인 파일만 바뀌었는지 확인합니다.
5. 변경분을 커밋하고 master에 푸시하면 GitHub Actions가 Pages에 배포합니다.

스크립트는 *.merge.json을 photos.json / series.json / content/posts/index.json에 자동 병합하고 데이터 전체를 검증합니다. 같은 id는 기존 항목을 갱신하며, 처리한 merge 파일은 삭제됩니다.

글 id: 초록빛
