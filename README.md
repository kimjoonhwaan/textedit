# Markdown Editor

옵시디언 스타일의 다중 사용자 마크다운 노트 편집기입니다. Google OAuth 로그인, Google Drive 동기화, AI 보조 기능(자동 태그·문서 Q&A·PPT 변환), 위키링크·그래프·백링크를 지원합니다.

---

## 주요 기능

### 편집기
- Markdown 실시간 미리보기 (편집 / 분할 / 미리보기 모드 전환)
- 문서 내 검색 (이전/다음 하이라이트)
- 글꼴 크기·색상·굵기 설정
- 자동 저장 (변경 후 1초 디바운스)
- 버전 히스토리 (로컬 기록)
- 맞춤법 검사 (브라우저 spellcheck)

### 노트 관리
- 폴더 트리 구조 (중첩 폴더, 드래그 앤 드롭)
- 노트 생성·삭제·이름 변경·복사
- 즐겨찾기 고정
- 최근 문서 목록
- 전문 검색 (제목·본문)

### 위키링크 & 그래프
- `[[노트명]]` 문법으로 노트 간 연결
- D3.js 기반 인터랙티브 그래프 뷰 (연결 많은 순 / 최신 순 정렬, 태그 필터)
- 백링크 패널 (현재 노트를 참조하는 노트 목록)

### 태그
- 수동 태그 추가/삭제
- AI 자동 태그 추출 (OpenAI)
- 태그 기반 사이드바 필터

### Google Drive 통합
- OAuth 로그인 후 사용자 Drive의 `MarkdownEditor` 폴더와 동기화
- Drive 노트 목록 표시·열기·저장·삭제
- 로컬 노트를 Drive로 업로드
- Drive 전체 노트를 로컬로 일괄 동기화 (진행률 표시 모달)
- Google Docs 파일 읽기 전용 열람 (export로 텍스트 추출)

### AI 기능 (OpenAI)
- **자동 태그**: 문서 내용 기반 태그 5개 자동 추출
- **문서 Q&A**: 현재 문서를 컨텍스트로 자유 질문
- **PPT 변환**: 마크다운 → 구조화된 슬라이드 생성 (bullets / comparison / process / stat 4종 레이아웃), AI 요약 + 그래픽화, PPTX 다운로드, 발표자 노트 자동 첨부

### 템플릿
- 사용자 정의 템플릿 저장·삽입

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 런타임 | Node.js 20+ (ES Modules) |
| 백엔드 | Express 4.18, express-session |
| 인증/Drive | Google OAuth 2.0, googleapis SDK |
| AI | OpenAI Chat Completions API (`gpt-4o-mini`) |
| 프론트엔드 | 순수 HTML/CSS/JS (빌드 도구 없음) |
| 마크다운 | marked.js (CDN) |
| 그래프 | D3.js v7 (CDN) |
| PPT 생성 | PptxGenJS 3.12 (CDN) |
| XSS 방어 | DOMPurify (CDN) |
| MCP | stdio 기반 MCP 서버 (`mcp-server.js`) |

---

## 디렉토리 구조

```
proj08-textedit/
├── server.js              # Express 메인 서버 (라우트·미들웨어·마이그레이션)
├── mcp-server.js          # MCP 서버 (stdio, 외부 AI 도구에 노트 컨텍스트 제공)
├── package.json
├── .env                   # 환경변수 (gitignored)
├── .env.example           # 환경변수 템플릿
│
├── auth/
│   ├── google.js          # OAuth2 클라이언트 + 토큰 교환 + 사용자 정보 조회
│   ├── users.js           # 사용자 저장소 (data/users.json), AES-256-GCM 암호화
│   └── drive.js           # Drive API: 폴더 트리 탐색, 파일 CRUD, 미러링
│
├── data/                  # 사용자 메타데이터 (gitignored)
│   └── users.json
│
├── notes/                 # 노트 저장소 (gitignored)
│   └── u_<googleUserId>/  # 사용자별 격리 폴더
│
└── public/                # 정적 프론트엔드
    ├── index.html
    ├── app.js             # 모든 클라이언트 로직 (~3300줄)
    └── styles.css
```

---

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example`을 복사하여 `.env`를 작성합니다.

```bash
cp .env.example .env
```

| 변수 | 필수 | 설명 |
|---|---|---|
| `PORT` | - | 서버 포트 (기본 3000, 권장 3001) |
| `SESSION_SECRET` | ✅ | 32바이트 hex 시크릿 (세션 + 토큰 암호화) |
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth 2.0 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth 클라이언트 시크릿 |
| `GOOGLE_REDIRECT_URI` | ✅ | `http://localhost:3001/auth/google/callback` |
| `OPENAI_API_KEY` | AI 기능 | OpenAI API 키 |
| `OPENAI_MODEL` | - | 기본 `gpt-4o-mini` |
| `LANGSMITH_API_KEY` | 옵션 | LLM 호출 트래킹 |

**SESSION_SECRET 생성:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/) → OAuth 2.0 클라이언트 생성
2. 승인된 리디렉션 URI: `http://localhost:3001/auth/google/callback`
3. OAuth 동의 화면에 스코프 추가:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

### 4. 서버 실행

```bash
npm start
```

브라우저에서 `http://localhost:3001` 접속 → Google 로그인 후 사용 가능합니다.

### 5. MCP 서버 (선택)

```bash
npm run mcp
```

외부 AI 도구에서 노트를 컨텍스트로 활용할 때 사용합니다.

---

## 사용 방법

### 노트 생성
사이드바 하단 입력란에 이름 입력 후 **생성** 버튼 클릭. `폴더/파일명` 형식으로 입력하면 폴더 내에 생성됩니다.

### Drive 동기화
- **☁ Drive로**: 현재 로컬 노트를 Drive에 업로드
- **⇣ 전체**: Drive의 모든 노트를 로컬로 다운로드
- **↻**: Drive 노트 목록 새로고침

### 위키링크
본문에 `[[다른 노트 이름]]`을 입력하면 자동으로 링크가 생성됩니다. 🕸 **그래프 뷰** 버튼으로 전체 연결 구조를 시각화할 수 있습니다.

### PPT 변환
툴바의 **📊 PPT** 버튼 → 슬라이드 미리보기 → **🤖 AI 요약 + 그래픽화** (선택) → **다운로드 PPTX**

---

## 보안

- **사용자 격리**: 모든 노트는 `notes/u_{userId}/` 경로로 분리
- **Drive 격리**: `MarkdownEditor` 폴더 외부 파일 접근 차단 (BFS 경로 검증)
- **토큰 암호화**: refresh token은 AES-256-GCM으로 암호화하여 저장
- **CSRF 방지**: OAuth state 파라미터로 콜백 위변조 차단
- **XSS 방지**: DOMPurify로 마크다운 렌더링 결과 정제

---

## 알려진 제약

- 다중 디바이스 동시 편집 시 last-write-wins (충돌 감지 없음)
- Google Docs 파일은 읽기 전용 (편집하려면 로컬 노트로 저장 후 사용)
- Drive `drive` 스코프는 Sensitive scope — 외부 공개 배포 시 Google 검수 필요
- 그래프·백링크는 로컬 미러된 노트만 대상 (Drive 전용 노트는 동기화 후 포함)
