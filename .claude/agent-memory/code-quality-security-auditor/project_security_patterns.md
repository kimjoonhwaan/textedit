---
name: Project Security Patterns
description: 인증/Drive/경로 보안 구현 현황, 취약점 위치, 핵심 보안 패턴
type: project
---

## 인증 및 세션 보안

- `requireAuth` 미들웨어: server.js:223 — 모든 /api/* 라우트에 적용 확인됨 (공개 라우트: /auth/google, /auth/google/callback, /auth/logout, /api/me만 예외)
- SESSION_SECRET 누락 시 경고만 출력하고 fallback "dev-secret-please-change"로 계속 동작 (server.js:48-59) — 서버가 중단되지 않음
- SESSION_SECRET 최소 길이/엔트로피 검증 없음
- 세션 쿠키에 `secure: true` 미설정 (server.js:62-68) — HTTP 환경에서 쿠키 탈취 가능
- OAuth state 파라미터 검증 정상 구현 (server.js:937)
- refresh token AES-256-GCM 암호화 정상 (auth/users.js:21-32, IV 매번 새로 생성)

## 경로 트래버설 방지

- `normalizeNotePath` (server.js:238): `..` 포함 시 null 반환 — 기본 방어 있음
- `resolveFolderPath` (server.js:273): 동일 패턴
- `path.join(userNotesDir(userId), ...)` 사용으로 사용자 격리 구현
- **미확인**: path.join 결과가 userNotesDir 경계 밖으로 나가는지 최종 검증(startsWith) 없음

## Drive 보안

- `assertOwnedByApp()` (auth/drive.js:380): readDriveNote, updateDriveNote, deleteDriveNote에서 호출됨
- `createDriveNote`에서는 assertOwnedByApp 호출 없음 — 신규 생성이므로 위험도 낮음
- `deleteDriveFolderByPath`에서 assertOwnedByApp 호출 없음 (auth/drive.js:131-139)
- `renameDriveFolder`에서 assertOwnedByApp 호출 없음 (auth/drive.js:101-129)
- folderCache는 Map으로 userId별 격리됨

## XSS 위험 영역

- `renderPreview` (app.js:1387): marked.js로 파싱 후 preview.innerHTML에 직접 삽입 — DOMPurify 없음
- `processWikiLinks` (app.js:1378): displayName(alias)이 escapeHtml 처리 없이 innerHTML에 삽입 — XSS 가능
- `card.innerHTML` (app.js:1804): n.id (노트 이름), summary가 escapeHtml 없이 삽입
- `tooltip.innerHTML` (app.js:1879): d.id (노트 이름), summary가 escapeHtml 없이 삽입
- `graphTagFilter.innerHTML` (app.js:1758): 태그값이 escapeHtml 없이 option에 삽입
- PPT 슬라이드 미리보기는 escapeHtml 올바르게 사용됨

## 정보 노출

- OAuth 콜백 에러: `error.message` 직접 노출 (server.js:928, 960)
- AI 라우트: OpenAI 오류 `detail` (원문 텍스트) 클라이언트에 반환 (server.js:456, 533, 637)
- `/api/drive/diagnose`: access token 스코프 정보 반환 — requireAuth 있어 인증된 사용자만 접근
- handleDriveError: error.message 직접 클라이언트 반환 (server.js:991)

**Why:** 2026-05-02 첫 전체 감사에서 확인
**How to apply:** 이후 감사 시 위 위치부터 우선 점검
