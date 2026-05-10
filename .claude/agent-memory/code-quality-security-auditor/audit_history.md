---
name: Audit History
description: 감사 이력 및 회차별 주요 발견사항
type: project
---

## 2026-05-02 — 첫 전체 감사

**감사 범위**: auth/users.js, auth/google.js, server.js, auth/drive.js, public/app.js

**Critical**
- marked.js + processWikiLinks XSS: DOMPurify 미적용, wikilink alias escapeHtml 누락
- 그래프 뷰 XSS: 노트 이름/요약이 card.innerHTML, tooltip.innerHTML에 비이스케이프 삽입

**High**
- SESSION_SECRET 누락 시 fallback으로 서버 계속 기동 (취약한 세션 시크릿)
- 세션 쿠키 secure 플래그 없음
- Drive 폴더 delete/rename 시 assertOwnedByApp 미호출
- OAuth 콜백에서 error.message 직접 HTML 응답으로 노출
- AI 라우트에서 OpenAI 원문 오류(detail) 클라이언트 반환

**Medium**
- 경로 트래버설 최종 startsWith 검증 없음
- 검색/백링크/그래프 N+1 파일 읽기
- 라우트 catch 블록 console.error 누락

**잘 구현된 부분**
- requireAuth 모든 /api/* 적용 완벽
- AES-256-GCM refresh token 암호화 (IV 매번 새로 생성)
- normalizeNotePath의 .. 차단
- assertOwnedByApp BFS 검증 (read/update/delete에 적용)
- PPT 슬라이드 미리보기 전체 escapeHtml 적용
- OAuth state CSRF 방어
- .gitignore 민감 파일 정상 제외
