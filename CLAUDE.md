# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 프로젝트 개요다.

## 프로젝트 개요

**이름**: StMarkdownEditor (실행 시 표시명: Markdown Editor)
**성격**: 다중 사용자 마크다운 노트 편집기. 로컬 파일과 Google Drive를 병행 저장소로 사용. AI 보조 기능(태그 추출, Q&A, PPT 변환) 내장.

**주요 가치**:
- 옵시디언 스타일 위키링크/그래프/백링크
- AI 기반 자동 태그·문서 Q&A·발표 슬라이드 자동 생성 (OpenAI)
- Google OAuth 로그인 + 사용자별 노트 격리
- Drive ↔ 로컬 양방향 미러링 (Drive를 source of truth로 취급)

## 기술 스택

- **런타임**: Node.js 20+ (ES Modules, `"type": "module"`)
- **백엔드**: Express 4.18, express-session, cookie-parser
- **OAuth/Drive**: googleapis 공식 SDK
- **AI**: OpenAI Chat Completions API (기본 모델 `gpt-4o-mini`), 옵션으로 Langsmith 트래킹
- **프론트엔드**: 빌드 없음. 순수 HTML/CSS/JS + CDN 라이브러리
  - marked.js (마크다운 렌더)
  - D3 v7 (그래프 시각화)
  - PptxGenJS 3.12 (.pptx 생성)
- **MCP**: 별도 stdio 기반 MCP 서버 (`mcp-server.js`) — 노트를 컨텍스트로 외부 도구에 제공

## 디렉토리 구조

```
proj08-textedit/
├── server.js                # Express 메인. 모든 라우트 + 미들웨어 + 마이그레이션
├── mcp-server.js            # MCP 서버 (stdio)
├── package.json
├── .env                     # 환경변수 (gitignored)
├── .env.example             # 환경변수 템플릿
├── .gitignore
│
├── auth/                    # 인증/Drive 모듈
│   ├── google.js            # OAuth2 클라이언트 + 토큰 교환 + 사용자 정보 조회
│   ├── users.js             # 사용자 저장소 (data/users.json), refresh token AES-256-GCM 암호화
│   └── drive.js             # Drive API: 폴더 트리 walking, 파일 CRUD, mirroring helpers
│
├── data/                    # 사용자 메타데이터 (gitignored)
│   └── users.json           # { [googleUserId]: { id, email, name, picture, refreshToken(enc), ...} }
│
├── notes/                   # 노트 저장소 (gitignored)
│   ├── _legacy/             # 다중 사용자 도입 시 자동 이주된 기존 콘텐츠
│   └── u_<googleUserId>/    # 사용자별 노트 폴더 (자유로운 하위 폴더 구조)
│
├── public/                  # 정적 프론트엔드
│   ├── index.html           # 단일 페이지. 로그인 오버레이 + 사이드바 + 에디터 + 모달
│   ├── app.js               # 모든 클라이언트 로직 (~3300줄, 단일 파일)
│   └── styles.css           # 단일 CSS (~1500줄)
│
├── docs/                    # 프로젝트 문서
├── scripts/
├── 작업중/                  # 일자별 작업 일지 (수동 작성)
└── README.md
```

## 핵심 흐름

### 인증 흐름
1. 사용자 → `/auth/google` → Google 동의 화면 (`drive`, `userinfo.email`, `userinfo.profile` 스코프)
2. 콜백 `/auth/google/callback` → 토큰 교환 → `upsertUser()`로 `data/users.json`에 저장 (refresh token AES-256-GCM 암호화)
3. `req.session.userId` 설정, 쿠키 `mde.sid`
4. 모든 `/api/*` 라우트는 `requireAuth` 미들웨어로 보호. 미로그인 시 401
5. 프론트는 부팅 시 `/api/me` 호출. 401이면 로그인 오버레이 표시

### 노트 저장소 격리
- `userNotesDir(userId)` = `notes/u_{userId}/` — 각 사용자 전용
- `resolveNotePath(userId, name)` / `resolveFolderPath(userId, folder)` — 모든 helper가 userId를 첫 인자로
- 모든 라우트 핸들러: `req.userId`를 받아 helpers에 전달

### Drive 통합
- 단일 앱 폴더 `MarkdownEditor` (사용자 Drive 루트). 캐시는 `folderCache` Map (`auth/drive.js`)
- `walkSubtree()`가 재귀로 폴더 트리를 순회 → `subdir/note` 형태의 풀패스 이름 반환
- 지원 mimeType: `text/markdown`, `text/plain`, `application/vnd.google-apps.document` (Docs는 read-only, export로 텍스트 추출)
- `assertOwnedByApp()`이 부모 ancestry를 BFS로 거슬러 올라가 `MarkdownEditor` 외부 파일 차단
- **자동 미러링**: Drive 노트를 읽거나 저장할 때마다 서버가 동시에 `notes/u_{userId}/{name}.md`에 동일 내용을 저장. `/api/drive/sync-all`로 일괄 동기화 가능

### AI 기능
- `POST /api/tags/auto` — 마크다운 → 태그 5개 (콤마 구분 텍스트 응답)
- `POST /api/ai/ask` — 문서 + 질문 → 답변 (마크다운)
- `POST /api/ai/pptify` — 마크다운 → 구조화된 슬라이드 JSON (`response_format: json_object`)
  - 4종 레이아웃: `bullets` / `comparison` / `process` / `stat`
  - 각 슬라이드별 2분 분량(500~700자) 발표 스크립트 포함
  - PPTX 생성 시 `addNotes()`로 발표자 노트에 자동 첨부

## 환경변수

`.env`에 설정 (값은 `.env.example` 참조):

| 변수 | 필수 | 용도 |
|---|---|---|
| `PORT` | - | 기본 3000, 보통 3001 |
| `OPENAI_API_KEY` | AI 기능 | OpenAI Chat Completions |
| `OPENAI_MODEL` | - | 기본 `gpt-4o-mini` |
| `LANGSMITH_API_KEY` | 옵션 | LLM 호출 트래킹 |
| `LANGSMITH_ENDPOINT` | 옵션 | Langsmith API 엔드포인트 |
| `LANGSMITH_PROJECT` | 옵션 | 기본 `StMarkdownEditor` |
| `GOOGLE_CLIENT_ID` | 인증 | OAuth 2.0 Web Application 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 인증 | OAuth 클라이언트 시크릿 |
| `GOOGLE_REDIRECT_URI` | 인증 | `http://localhost:3001/auth/google/callback` |
| `SESSION_SECRET` | 인증 | 32바이트 hex. 세션 쿠키 + refresh token 암호화 키 파생 |

## API 라우트 요약

### 인증
- `GET /auth/google` — OAuth 시작
- `GET /auth/google/callback` — 콜백
- `POST /auth/logout` — 세션 파기
- `GET /api/me` — 현재 사용자 (401 if 미로그인)

### 노트 (로컬, 사용자별 격리, requireAuth)
- `GET /api/notes` — 노트 이름 배열
- `GET /api/notes/:name` — 노트 내용
- `POST /api/notes` `{name, content}` — 생성/저장
- `DELETE /api/notes/:name`
- `PUT /api/notes/:name/rename` `{newName}`
- `POST /api/notes/:name/copy` `{targetName}`
- `GET /api/folders`, `POST /api/folders` `{path}`, `DELETE /api/folders/*`, `PUT /api/folders/rename` `{from, to}`

### 검색/그래프 (로컬, requireAuth)
- `GET /api/search?q=...`
- `GET /api/backlinks/:name`
- `GET /api/graph` — `{nodes, edges}` (위키링크 기반)

### AI (requireAuth)
- `POST /api/tags/auto`
- `POST /api/ai/ask`
- `POST /api/ai/pptify`

### Drive (requireAuth)
- `GET /api/drive/notes` — 트리 walk 후 평탄화된 노트 목록
- `GET /api/drive/notes/:fileId` — 내용 + 자동 로컬 미러
- `POST /api/drive/notes` `{name, content}` — 생성/업로드 (동일 이름 있으면 update) + 로컬 미러
- `PUT /api/drive/notes/:fileId` `{content?, name?}` — 저장 + 로컬 미러
- `DELETE /api/drive/notes/:fileId` — 삭제 + 로컬 미러 삭제
- `POST /api/drive/sync-all` — 모든 Drive 노트를 로컬에 일괄 미러
- `POST /api/drive/sync-all-stream` — 동일하나 NDJSON 스트리밍으로 진행상황 실시간 전송 (`event: stage|progress|done|error`)
- `GET /api/drive/diagnose` — 부여된 OAuth 스코프 확인 (디버깅용)

## 프론트엔드 핵심 모듈 (단일 `app.js`)

`public/app.js` 한 파일에 모두 들어있음. 영역별 위치:

| 영역 | 대략 라인 | 키 함수 |
|---|---|---|
| DOM 캐시 / 상태 변수 | 1~80 | `editor`, `currentNote`, `currentNoteSource`, `currentDriveFileId`, `currentUser` |
| 토스트 헬퍼 | 73 | `showToast(msg, type, duration)` |
| 마크다운 렌더 | ~1230, ~1352 | `escapeHtml`, `renderPreview` |
| 저장/로드 | ~1589, ~1614 | `saveNote` (source-aware: 로컬 POST vs Drive PUT vs Docs read-only), `loadNote` |
| 검색/그래프 | 다양 | `findDocMatches`, `renderGraph` |
| PPT 변환 | 2660~3160 | `splitMarkdownIntoSlides`, `aiSummarizeSlides`, `renderSlideToPptx`, `generatePptxFile` |
| 인증 + Drive | 끝부분 (3170+) | `bootApp`, `fetchCurrentUser`, `fetchDriveNotes`, `loadDriveNote`, `uploadCurrentNoteToDrive`, `syncAllDriveNotes` |

## 실행 방법

```bash
# 의존성 설치 (최초 1회)
npm install

# 개발 서버 (PORT=3001 .env에 설정 권장)
npm start

# MCP 서버 (별도 터미널)
npm run mcp
```

브라우저: `http://localhost:3001` → "Google로 로그인" → 사용 가능.

## 보안 모델

- **앱 폴더 격리**: Drive 작업은 모두 `MarkdownEditor` 폴더 내부로 한정 (`assertOwnedByApp` BFS 검증)
- **사용자 격리**: 노트 경로는 항상 `notes/u_{userId}/`로 prefix
- **세션 암호화**: `SESSION_SECRET`을 SHA-256으로 파생한 32바이트 키로 refresh token AES-256-GCM 암호화
- **OAuth state**: CSRF 방지용 random hex state, 세션에서 검증
- **민감 파일**: `.env`, `data/`, `notes/u_*/` 모두 `.gitignore`

## 알려진 제약

- **다중 디바이스 동시 편집 충돌 없음**: last-write-wins. 두 디바이스에서 같은 노트 동시 편집 시 늦은 저장이 덮어씀
- **Google Docs 편집 불가**: 사이드바에 표시는 되나 read-only. 수정하려면 다운로드 → 로컬 노트로 사용
- **`drive` 스코프**: Sensitive scope. 외부 게시 시 Google verification 필요. 현재는 Test Mode 가정
- **이름 충돌**: Drive ↔ 로컬 동일 경로의 노트는 항상 Drive가 source of truth (덮어씀)
- **그래프/백링크**: 로컬 노트만 대상. Drive 노트는 미러된 후에만 그래프에 포함됨

## 협업 가이드라인

- **빌드 도구 없음**: 변경 시 새로고침이면 반영. 캐시 이슈 시 `Ctrl+F5`
- **단일 사용자 단일 프로세스 가정**: 인메모리 캐시(`folderCache`)는 프로세스 내에서만 유효. 클러스터 배포 전에 Redis 등으로 옮길 것
- **`public/app.js`는 매우 크다**: 새 기능은 파일 끝에 섹션 주석(`// ===== ... =====`) 후 추가. 정리는 별도 PR로
- **신규 라우트는 반드시 `requireAuth`**: `/api/*` 보호. 누락 검증은 `Grep "^app\.(get|post|put|delete)"` 후 미들웨어 누락 확인
- **Drive helper 작성 시 `assertOwnedByApp` 호출** 필수. 외부 파일 접근 차단

## 효율적 작업을 위한 운영 가이드

### 큰 파일 읽기 전략
모든 파일을 통째로 읽지 말 것. 대략적 라인 수:

| 파일 | 라인 수 | 권장 읽기 방법 |
|---|---|---|
| `public/app.js` | ~3300 | 항상 `Grep` 먼저 → `Read offset/limit`로 좁혀서 |
| `public/styles.css` | ~1500 | 동일 |
| `server.js` | ~950 | `Grep "^app\."` 후 라인 점프 |
| `auth/*.js` | <250 | 통째로 읽어도 OK |

자주 쓰는 Grep 패턴:
- 라우트 인벤토리: `Grep "^app\.(get|post|put|delete)\("` (server.js)
- 함수 정의: `Grep "^(async )?function |^const \w+ = (async )?\("` (app.js)
- DOM 캐시: `Grep "document\.getElementById"` (app.js 1~80줄)
- 이벤트 바인딩: `Grep "addEventListener"` (app.js 후반부)
- 토스트 호출: `Grep "showToast\("` 

### 자주 마주치는 함정

**1. 중복 함수 정의**
- `escapeHtml`이 `app.js:1231`에 이미 const arrow로 정의돼 있음. 새로 `function escapeHtml`을 추가하면 ES strict mode SyntaxError. 추가하기 전 `Grep "function escapeHtml|const escapeHtml"` 확인.

**2. 서버 변경 후 재시작 누락**
- `server.js`나 `auth/*.js` 변경은 **반드시 재시작**해야 반영. 정적 파일(`public/*`)은 새로고침이면 됨.
- 사용자가 이미 서버를 띄워둔 경우 새 `npm start`는 `EADDRINUSE` 에러. 사용자에게 재시작 요청하고, 직접 종료는 자제.
- 포트 점유 PID 확인: `Get-NetTCPConnection -LocalPort 3001 -State Listen | % { Get-Process -Id $_.OwningProcess }` (PowerShell)

**3. SESSION_SECRET 누락 → 침묵 실패**
- session middleware는 fallback 시크릿으로 살아있지만, `auth/users.js`의 `deriveKey()`가 throw → OAuth 콜백이 500 응답 ("SESSION_SECRET 환경변수가 필요합니다")
- 새 사용자가 OAuth 후 첫 콜백에서 막히면 가장 먼저 의심
- 32바이트 hex 생성: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**4. OAuth 스코프 변경 시 재로그인 필요**
- `auth/google.js`의 `GOOGLE_SCOPES` 수정 후 기존 refresh token은 옛 권한 그대로
- 사용자가 https://myaccount.google.com/permissions 에서 액세스 회수 → 다시 로그인해야 새 동의 화면 표시
- Google Cloud Console의 OAuth consent screen에도 동일 스코프 등록 필요 (안 그러면 요청해도 부여 안 됨)
- 진단: `GET /api/drive/diagnose`로 실제 부여된 scope 확인

**5. Drive 웹에서 .md 더블클릭 → Google Docs 사본 생성**
- 이건 Google 동작이고 우리가 막을 수 없음. 사용자가 사본을 편집해도 원본 .md는 변경 없음
- 이미 처리됨: `walkSubtree`가 `vnd.google-apps.document`도 listing, 클릭 시 `files.export(text/plain)`으로 추출. 단 read-only

**6. drive.file vs drive 스코프 함정**
- `drive.file`은 **앱이 만든 파일만** 보임. Drive 웹에서 만든 폴더/파일은 listing에서 누락
- 우리는 `drive` (full) 사용. 보안은 `assertOwnedByApp` 함수가 BFS로 부모 체인을 확인해 `MarkdownEditor` 외부 파일 차단

**7. listDriveNotes pagination**
- `walkSubtree`는 `pageSize: 200`이지만 페이지네이션 처리됨 (`pageToken` 루프)
- 200개 초과 폴더 안 노트도 모두 가져옴

**8. 노트 이름에 슬래시 = 폴더 경로**
- `subdir/note` 형태. Drive에서는 `splitNotePath()`가 분리해서 폴더를 자동 생성
- 로컬은 `path.join(userNotesDir, ...subdir, "note.md")`로 매핑. Windows에서도 forward slash로 들어옴 (server.js의 `normalizeNotePath`가 정규화)

**9. 페이로드 한계**
- `express.json({ limit: "8mb" })` 적용. 8MB 초과 마크다운은 거부
- 더 큰 파일 처리해야 하면 limit 상향 + 메모리 사용량 점검

**10. mirrorToLocal은 best-effort**
- 실패해도 서버는 200 응답함 (Drive 작업이 핵심). console.warn만 남김
- 사용자가 "분명 받았는데 사이드바에 안 보인다" 하면 server 로그 확인

### 디버깅 단축 동작

**현재 OAuth 권한 확인**
```js
// 브라우저 콘솔에서
fetch('/api/drive/diagnose').then(r=>r.json()).then(console.table)
```
- `hasFullDrive: true`면 정상
- `hasDriveFile: true`만이면 `auth/drive`만 부여돼 Drive 웹 생성 파일 보이지 않음

**서버 로그 위치**
- `server.log` (stdout) / `server.err` (stderr) — 사용자가 `npm start > server.log 2> server.err` 식으로 띄울 때만 생성됨
- 배경: 모든 라우트가 console.error로 throw 메시지 출력. ENOENT/auth 실패는 여기 남음

**사용자 데이터 직접 검사**
```bash
cat data/users.json   # 암호화된 refresh token + 메타
ls notes/u_*/         # 사용자별 노트 폴더
```

**라우트 누락 확인 (보안)**
```
Grep "^app\.(get|post|put|delete)" → 결과에서 ", requireAuth" 미포함 항목이 있으면 인증 누락
```
공개 라우트는 `/auth/google`, `/auth/google/callback`, `/auth/logout`, `/api/me`, 정적 파일뿐.

**Drive 폴더 ID 캐시 무효화**
- 서버 재시작 외에는 `folderCache.clear()` 호출하는 디버그 라우트 없음. 필요시 추가
- 사용자가 Drive에서 `MarkdownEditor` 폴더를 삭제하고 다시 만든 경우 캐시가 stale → 재시작 필수

### 코드 컨벤션

- **Express 응답 형식**: 성공 `res.json({ key: value })`, 실패 `res.status(N).json({ error: "한국어 메시지", detail?: ... })`
- **에러 메시지는 한국어** (UI에서 토스트로 직접 노출됨). 영어 stack trace는 `console.error`로만
- **AI 라우트 boilerplate**: API key 체크 → messages 구성 → langsmith run 시작 → fetch → response.ok 체크 → langsmith run 종료. `auto-tags` / `ai-ask` 패턴 그대로 복사하면 안전
- **사용자 ID 인자 위치**: helper 함수의 첫 번째 인자가 `userId` (예: `resolveNotePath(userId, name)`)
- **Drive helper 응답**: 가능한 한 평탄한 객체. `{ id, name, mimeType, modifiedTime, content? }` 같은 형태
- **PptxGenJS LAYOUT_WIDE**: 13.33 × 7.5 inch 기준으로 좌표 작성. 표준 `LAYOUT_STANDARD`(10×7.5)와 다름

### 마이그레이션 시 점검 체크리스트

새 환경변수/스키마 추가 시:
1. `.env.example` 업데이트
2. `CLAUDE.md` 환경변수 표 갱신
3. 누락 시 명확한 에러 메시지 (`SESSION_SECRET`처럼 cryptic하지 않게)
4. `data/users.json` 스키마 변경이면 `auth/users.js`에 마이그레이션 함수 추가 필요

새 OAuth 스코프 추가 시:
1. `auth/google.js`의 `GOOGLE_SCOPES`
2. Google Cloud Console → OAuth consent screen → Scopes
3. README/CLAUDE에 권한 변경 안내

새 라우트 추가 시:
1. `requireAuth` 미들웨어 첨부
2. CLAUDE.md "API 라우트 요약" 표 갱신
3. 응답 형식 컨벤션 준수
4. AI 호출이면 Langsmith 트래킹 boilerplate 따라하기

### 사용자 vs Claude 책임 분담

**사용자가 직접 해야 함**:
- Google Cloud Console OAuth client 생성/스코프 변경
- `.env` 작성 (자격증명/시크릿)
- 기존 OAuth 권한 회수 (myaccount.google.com)
- 서버 재시작 (Ctrl+C 후 `npm start`)
- 브라우저 캐시/하드 리로드

**Claude가 처리**:
- 코드 변경 (server.js, auth/*, public/*)
- 의존성 추가 (`npm install`)
- 마이그레이션 스크립트 작성
- `.env.example` / `CLAUDE.md` 갱신

### 자주 쓰는 검증 시나리오

**스모크 테스트 (모든 큰 변경 후)**
1. 서버 재시작 후 콘솔에 "Server running at..." 보이는지
2. 브라우저 `/` 접속 → 로그인 안 된 상태면 오버레이 표시
3. Google 로그인 → 콜백 후 사이드바 정상 렌더
4. 새 로컬 노트 생성 → 저장 → 새로고침 시 그대로 유지
5. AI 태그 / AI 질문 1회씩 호출 (OPENAI_API_KEY 있을 때)
6. ☁ Drive로 업로드 → Drive 사이드바에 나타남 → 두 번 누르면 "업데이트" 토스트
7. ⇣ 전체 → 토스트에 "N/N" 표시

**회귀 모니터링 포인트**
- 자동저장이 Drive 분기와 로컬 분기 모두 정상 동작하는지
- Google Docs 클릭 시 read-only 토스트 + saveNote 차단되는지
- 그래프 뷰가 사용자별로 격리되는지 (`/api/graph` 응답에 다른 유저 노트 없어야)
- 로그아웃 후 모든 `/api/*`가 401 반환하는지
