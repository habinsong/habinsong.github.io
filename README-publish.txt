이 ZIP을 저장소 루트에 풀고 릴리즈 스크립트를 실행하세요:
python3 scripts/release.py

스크립트가 *.merge.json 파일을 photos.json / series.json / content/posts/index.json에 자동 병합(같은 id는 갱신)하고, 검증한 뒤 _release/를 생성합니다.

글 id: 초록빛
