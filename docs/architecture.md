# Obsidian-like Markdown Editor 설계문서

> 작성일: 2026-04-04
> 분석 대상: `C:\dev\claudecode\proj08-textedit`

---

## 1. 프로젝트 개요

### 1.1 목적

로컬 파일 시스템 기반의 Markdown 편집기 웹 애플리케이션이다. Obsidian과 유사한 폴더 트리 구조를 제공하며, OpenAI GPT를 통한 자동 태그 생성과 AI 질문 기능을 포함한다. 추가로 MCP(Model Context Protocol) 서버를 통해 외부 AI 클라이언트(Claude 등)가 문서를 직접 읽고 쓸 수 있는 도구 인터페이스를 제공한다.

### 1.2 기술 스택

| 분류 | 기술 | 버전 |
|---|---|---|
| 런타임 | Node.js (ESM) | - |
| 웹 프레임워크 | Express | ^4.18.2 |
| AI 연동 | OpenAI Chat Completions API | - |
| AI 관찰성 | LangSmith | ^0.5.4 |
| Markdown 렌더링 | marked (CDN) | ^9.x |
| MCP 서버 SDK | @modelcontextprotocol/sdk | ^0.6.0 |
| HTTP 클라이언트 | node-fetch | ^3.3.2 |
| 환경 변수 | dotenv | ^16.4.5 |
| 프론트엔드 | 바닐라 JS (ES2020) + HTML/CSS | - |
| 데이터 영속성 (클라이언트) | localStorage | - |
| 데이터 영속성 (서버) | 로컬 파일 시스템 (.md 파일) | - |

### 1.3 디렉토리 구조

```
proj08-textedit/
├── server.js              # Express 웹 서버 (메인 진입점)
├── mcp-server.js          # MCP 도구 서버 (stdio 기반)
├── package.json           # 프로젝트 메타데이터 및 의존성
├── .env                   # 환경 변수 (OPENAI_API_KEY, PORT 등)
├── public/
│   ├── index.html         # 단일 페이지 애플리케이션 HTML
│   ├── app.js             # 프론트엔드 JavaScript (전체 UI 로직)
│   └── styles.css         # 전체 스타일시트
├── notes/                 # 문서 저장 디렉토리 (런타임 생성)
│   ├── [폴더명]/
│   │   └── [문서명].md
│   └── [문서명].md
└── .ai-index/             # 벡터 인덱스 캐시 (외부 도구용)
    ├── index-meta.json
    └── vectors.json
```

### 1.4 실행 방법

```bash
# 웹 서버 실행 (기본 포트 3001, .env의 PORT 변수 참조)
npm start          # → node server.js

# MCP 서버 실행 (stdio 트랜스포트)
npm run mcp        # → node mcp-server.js
```

---

## 2. 데이터베이스 설계

본 프로젝트는 별도의 DBMS를 사용하지 않는다. 서버 측 영속성은 로컬 파일 시스템, 클라이언트 측 영속성은 브라우저 localStorage로 처리된다.

### 2.1 서버 측 파일 저장소

**저장 위치**: `<프로젝트 루트>/notes/`

**파일 형식**: UTF-8 인코딩의 `.md` 파일

**경로 구조**:
- 파일 경로가 곧 문서의 논리적 이름이 된다.
- 예: `notes/프로젝트/설계문서.md` → 문서 이름 `프로젝트/설계문서`
- 폴더 깊이에 제한 없음 (재귀 탐색 지원)

### 2.2 클라이언트 측 localStorage 스키마

브라우저의 localStorage에 아래 키로 데이터를 저장한다.

| localStorage 키 | 타입 | 내용 |
|---|---|---|
| `notes.favorites` | `string[]` (JSON) | 즐겨찾기된 문서 이름 목록 |
| `notes.recents` | `string[]` (JSON) | 최근 열람 문서 목록 (최대 6개) |
| `notes.tags` | `{[noteName: string]: string[]}` (JSON) | 문서별 태그 맵 |
| `notes.colors` | `{notes: {[name: string]: string}, folders: {[path: string]: string}}` (JSON) | 문서 및 폴더별 색상 코드 맵 |
| `notes.templates` | `{id: string, label: string, content: string}[]` (JSON) | 사용자 정의 템플릿 목록 |
| `notes.versions.<문서명>` | `{timestamp: string, content: string}[]` (JSON) | 문서별 버전 히스토리 (최대 20개) |

---

## 3. 백엔드 API 설계

모든 API는 Express로 구현되며, 기본 포트는 `.env`의 `PORT` 값(기본값: 3000)으로 수신한다.

### 3.1 문서(Notes) API

#### GET /api/notes
- **설명**: notes 디렉토리 아래 모든 `.md` 파일을 재귀 탐색하여 이름 목록을 반환한다.
- **요청 헤더**: 없음
- **응답 (200)**:
  ```json
  {
    "notes": ["문서명", "폴더/문서명", "폴더/하위폴더/문서명"]
  }
  ```
- **응답 (500)**: `{ "error": "파일 목록을 불러오지 못했습니다." }`

#### GET /api/notes/:name
- **설명**: 지정한 이름의 `.md` 파일 내용을 반환한다.
- **경로 파라미터**: `name` — 문서 경로 (URL 인코딩 필요)
- **응답 (200)**:
  ```json
  { "name": "안전화된-이름", "content": "# Markdown 내용..." }
  ```
- **응답 (400)**: `{ "error": "파일 이름이 올바르지 않습니다." }` — 이름 검증 실패
- **응답 (404)**: `{ "error": "파일을 찾을 수 없습니다." }`

#### POST /api/notes
- **설명**: 새 `.md` 파일을 생성하거나 기존 파일을 덮어쓴다. 중간 디렉토리는 자동 생성된다.
- **요청 본문**:
  ```json
  { "name": "폴더/문서명", "content": "# 내용" }
  ```
- **응답 (200)**: `{ "name": "안전화된-이름" }`
- **응답 (400)**: `{ "error": "파일 이름이 필요합니다." }`
- **응답 (500)**: `{ "error": "파일을 저장하지 못했습니다." }`

#### DELETE /api/notes/:name
- **설명**: 지정한 `.md` 파일을 삭제한다.
- **경로 파라미터**: `name` — 문서 경로 (URL 인코딩 필요)
- **응답 (200)**: `{ "name": "삭제된-파일-이름" }`
- **응답 (400)**: `{ "error": "파일 이름이 올바르지 않습니다." }`
- **응답 (404)**: `{ "error": "파일을 찾을 수 없습니다." }`

#### PUT /api/notes/:name/rename
- **설명**: 파일을 다른 경로로 이동(이름 변경 포함)한다. 대상 경로가 이미 존재하면 409를 반환한다.
- **경로 파라미터**: `name` — 원본 문서 경로
- **요청 본문**:
  ```json
  { "newName": "새폴더/새이름" }
  ```
- **응답 (200)**: `{ "name": "새-안전화된-이름" }`
- **응답 (400)**: `{ "error": "파일 이름이 올바르지 않습니다." }`
- **응답 (409)**: `{ "error": "이미 존재하는 이름입니다." }`
- **응답 (500)**: `{ "error": "파일을 이동하지 못했습니다." }`

#### POST /api/notes/:name/copy
- **설명**: 지정 파일을 새 이름으로 복사한다.
- **경로 파라미터**: `name` — 원본 문서 경로
- **요청 본문**:
  ```json
  { "targetName": "복사본-이름" }
  ```
- **응답 (200)**: `{ "name": "복사된-파일-이름" }`
- **응답 (400)**: `{ "error": "파일 이름이 올바르지 않습니다." }`
- **응답 (500)**: `{ "error": "파일을 복사하지 못했습니다." }`

### 3.2 폴더(Folders) API

#### GET /api/folders
- **설명**: notes 디렉토리 아래 모든 하위 디렉토리 목록을 재귀 탐색하여 반환한다.
- **응답 (200)**:
  ```json
  { "folders": ["폴더명", "폴더명/하위폴더명"] }
  ```
- **응답 (500)**: `{ "error": "폴더 목록을 불러오지 못했습니다." }`

#### POST /api/folders
- **설명**: 새 폴더를 생성한다. 이미 존재하는 경우 409를 반환한다.
- **요청 본문**:
  ```json
  { "path": "새폴더/하위폴더" }
  ```
- **응답 (200)**: `{ "path": "안전화된-폴더-경로" }`
- **응답 (400)**: `{ "error": "폴더 경로가 필요합니다." }`
- **응답 (409)**: `{ "error": "이미 존재하는 폴더입니다." }`
- **응답 (500)**: `{ "error": "폴더를 만들지 못했습니다." }`

#### DELETE /api/folders/*
- **설명**: 폴더와 그 하위 내용을 모두 재귀 삭제한다. (`fs.rm` with `recursive: true, force: false`)
- **경로 파라미터**: 와일드카드로 폴더 경로를 받음 (`req.params[0]`)
- **응답 (200)**: `{ "path": "삭제된-폴더-경로" }`
- **응답 (400)**: `{ "error": "폴더 경로가 올바르지 않습니다." }`
- **응답 (404)**: `{ "error": "폴더를 찾을 수 없습니다." }`
- **응답 (500)**: `{ "error": "폴더를 삭제하지 못했습니다." }`

#### PUT /api/folders/rename
- **설명**: 폴더를 다른 경로로 이동(이름 변경)한다. 원본 미존재 시 404, 대상 기존재 시 409를 반환한다.
- **요청 본문**:
  ```json
  { "from": "기존폴더경로", "to": "새폴더경로" }
  ```
- **응답 (200)**: `{ "path": "새-폴더-경로" }`
- **응답 (400)**: `{ "error": "폴더 경로가 올바르지 않습니다." }`
- **응답 (404)**: `{ "error": "폴더를 찾을 수 없습니다." }`
- **응답 (409)**: `{ "error": "이미 존재하는 폴더입니다." }`
- **응답 (500)**: `{ "error": "폴더를 이동하지 못했습니다." }`

### 3.3 검색 API

#### GET /api/search?q=검색어
- **설명**: 전체 문서를 탐색하여 파일명 또는 본문에 검색어가 포함된 문서 목록을 반환한다. 검색은 대소문자를 구분하지 않는다 (`.toLowerCase()` 비교).
- **쿼리 파라미터**: `q` — 검색어 문자열
- **응답 (200)**:
  ```json
  { "results": [{ "name": "일치하는-문서명" }] }
  ```
- **응답 (500)**: `{ "error": "검색에 실패했습니다." }`

### 3.4 AI API

#### POST /api/tags/auto
- **설명**: 문서 본문을 OpenAI Chat Completions API에 전달하여 태그 최대 5개를 생성한다. LangSmith가 설정된 경우 실행 추적을 기록한다.
- **요청 본문**:
  ```json
  { "content": "Markdown 문서 전체 본문" }
  ```
- **사용 모델**: `OPENAI_MODEL` 환경 변수 값 (기본값: `gpt-4o-mini`)
- **temperature**: 0.4
- **시스템 프롬프트 요약**: AI 기술 전문 블로그 편집장 역할로 핵심 기술 태그 5개 추출, 쉼표 구분 출력, 추가 설명 금지
- **응답 (200)**:
  ```json
  { "tags": ["태그1", "태그2", "태그3"] }
  ```
- **응답 (400)**: 내용 없음 또는 API 키 미설정 시
- **응답 (500)**: OpenAI API 오류 또는 내부 오류

#### POST /api/ai/ask
- **설명**: 문서 본문과 사용자 질문을 OpenAI에 전달하여 Markdown 형식의 답변을 생성한다. 답변은 클라이언트 측에서 문서 본문 끝에 추가된다. LangSmith 추적을 기록한다.
- **요청 본문**:
  ```json
  { "content": "문서 본문", "question": "질문 내용" }
  ```
- **사용 모델**: `OPENAI_MODEL` 환경 변수 값 (기본값: `gpt-4o-mini`)
- **temperature**: 0.3
- **시스템 프롬프트 요약**: 제공된 문서를 기반으로 질문에 답하는 도우미, 간결한 Markdown으로 작성
- **응답 (200)**:
  ```json
  { "answer": "## 답변 내용..." }
  ```
- **응답 (400)**: 내용/질문 없음 또는 API 키 미설정 시
- **응답 (500)**: OpenAI API 오류 또는 내부 오류

---

## 4. 서버 핵심 함수 상세

### 4.1 경로 처리 유틸리티

#### `sanitizeSegment(segment: string): string`
- **입력**: 경로의 단일 세그먼트 문자열
- **처리**: Unicode NFC 정규화 → `<>:"|?*\u0000-\u001F` 문자 제거 → 앞뒤 공백 제거
- **반환**: 정제된 세그먼트 문자열
- **목적**: 파일 시스템에 안전한 경로 세그먼트 생성

#### `normalizeNotePath(input: any): string | null`
- **입력**: 임의의 값 (문서 이름 후보)
- **처리**:
  1. null/undefined 체크 → null 반환
  2. `toString()`, NFC 정규화, 앞뒤 공백 제거, 백슬래시를 슬래시로 변환
  3. `..` 포함 여부 검사 → 포함 시 null 반환 (디렉토리 순회 방지)
  4. `/`로 분리 후 각 세그먼트에 `sanitizeSegment` 적용, 빈 세그먼트 제거
  5. 빈 배열이면 null 반환
- **반환**: 정규화된 상대 경로 문자열 또는 null

#### `normalizeFolderPath(input: any): string | null`
- `normalizeNotePath`와 동일한 로직. 폴더 경로용으로 별도 정의됨.

#### `resolveNotePath(name: string): { safe: string, filePath: string } | null`
- **입력**: 문서 이름
- **처리**: `normalizeNotePath` 실행 후 null이면 null 반환. 아니면 `NOTES_DIR + '/' + safe + '.md'` 절대 경로를 계산.
- **반환**: `{ safe: 정규화된이름, filePath: 절대파일경로 }` 또는 null

#### `resolveFolderPath(folder: string): { safe: string, dirPath: string } | null`
- **입력**: 폴더 경로
- **처리**: `normalizeFolderPath` 실행 후 `NOTES_DIR + '/' + safe` 절대 경로 계산
- **반환**: `{ safe: 정규화된경로, dirPath: 절대디렉토리경로 }` 또는 null

### 4.2 파일 탐색 함수

#### `readDirSafe(dir: string): Promise<Dirent[]>`
- **입력**: 디렉토리 절대 경로
- **처리**: `fs.readdir(dir, { withFileTypes: true })` 호출. `ENOENT` 오류 시 빈 배열 반환, 그 외 오류는 throw.
- **반환**: `Dirent` 배열

#### `listNotes(dir?: string, prefix?: string): Promise<string[]>`
- **입력**: 탐색 시작 디렉토리 (기본: `NOTES_DIR`), 현재까지의 경로 접두사
- **처리**: `readDirSafe`로 항목 나열 → 디렉토리이면 재귀 호출 → `.md` 파일이면 이름에서 `.md` 제거 후 prefix 결합
- **반환**: 전체 `.md` 문서 이름 목록 (상대 경로 형식, 확장자 없음)

#### `listFolders(dir?: string, prefix?: string): Promise<string[]>`
- **입력**: 탐색 시작 디렉토리, 경로 접두사
- **처리**: `readDirSafe`로 디렉토리 항목만 수집 → 재귀 탐색
- **반환**: 전체 폴더 경로 목록 (상대 경로 형식)

#### `listNoteEntries(): Promise<{name: string, filePath: string}[]>`
- **처리**: `listNotes()` 결과를 순회하며 각 항목에 절대 파일 경로를 추가
- **반환**: 이름 + 절대경로 쌍의 배열 (검색 API에서 사용)

### 4.3 AI/LangSmith 유틸리티

#### `parseTagResponse(raw: string): string[]`
- **입력**: OpenAI 응답 원문 문자열
- **처리**:
  1. JSON 파싱 시도 → 배열이면 사용
  2. 실패 시 `\n` 또는 `,`로 분리
  3. 각 태그를 `normalizeTagValue`로 정제 (공백, 특수문자, `#` 제거)
  4. 길이 30 초과 제거, `.!?\n` 포함 제거
  5. `Set`으로 중복 제거 후 최대 5개 반환
- **반환**: 정제된 태그 문자열 배열 (최대 5개)

#### `normalizeTagValue(value: string): string`
- **처리**: NFC 정규화 → `#` 접두사 제거 → `"'``[]{}()<>` 문자 제거 → 앞뒤 공백 제거

#### `updateLangsmithRun(runId: string, payload: object): Promise<void>`
- **입력**: LangSmith run ID, 업데이트 페이로드
- **처리**: `langsmithClient`가 null이거나 `runId`가 없으면 즉시 반환. 아니면 `langsmithClient.updateRun(runId, payload)` 호출. 오류는 console.warn으로만 처리.

---

## 5. MCP 서버 설계

### 5.1 개요

`mcp-server.js`는 Model Context Protocol(MCP)을 구현한 stdio 기반 서버다. Claude Desktop이나 다른 MCP 클라이언트가 이 서버를 통해 notes 폴더의 파일을 직접 읽고 쓸 수 있다.

- **서버 이름**: `obsidian-like-editor`
- **버전**: `1.0.0`
- **트랜스포트**: `StdioServerTransport` (stdin/stdout)
- **실행 방법**: `npm run mcp` (node mcp-server.js)

### 5.2 제공 도구(Tools) 목록

| 도구 이름 | 설명 | 필수 파라미터 |
|---|---|---|
| `create_note` | 새 Markdown 문서 생성 또는 덮어쓰기 | `name`, `content` |
| `update_note` | 기존 문서 덮어쓰기 (없으면 생성) | `name`, `content` |
| `append_note` | 기존 문서 끝에 내용 추가 (없으면 생성) | `name`, `content` |
| `list_notes` | 전체 문서 이름 목록 반환 | 없음 |
| `search_notes` | 제목/내용 검색 | `query` |

### 5.3 도구별 동작 상세

#### `create_note` / `update_note`
- `resolveNotePath`로 경로 검증
- `fs.mkdir(dirname, { recursive: true })`로 중간 디렉토리 자동 생성
- `fs.writeFile`로 내용 덮어쓰기
- 성공 시: `"문서를 저장했습니다: {name}"` 또는 `"문서를 업데이트했습니다: {name}"` 반환

#### `append_note`
- 경로 검증 동일
- `fs.appendFile`로 파일 끝에 내용 추가
- 성공 시: `"문서에 내용을 추가했습니다: {name}"` 반환

#### `list_notes`
- `ensureNotesDir()`로 디렉토리 존재 확인
- `listNotesRecursive(NOTES_DIR)`로 전체 `.md` 파일 탐색 (대소문자 무관 `.md$` 매칭)
- 한국어 로케일 기준 알파벳 정렬
- 성공 시: `{ "notes": [...] }` JSON 문자열 반환

#### `search_notes`
- 검색어 없으면 오류 반환
- 전체 파일 순회하며 파일명 및 본문에서 소문자 비교로 검색어 포함 여부 확인
- 매칭된 파일 이름 목록을 한국어 로케일 정렬하여 반환
- 성공 시: `{ "matches": [...] }` JSON 문자열 반환

#### `listNotesRecursive(dir: string): Promise<string[]>` (내부 함수)
- `fs.readdir(dir, { withFileTypes: true })`로 항목 나열
- 디렉토리면 재귀 탐색, `.md`로 끝나는 파일이면 절대 경로를 수집
- **웹 서버의 `listNotes`와 차이점**: 절대 경로를 반환하며, MCP 서버에서만 사용

---

## 6. 프론트엔드 설계

### 6.1 아키텍처 특징

- 단일 HTML 파일(`index.html`) + 단일 JS 파일(`app.js`)로 구성된 SPA
- 프레임워크 미사용 (바닐라 JavaScript)
- 외부 라이브러리: CDN을 통해 `marked.js` 로드 (Markdown → HTML 변환)
- 상태는 모두 모듈 레벨 변수에 저장됨 (리액티브 시스템 없음)

### 6.2 전역 상태 변수

| 변수명 | 타입 | 설명 |
|---|---|---|
| `currentNote` | `string \| null` | 현재 편집 중인 문서 이름 |
| `isBold` | `boolean` | 굵게 표시 토글 상태 |
| `isSpellcheck` | `boolean` | 맞춤법 검사 토글 상태 (기본 true) |
| `isDirty` | `boolean` | 미저장 변경사항 존재 여부 |
| `autosaveTimer` | `number \| null` | 자동 저장 타이머 ID |
| `allNotes` | `string[]` | 서버에서 로드한 전체 문서 목록 |
| `allFolders` | `string[]` | 서버에서 로드한 전체 폴더 목록 |
| `favorites` | `string[]` | 즐겨찾기 문서 이름 목록 |
| `recents` | `string[]` | 최근 열람 문서 목록 (최대 6개) |
| `docSearchQuery` | `string` | 현재 문서 내 검색어 |
| `docSearchMatches` | `number[]` | 검색어 일치 위치(인덱스) 배열 |
| `docSearchIndex` | `number` | 현재 선택된 검색 결과 인덱스 |
| `viewMode` | `"edit" \| "split" \| "preview"` | 편집기 보기 모드 (기본 "split") |
| `isNameComposing` | `boolean` | IME 조합 중 여부 (한국어 입력 처리) |
| `tagsByNote` | `{[name: string]: string[]}` | 문서별 태그 맵 |
| `activeTagFilter` | `string` | 현재 활성화된 태그 필터 |
| `colorsByNote` | `{[name: string]: string}` | 문서별 색상 코드 맵 |
| `colorsByFolder` | `{[path: string]: string}` | 폴더별 색상 코드 맵 |

### 6.3 상수

| 상수명 | 값 | 설명 |
|---|---|---|
| `AUTO_SAVE_DELAY` | `800` | 자동 저장 딜레이 (밀리초) |
| `RECENT_LIMIT` | `6` | 최근 문서 최대 보관 수 |
| `FAVORITES_KEY` | `"notes.favorites"` | localStorage 키 |
| `RECENTS_KEY` | `"notes.recents"` | localStorage 키 |
| `TAGS_KEY` | `"notes.tags"` | localStorage 키 |
| `COLORS_KEY` | `"notes.colors"` | localStorage 키 |
| `CUSTOM_TEMPLATES_KEY` | `"notes.templates"` | localStorage 키 |
| `VERSION_KEY_PREFIX` | `"notes.versions."` | localStorage 키 접두사 |
| `VERSION_LIMIT` | `20` | 버전 히스토리 최대 보관 수 |

---

## 7. 프론트엔드 함수 상세

### 7.1 UI 토스트 알림

#### `showToast(message: string, type?: string, duration?: number): void`
- **입력**: 메시지, 유형(`info`|`success`|`warning`|`error`, 기본 `info`), 표시 시간(ms, 기본 3000)
- **처리**: `toast-container` DOM에 toast div 추가 → `requestAnimationFrame`으로 `.show` 클래스 추가(트랜지션 트리거) → `duration` 후 `.show` 제거 → `transitionend` 이벤트 후 DOM 제거

### 7.2 localStorage 관련 함수

#### `loadStoredList(key: string): string[]`
- `localStorage.getItem(key)` → JSON 파싱 → 배열 아니면 `[]` 반환. 오류 시 `[]`

#### `saveStoredList(key: string, list: string[]): void`
- `localStorage.setItem(key, JSON.stringify(list))`

#### `loadTagsMap(): {[name: string]: string[]}`
- `TAGS_KEY`에서 JSON 로드. 객체 아니면 `{}` 반환.

#### `saveTagsMap(map): void`
- `TAGS_KEY`에 JSON 저장

#### `loadColorsMap(): { notes: {}, folders: {} }`
- `COLORS_KEY`에서 JSON 로드. notes와 folders 속성이 없으면 빈 객체로 초기화.

#### `saveColorsMap(notesMap, foldersMap): void`
- `COLORS_KEY`에 `{ notes, folders }` JSON 저장

### 7.3 버전 히스토리 관련 함수

#### `loadVersions(name: string): {timestamp: string, content: string}[]`
- `notes.versions.<name>` 키에서 배열 로드

#### `saveVersions(name: string, versions): void`
- `notes.versions.<name>` 키에 저장

#### `addVersion(name: string, content: string): void`
- **처리**: 최신 버전과 내용이 동일하면 저장하지 않음. 아니면 `{timestamp: ISO문자열, content}` 앞에 추가 후 `VERSION_LIMIT`(20)개로 잘라냄. 현재 열린 문서이면 `renderHistoryList` 호출.

#### `renameVersionsKey(oldName: string, newName: string): void`
- 구버전 키의 데이터를 신버전 키로 이동. 구버전 키 삭제.

#### `removeVersionsKey(name: string): void`
- `notes.versions.<name>` 키 삭제

#### `renderHistoryList(versions?): void`
- **처리**: `historyList` DOM 초기화. `currentNote` 없으면 "문서를 선택하세요." 표시. `versions` 없으면 "저장된 버전이 없습니다." 표시. 각 버전마다 `<li class="history-item">`을 생성:
  - `<time>`: 타임스탬프 → `toLocaleString()` 변환
  - `<p>`: 내용 공백 압축 후 80자 미리보기
  - 복원 버튼: 클릭 시 `editor.value`를 해당 버전으로 교체하고 `markDirty()`, `scheduleAutosave()` 호출

### 7.4 API 통신 함수

#### `fetchNotes(): Promise<void>`
- **처리**: `/api/notes`와 `/api/folders`를 `Promise.all`로 병렬 호출 → `allNotes`, `allFolders` 업데이트 → 태그/색상 맵 정제(삭제된 문서 항목 제거) → `renderFilteredNoteTree`, `renderFavoriteList`, `renderRecentList`, `renderTagSidebar`, `renderNoteTags` 순차 호출

#### `loadNote(name: string): Promise<void>`
- **처리**: `GET /api/notes/<encodedName>` → 성공 시 `currentNote` 설정, 에디터 내용 교체, `renderPreview`, `updateRecent`, `renderHistoryList`, `renderNoteTags` 호출

#### `saveNote({ silent?: boolean } = {}): Promise<boolean>`
- **처리**: `currentNote` 없으면 조기 반환. `setSaveStatus("saving")` → `POST /api/notes` → 성공 시 `markSaved()`, `addVersion()` 호출. 실패 시 `setSaveStatus("dirty")`.

#### `createNoteByName(name: string, { content?, focus? }): Promise<string | null>`
- **처리**: `POST /api/notes` → 태그맵에 빈 배열 초기화 → `fetchNotes()` → `focus` 옵션이 true이면 `loadNote(createdName)` 호출.

#### `renameNote(name, newName): Promise<string | null>`
- `PUT /api/notes/<name>/rename` 호출. 성공 시 새 이름 반환.

#### `copyNote(name, targetName): Promise<string | null>`
- `POST /api/notes/<name>/copy` 호출. 성공 시 복사된 이름 반환.

#### `deleteNote(name): Promise<boolean>`
- `DELETE /api/notes/<name>` 호출. 성공 여부 반환.

#### `createFolder(folderPath): Promise<string | null>`
- `POST /api/folders` 호출. 성공 시 경로 반환.

#### `renameFolder(from, to): Promise<string | null>`
- `PUT /api/folders/rename` 호출. 성공 시 새 경로 반환.

#### `deleteFolder(folderPath): Promise<boolean>`
- `DELETE /api/folders/<encodedPath>` 호출. 성공 여부 반환.

### 7.5 문서 트리 렌더링

#### `buildNoteTree(notes: string[], folders: string[]): TreeNode`
- **처리**: 빈 `{ folders: Map, files: [] }` 루트 노드 생성 → folders를 먼저 순회하며 트리 노드 생성(없는 중간 노드는 자동 생성) → notes를 순회하며 경로 마지막 세그먼트 앞 폴더를 찾아 `files`에 추가
- **반환**: 계층형 트리 노드 객체

#### `renderTree(node: TreeNode, container: HTMLElement, basePath?: string): void`
- **처리**: 폴더 이름을 알파벳 정렬 후 각 폴더에 대해:
  - `<li class="folder-item">` 생성
  - `<div class="folder-label">`: 폴더 이름 표시, 색상 적용, 하위 메뉴(문서생성/폴더생성/이름변경/색상/삭제) 버튼 추가
  - 드래그오버/드랍 이벤트 등록 (파일 드롭 또는 문서 이동)
  - 클릭 시 `folder-children`의 `collapsed` 토글
  - 재귀적으로 하위 노드 렌더링
- 파일은 `createNoteListItem` 호출 (star, actions 포함)

#### `createNoteListItem(name, options): HTMLLIElement`
- **옵션**: `showStar`, `showActions`, `displayName`, `showTags`
- **처리**:
  - `draggable=true`, `dragstart`/`dragend` 이벤트 등록
  - 문서 이름(색상 적용), 태그 chip 목록 렌더링
  - `showActions` true이면 이름변경/색상/삭제 버튼 추가
  - `showStar` true이면 즐겨찾기 별 버튼 추가 (현재 즐겨찾기 상태 반영)
  - 클릭 시 `loadNote(name)` 호출

#### `renderNoteList(notes, folders): void`
- `noteList.innerHTML` 초기화 후 `buildNoteTree` + `renderTree` 호출
- 첫 호출 시 루트 폴더 트리(`noteList`)에 드롭 이벤트 등록 (한 번만)

#### `renderFilteredNoteTree(): void`
- `activeTagFilter`가 있으면 해당 태그를 가진 문서만 필터, 관련 폴더만 표시
- `activeTagFilter`가 없으면 전체 목록 표시

### 7.6 태그 관련 함수

#### `renderTagSidebar(): void`
- 전체 문서의 태그 빈도수 계산(Map) → 알파벳 정렬하여 `<li>` 생성
- `activeTagFilter`와 일치하면 `active` 클래스 추가
- 클릭 시 `activeTagFilter` 토글 및 `renderFilteredNoteTree()` 호출

#### `renderNoteTags(): void`
- `currentNote`가 없으면 "문서를 선택하세요." 표시
- 태그가 있으면 각 태그마다 `.tag-chip` span 생성 + `×` 삭제 버튼 추가

#### `addTagsToCurrentNote(tagsToAdd: string[]): void`
- 현재 태그와 병합(Set으로 중복 제거) → `setNoteTags` → `renderNoteTags`, `renderTagSidebar`, `renderFilteredNoteTree` 호출

#### `requestAutoTags(): Promise<void>`
- `autoTagBtn` 비활성화 → 상태를 "로딩"으로 표시 → `POST /api/tags/auto` 호출 → 응답 태그를 `normalizeTag` 적용 후 `addTagsToCurrentNote` → 성공/실패 상태 업데이트 → 버튼 재활성화

#### `parseTagsInput(value: string): string[]`
- 공백/쉼표로 분리 → 각 항목에 `normalizeTag` 적용 → 중복 제거 → 빈 값 제거

### 7.7 AI 질문 함수

#### `requestAiAnswer(): Promise<void>`
- `window.prompt`로 질문 입력 받음 → `aiAskBtn` 비활성화 → `POST /api/ai/ask` 호출 → 성공 시 `appendAiAnswer` 호출

#### `appendAiAnswer(question: string, answer: string): void`
- **처리**: 에디터 내용이 있으면 `\n\n---\n\n` 구분선 추가, 다음 형식의 블록을 에디터 끝에 추가:
  ```markdown
  ### AI 질문 (2026-04-04 ...)
  - 질문: {question}
  
  #### 답변
  {answer}
  ```
- `renderPreview`, `markDirty`, `scheduleAutosave` 호출

### 7.8 문서 내 검색

#### `findDocMatches(): void`
- `docSearchQuery`가 없으면 매칭 초기화 후 반환
- `editor.value`를 소문자로 변환 후 `indexOf` 루프로 모든 일치 위치(인덱스) 수집 → `docSearchMatches` 업데이트 → `renderPreview(content, docSearchQuery)` → `selectDocMatch()` 호출

#### `selectDocMatch(): void`
- `docSearchMatches[docSearchIndex]`의 위치를 `editor.setSelectionRange`로 선택
- `requestAnimationFrame`으로 에디터 스크롤 위치 계산 (`lineHeight` 기반):
  - 줄 높이를 `getComputedStyle`으로 가져와 `lineIndex * lineHeight - clientHeight * 0.3` 위치로 스크롤
  - 줄 높이를 가져올 수 없으면 전체 길이 대비 비율로 스크롤 위치 추정
- `scrollPreviewToMatch`: preview 영역의 `<mark>` 태그를 `scrollIntoView({ block: "center" })`로 스크롤

#### `moveDocMatch(direction: -1 | 1): void`
- `(docSearchIndex + direction + length) % length`로 순환 이동 → `selectDocMatch()`

### 7.9 Markdown 렌더링

#### `renderPreview(content: string, highlightQuery?: string): void`
- `window.marked` 존재 시: `marked.parse(content)` 호출 → `highlightQuery`가 있으면 정규식으로 `<mark>` 태그 삽입 → `preview.innerHTML` 설정 → `syncPreviewTaskCheckboxes`
- `window.marked` 없을 시: `renderMarkdownFallback` 호출

#### `renderMarkdownFallback(content: string, highlightQuery?: string): string`
- 줄 단위 파싱:
  - `#` ~ `######`: `<h1>` ~ `<h6>` 생성
  - `- ` 또는 `* `: `<ul><li>` 생성 (연속 항목은 같은 `<ul>` 유지)
  - `숫자.`: `<ol><li>` 생성
  - 빈 줄: 무시
  - 나머지: `<p>` 생성
- `highlightQuery` 있으면 `<mark>` 삽입
- **주의**: `marked.js` 로드 실패 시 폴백으로만 사용됨

### 7.10 체크박스 태스크 처리

#### `getTaskLines(content: string): {lineIndex: number, checked: boolean}[]`
- `- [ ]` / `- [x]` / `* [ ]` / `1. [ ]` 패턴을 각 줄에서 탐색
- 줄 인덱스와 체크 여부를 반환

#### `toggleTaskAtIndex(content: string, taskIndex: number, isChecked: boolean): string`
- 지정 인덱스의 태스크 항목에서 `[ ]` ↔ `[x]` 토글하여 새 content 반환

#### `syncPreviewTaskCheckboxes(content: string): void`
- preview 내 `input[type="checkbox"]`를 탐색하여 `disabled` 해제, `data-task-index` 설정, 체크 상태 동기화

preview 영역의 체크박스 `change` 이벤트에서 `toggleTaskAtIndex`를 호출하여 에디터의 내용을 실시간으로 업데이트한다.

### 7.11 편집기 스타일 제어

#### `applyEditorStyles(): void`
- `fontSizeSelect.value`로 `editor.style.fontSize` 설정
- `fontColorInput.value`로 `editor.style.color` 설정
- `isBold`에 따라 `editor.style.fontWeight` 700/400 설정, `boldToggle`의 `active` 클래스 토글

#### `applySpellcheck(): void`
- `isSpellcheck` 상태를 `editor.spellcheck`와 `spellcheck` 속성에 반영
- `spellToggle`의 `active` 클래스 토글

### 7.12 보기 모드 제어

#### `setViewMode(mode: "edit" | "split" | "preview"): void`
- `editorPane`에서 `view-edit`, `view-split`, `view-preview` 클래스를 모두 제거 후 `view-${mode}` 추가
- 각 토글 버튼의 `active` 클래스 업데이트
- CSS가 `view-edit`이면 preview 숨김, `view-preview`이면 textarea 숨김

### 7.13 저장 상태 관리

#### `setSaveStatus(state: string, text: string): void`
- `saveStatus` 요소의 텍스트 변경, `saving`/`dirty`/`saved` 클래스 교체

#### `markDirty(): void`
- `isDirty = true`, `setSaveStatus("dirty", "변경 있음")`

#### `markSaved(): void`
- `isDirty = false`, `setSaveStatus("saved", "저장됨")`

#### `scheduleAutosave(): void`
- 기존 타이머 취소 후 `AUTO_SAVE_DELAY`(800ms) 후 `isDirty`이면 `saveNote({ silent: true })` 호출

### 7.14 템플릿 관련 함수

#### `loadCustomTemplates(): Template[]`
- `CUSTOM_TEMPLATES_KEY`에서 로드. `id`, `label`, `content`가 모두 문자열인 항목만 유효.

#### `saveCustomTemplates(list): void`
- `CUSTOM_TEMPLATES_KEY`에 저장

#### `getAllTemplates(): Template[]`
- `defaultTemplates`(3개) + `customTemplates` 결합

#### `addCustomTemplate(label: string, content: string): string | null`
- 레이블/내용 공백 제거 후 검증 → `custom-${Date.now()}` ID 생성 → `customTemplates` 업데이트 및 저장 → `populateTemplates()` 호출 → ID 반환

#### `populateTemplates(): void`
- `templateSelect` DOM 초기화 후 `getAllTemplates()` 순회하며 `<option>` 추가

#### `insertTemplateContent(content: string): void`
- `editor.selectionStart`/`selectionEnd` 위치에 내용 삽입 (선택 영역 교체)
- 커서를 삽입된 내용 끝으로 이동
- `renderPreview`, `markDirty`, `scheduleAutosave` 호출

### 7.15 파일 가져오기(Import)

#### `importFilesToFolder(files: FileList, folderPath: string): Promise<void>`
- `ALLOWED_IMPORT_EXTENSIONS`(`.md`, `.markdown`, `.mdown`, `.mkd`, `.txt`) 확장자 또는 `text/` MIME 타입 파일만 처리
- 가져올 수 없는 파일은 경고 토스트 후 건너뜀
- 유효한 각 파일에 대해 `file.text()`로 내용 읽기 → `POST /api/notes` 저장
- 성공 수에 따라 완료 토스트 표시 → `fetchNotes()` 호출

#### `isImportableFile(file: File): boolean`
- `file.type.startsWith("text/")` 이거나 확장자가 `ALLOWED_IMPORT_EXTENSIONS`에 포함

### 7.16 드래그 앤 드롭

- 각 문서 항목은 `draggable=true`로 설정
- `dragstart`: `event.dataTransfer.setData("text/plain", name)`으로 문서 이름 전달, `dragging` 클래스 추가
- `dragend`: `dragging` 클래스 제거
- 폴더 레이블 및 루트 목록의 `dragover`/`dragleave`/`drop` 이벤트 등록:
  - `files`가 있으면 `importFilesToFolder` 호출
  - `files`가 없으면 `moveNoteToFolder` 호출

#### `moveNoteToFolder(name: string, folderPath: string): Promise<void>`
- 문서의 기본 이름(경로의 마지막 세그먼트)을 추출하여 `folderPath/baseName`으로 이름 변경
- `renameNote` 후 `applyRenamedNote` 호출

### 7.17 색상 피커

#### `openColorPicker(message: string, defaultValue: string): Promise<string | null>`
- DOM으로 오버레이(`color-picker-overlay`) + 패널(`color-picker-panel`) 동적 생성
- 색상 input(`<input type="color">`)과 HEX 텍스트 input 동기화
- "기본색" 버튼: 텍스트 input 비우기
- "취소" 버튼 또는 오버레이 클릭: `null` resolve
- "적용" 버튼 또는 Enter: 텍스트 input 값 resolve
- ESC: `null` resolve

### 7.18 이름 변경 및 폴더 관련 핸들러

#### `applyRenamedNote(oldName, newName): Promise<void>`
- favorites, recents 목록에서 이름 교체
- localStorage에 저장
- 버전 히스토리 키 이름 변경 (`renameVersionsKey`)
- 태그맵과 색상맵에서 키 이름 변경
- `currentNote`가 변경 대상이면 업데이트

#### `handleRenameFolder(folderPath): Promise<void>`
- `promptForName`으로 새 경로 입력 → `renameFolder` API 호출 → favorites, recents의 폴더 접두사 교체 → `renameFolderVersions`, `replaceFolderPrefixInTags`, `replaceFolderPrefixInColors` 호출 → 현재 편집 중인 문서가 해당 폴더 하위이면 `currentNote` 업데이트

#### `handleDeleteFolder(folderPath): Promise<void>`
- `confirm`으로 삭제 확인 → `deleteFolder` API 호출 → favorites, recents에서 해당 폴더 항목 제거 → `removeFolderVersions`, `removeFolderTags`, `removeFolderColors` 호출 → 현재 편집 중인 문서가 해당 폴더 하위이면 에디터 초기화

### 7.19 키보드 단축키

| 단축키 | 동작 |
|---|---|
| Ctrl/Cmd + S | 현재 문서 저장 |
| Ctrl/Cmd + N | 새 문서 이름 입력란으로 포커스 |
| Ctrl/Cmd + F | 문서 내 검색 입력란으로 포커스 |
| Ctrl/Cmd + Shift + F | 전체 문서 검색 입력란으로 포커스 |
| Ctrl/Cmd + B | 굵게 토글 |
| Ctrl/Cmd + 1 | 편집 모드 |
| Ctrl/Cmd + 2 | 분할 모드 |
| Ctrl/Cmd + 3 | 미리보기 모드 |
| Ctrl/Cmd + Shift + H | 버전 히스토리 패널 토글 |
| Tab (에디터 내) | 공백 4칸 삽입 (기본 Tab 동작 방지) |
| Enter (검색어 활성화 시) | 다음 검색 결과로 이동 |

---

## 8. 화면 구성 상세

### 8.1 전체 레이아웃

```
┌──────────────────────────────────────────────────────────────┐
│                         .app (flexbox row)                   │
├─────────────────┬────────────────────────────────────────────┤
│  .sidebar       │  .editor (main)                            │
│  (width: 290px) │                                            │
│                 │  ┌──────────────────── .toolbar ────────┐  │
│                 │  │ 문서명 | 검색 | 보기 | 템플릿 | 포맷 | 저장 | AI │  │
│                 │  └────────────────────────────────────────┘  │
│                 │  ┌──────────────── .tag-panel ────────┐  │
│                 │  │ 태그: [chip] ... [입력] [추가] [자동태그] │  │
│                 │  └────────────────────────────────────────┘  │
│                 │  ┌──────────── #history-panel (hidden) ──┐  │
│                 │  └────────────────────────────────────────┘  │
│                 │  ┌──────────── .editor-pane ─────────────┐  │
│                 │  │ #editor (textarea) │ #preview (div)   │  │
│                 │  └────────────────────────────────────────┘  │
└─────────────────┴──────────────────────────────────────────────┘
                           (우측 상단: #toast-container)
```

### 8.2 사이드바 (.sidebar) 구성 요소

| 섹션 | 요소 | 설명 |
|---|---|---|
| 헤더 | `<h1>문서</h1>` | 사이드바 제목 |
| 새 문서 생성 | `.new-note`: 텍스트 input + "생성" 버튼 | 이름 입력 후 엔터 또는 버튼 클릭으로 생성 |
| 폴더 생성 | `.new-folder`: "폴더 생성" 버튼 | 클릭 시 `handleCreateFolder()` |
| 전체 검색 | `.search-box`: 텍스트 input + "검색" 버튼 | `GET /api/search` 호출 |
| 즐겨찾기 | `#favorite-list` | 즐겨찾기 문서 목록 |
| 태그 | `#tag-list.tag-list` + "해제" 버튼 | 전체 태그 목록 + 필터 기능 |
| 폴더 구조 | `#note-list.folder-tree` | 계층형 폴더/문서 트리 |
| 검색 결과 | `.search-results` > `#search-list` | 전체 검색 결과 |
| 최근 문서 | `#recent-list` | 최근 6개 문서 |

### 8.3 툴바 (.toolbar) 구성 요소

| 그룹 | 요소 | 동작 |
|---|---|---|
| 현재 문서 | `#current-note` span | 편집 중 문서 이름 표시 |
| 문서 내 검색 | `.find-controls`: input + 이전/다음 버튼 + `0/0` 카운터 | 에디터 내 검색 기능 |
| 보기 모드 | `.view-controls`: 편집/분할/미리보기 토글 버튼 | `setViewMode()` 호출 |
| 템플릿 | `.template-controls`: select + 삽입/저장 버튼 | 템플릿 삽입/저장 |
| 서식 | `.format-controls`: 글자크기 select + 색상 color input + 굵게/맞춤법 토글 | 에디터 스타일 변경 |
| 저장 | `.save-controls`: 저장 상태 span + 버전/저장 버튼 | 저장 상태 표시 및 수동 저장 |
| AI | `.ai-controls`: "AI 질문" 버튼 + 상태 span | AI 질문 기능 |

### 8.4 태그 패널 (.tag-panel) 구성 요소

- 현재 문서의 태그를 `.tag-chip`으로 표시 (각 chip에 `×` 삭제 버튼)
- 태그 텍스트 입력란 + "추가" 버튼 (Enter 또는 클릭)
- "자동 태그" 버튼 + 상태 메시지 (`loading`/`success`/`error` 색상 변화)

### 8.5 버전 히스토리 패널 (#history-panel)

- 기본 `hidden` 클래스 (숨김)
- 툴바 "버전" 버튼 클릭 또는 Ctrl+Shift+H로 토글
- 각 버전 항목(`.history-item`): 저장 시각, 80자 미리보기, "이 버전 복원" 버튼

### 8.6 에디터 패널 (.editor-pane)

- CSS Grid `grid-template-columns`로 분할 제어:
  - `view-split`: `1fr 1fr` (좌: textarea, 우: preview)
  - `view-edit`: `1fr`, preview `display: none`
  - `view-preview`: `1fr`, textarea `display: none`
- `#editor` (textarea): `spellcheck="true"`, `lang="ko"`, 기본 폰트 크기 16px
- `#preview` (div): marked.js로 렌더링된 HTML, 체크박스 인터랙션 지원

### 8.7 색상 커스터마이징

- 문서 이름 및 폴더 이름에 개별 색상 지정 가능
- "색상" 버튼 클릭 → `openColorPicker` 모달 오버레이 표시
- 오버레이: 반투명 배경(`rgba(15,23,42,0.45)`) + 중앙 패널
- 선택한 HEX 색상을 localStorage에 저장, 렌더링 시 `element.style.color`에 적용

### 8.8 토스트 알림 (#toast-container)

- 화면 우측 상단(`position: fixed, top: 16px, right: 16px`)에 표시
- 유형별 배경색: info(`#3b82f6`), success(`#10b981`), warning(`#f59e0b`/어두운 텍스트), error(`#ef4444`)
- 슬라이드인 애니메이션: `translateX(40px) → translateX(0)`, opacity `0 → 1`
- `duration` ms 후 역방향 애니메이션 후 DOM에서 제거

---

## 9. 데이터 흐름

### 9.1 애플리케이션 초기화 흐름

```
페이지 로드
  ↓
localStorage에서 favorites, recents, tagsByNote, colorsByNote, colorsByFolder 로드
  ↓
populateTemplates() → 기본 + 커스텀 템플릿을 select에 추가
  ↓
applyEditorStyles() → 에디터 폰트 크기/색상/굵기 적용
  ↓
applySpellcheck() → 맞춤법 검사 설정 적용
  ↓
setSaveStatus("saved", "저장됨")
  ↓
renderPreview("", "") → 빈 preview 렌더링
  ↓
setViewMode("split") → 분할 보기 모드 설정
  ↓
fetchNotes() → GET /api/notes + GET /api/folders 병렬 호출
  ↓
allNotes, allFolders 업데이트 → 태그/색상맵 정제
  ↓
renderFilteredNoteTree() → renderNoteList() → buildNoteTree() → renderTree()
renderFavoriteList() → 즐겨찾기 목록 렌더링
renderRecentList() → 최근 문서 목록 렌더링
renderTagSidebar() → 태그 사이드바 렌더링
renderNoteTags() → "문서를 선택하세요." 표시
```

### 9.2 문서 편집 및 자동 저장 흐름

```
사용자가 textarea에 입력
  ↓
editor "input" 이벤트 발생
  ↓
renderPreview(editor.value, docSearchQuery) → marked.parse 또는 fallback
  ↓
docSearchQuery가 있으면 findDocMatches() → 하이라이트 업데이트
  ↓
markDirty() → isDirty = true, saveStatus = "변경 있음"
  ↓
scheduleAutosave() → 800ms 디바운스 타이머 설정
  ↓ (800ms 후)
saveNote({ silent: true })
  → POST /api/notes { name: currentNote, content: editor.value }
  → 성공: markSaved(), addVersion(currentNote, content)
  → addVersion: 최신 버전과 동일하지 않으면 localStorage에 저장 (최대 20개)
```

### 9.3 자동 태그 생성 흐름

```
사용자가 "자동 태그" 버튼 클릭
  ↓
autoTagBtn 비활성화, 상태 "자동 태그 생성 중..." (파란색)
  ↓
POST /api/tags/auto { content: editor.value }
  ↓ (서버)
LangSmith createRun (LANGSMITH_API_KEY 있으면)
  ↓
POST https://api.openai.com/v1/chat/completions
  { model: gpt-4o-mini, temperature: 0.4, messages: [system, user] }
  ↓
parseTagResponse(raw) → JSON/쉼표 분리 → 정제 → 최대 5개
  ↓ (클라이언트)
normalizeTag 적용 → addTagsToCurrentNote(tags)
  ↓
setNoteTags, renderNoteTags, renderTagSidebar, renderFilteredNoteTree
  ↓
상태 "자동 태그 N개 추가" (초록색), autoTagBtn 재활성화
```

### 9.4 문서 이름 변경 흐름

```
사용자가 문서 "이름" 버튼 클릭
  ↓
handleRename(name) → promptForName("새 이름을 입력하세요", name)
  ↓
renameNote(name, newName) → PUT /api/notes/<name>/rename { newName }
  ↓
applyRenamedNote(oldName, newName)
  → favorites, recents에서 oldName → newName 교체, localStorage 저장
  → renameVersionsKey(oldName, newName) → localStorage 키 이전
  → tagsByNote, colorsByNote에서 키 이름 변경
  → currentNote가 oldName이면 newName으로 업데이트
  → fetchNotes() → 트리 재렌더링
```

---

## 10. 보안 설계

### 10.1 경로 순회 방지

서버에서 모든 파일 경로는 `normalizeNotePath` / `normalizeFolderPath` 함수를 거쳐 처리된다.

- `..` 포함 시 즉시 `null` 반환 → 400 응답
- `<>:"|?*\u0000-\u001F` 등 파일 시스템 위험 문자 제거
- 경로를 `NOTES_DIR` 하위로 강제 한정 (`path.join(NOTES_DIR, safe)`)

### 10.2 요청 크기 제한

- `express.json({ limit: "8mb" })` — JSON 요청 본문 최대 8MB

### 10.3 환경 변수 관리

- `.env` 파일을 통해 민감한 정보 관리
- `OPENAI_API_KEY`는 서버에서만 사용, 클라이언트에 노출 안 됨
- `LANGSMITH_API_KEY`가 없으면 LangSmith 기능 비활성화 (`langsmithClient = null`)

### 10.4 인증/권한

- **인증 없음**: 로컬 전용 애플리케이션으로 가정. 외부 접근에 대한 인증 미구현.
- CORS 설정 없음 (기본 Express 동작)

---

## 11. 에러 처리 전략

### 11.1 서버 측

- 각 라우트 핸들러가 `try-catch`로 감쌈
- `ENOENT`(파일/디렉토리 없음)는 404 반환, 나머지는 500 반환
- AI API 오류 시 OpenAI 원문 오류 메시지를 `detail` 필드에 포함하여 500 반환
- LangSmith 오류는 `console.warn`으로만 처리 (주 기능에 영향 없음)

### 11.2 클라이언트 측

- 모든 `fetch` 호출 후 `response.ok` 체크
- 오류 시 `showToast(message, "error")` 호출
- localStorage 읽기 오류는 `console.warn` 후 기본값 반환
- `window.marked` 로드 실패 시 `renderMarkdownFallback`으로 폴백
- AI 관련 버튼은 요청 중 `disabled` 처리, `finally`에서 반드시 재활성화

---

## 12. .ai-index 디렉토리

`/.ai-index/` 폴더는 코드베이스 외부 도구(벡터 검색 인덱서)가 생성한 캐시 디렉토리다.

- **index-meta.json**: 인덱싱된 파일의 메타데이터 (파일 경로, mtime, 청크 수, 콘텐츠 해시)
- **vectors.json**: 임베딩 벡터 데이터 (`Xenova/all-MiniLM-L6-v2` 모델, 384차원)
- 분석 대상 파일: `public/app.js`, `server.js`, `mcp-server.js` (총 199청크)
- 이 디렉토리는 애플리케이션 실행에 필요 없으며, 의미 검색 기능 전용

---

## 13. 환경 변수 설정

| 변수명 | 필수 여부 | 기본값 | 설명 |
|---|---|---|---|
| `PORT` | 선택 | `3000` | HTTP 서버 포트 |
| `OPENAI_API_KEY` | AI 기능 필수 | 없음 | OpenAI API 인증 키 |
| `OPENAI_MODEL` | 선택 | `gpt-4o-mini` | 사용할 OpenAI 모델 ID |
| `LANGSMITH_API_KEY` | 선택 | 없음 | LangSmith 추적 API 키 |
| `LANGSMITH_ENDPOINT` | 선택 | LangSmith 기본값 | LangSmith API 엔드포인트 |
| `LANGSMITH_PROJECT` | 선택 | `obsidian-like-editor` | LangSmith 프로젝트명 |
