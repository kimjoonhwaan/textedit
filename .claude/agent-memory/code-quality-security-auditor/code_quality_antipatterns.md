---
name: Code Quality Anti-patterns
description: 반복 발견되는 코드 품질 문제 및 개선 방향
type: project
---

## 빈 catch 블록

- `auth/drive.js:395`: `catch { // ignore inaccessible ancestors }` — 의도적 무시지만 주석으로만 설명
- `server.js:1073`: `catch { /* ignore - delete proceeds anyway */ }` — 의도적

## 에러 로깅 누락

- server.js의 여러 라우트 catch 블록에서 `console.error` 없이 500 응답만 반환
  - 예: /api/notes GET (server.js:670), /api/notes POST (server.js:706), /api/notes DELETE (server.js:744)
  - 운영 환경에서 원인 파악 불가

## SESSION_SECRET 검증 미흡

- server.js:48-59: 누락 시 경고만, 서버 계속 기동 — 프로덕션에서 취약한 fallback으로 동작 가능
- 최소 32바이트 hex 검증 없음

## 쿠키 secure 플래그 미설정

- server.js:62-68: `cookie.secure` 없음 — HTTPS 배포 시 반드시 추가 필요

## 검색 성능 (N+1)

- /api/search (server.js:846): 모든 노트 파일을 순차 읽기 — 노트 수 증가 시 선형 증가
- /api/backlinks/:name (server.js:870): 동일 패턴
- /api/graph (server.js:888): 동일 패턴

## 프론트엔드 XSS

- processWikiLinks의 alias(displayName) escapeHtml 누락 (app.js:1384)
- 그래프 카드/툴팁에 노트 이름/요약 escapeHtml 누락 (app.js:1804-1807, 1879-1882)
- graphTagFilter option 생성 시 태그값 escapeHtml 누락 (app.js:1758-1760)
- marked.js 렌더링 결과에 DOMPurify 미적용

## marked.js 버전

- package.json: marked ^9.1.2 — CDN 버전과 일치 여부 미확인
- marked v9는 기본적으로 HTML 허용 (sanitize 옵션 제거됨) — DOMPurify 필수

**Why:** 2026-05-02 전체 감사에서 확인된 반복 패턴
**How to apply:** 코드 변경 시 위 패턴 재발 여부 점검
