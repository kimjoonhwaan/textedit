import "dotenv/config";
import express from "express";
import helmet from "helmet";
import session from "express-session";
import cookieParser from "cookie-parser";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { Client as LangSmithClient } from "langsmith";
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
} from "./auth/google.js";
import {
  upsertUser,
  getUser,
  publicUserView,
} from "./auth/users.js";
import {
  listDriveNotes,
  readDriveNote,
  createDriveNote,
  updateDriveNote,
  deleteDriveNote,
  ensureDriveFolderPath,
  renameDriveFolder,
  deleteDriveFolderByPath,
  fetchDriveTree,
} from "./auth/drive.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const request = globalThis.fetch ?? fetch;
const app = express();
const PORT = process.env.PORT || 3000;
const NOTES_DIR = path.join(__dirname, "notes");
const LEGACY_DIR = path.join(NOTES_DIR, "_legacy");
const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT || "StMarkdownEditor";
const langsmithClient = process.env.LANGSMITH_API_KEY
  ? new LangSmithClient({
      apiKey: process.env.LANGSMITH_API_KEY,
      apiUrl: process.env.LANGSMITH_ENDPOINT,
    })
  : null;

console.log("[debug] NODE_ENV:", process.env.NODE_ENV);
console.log("[debug] PORT:", process.env.PORT);
console.log("[debug] SESSION_SECRET:", process.env.SESSION_SECRET ? `set(${process.env.SESSION_SECRET.length}자)` : "undefined");
console.log("[debug] GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "set" : "undefined");
console.log("[debug] GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "set" : "undefined");
console.log("[debug] GOOGLE_REDIRECT_URI:", process.env.GOOGLE_REDIRECT_URI ?? "undefined");
console.log("[debug] OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "set" : "undefined");
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error("[fatal] SESSION_SECRET 환경변수가 없습니다. 서버를 종료합니다.");
  process.exit(1);
}
if (Buffer.from(SESSION_SECRET, "hex").length < 32) {
  console.error("[fatal] SESSION_SECRET은 최소 32바이트 hex (64자) 이상이어야 합니다.");
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  })
);
app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());
app.use(
  session({
    secret: SESSION_SECRET,
    name: "mde.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  })
);
app.use(express.static(path.join(__dirname, "public")));

const userNotesDir = (userId) => path.join(NOTES_DIR, `u_${userId}`);

async function mirrorToLocal(userId, name, content) {
  if (!name) return;
  const resolved = resolveNotePath(userId, name);
  if (!resolved) return;
  try {
    await fs.mkdir(path.dirname(resolved.filePath), { recursive: true });
    await fs.writeFile(resolved.filePath, content ?? "", "utf-8");
  } catch (err) {
    console.warn("[mirror] 로컬 미러 실패:", err.message);
  }
}

async function deleteLocalMirror(userId, name) {
  if (!name) return;
  const resolved = resolveNotePath(userId, name);
  if (!resolved) return;
  try {
    await fs.unlink(resolved.filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("[mirror] 로컬 삭제 실패:", err.message);
    }
  }
}

const driveSnapshotPath = (userId) =>
  path.join(__dirname, "data", `drive-tree-${userId}.json`);

async function loadDriveSnapshot(userId) {
  try {
    const text = await fs.readFile(driveSnapshotPath(userId), "utf-8");
    return JSON.parse(text);
  } catch (err) {
    if (err.code === "ENOENT") return { folders: {}, files: {} };
    console.warn("[snapshot] load 실패:", err.message);
    return { folders: {}, files: {} };
  }
}

async function saveDriveSnapshot(userId, tree) {
  const folders = {};
  for (const f of tree.folders || []) folders[f.id] = { path: f.path };
  const files = {};
  for (const f of tree.files || []) {
    files[f.id] = { path: f.path, mimeType: f.mimeType };
  }
  await fs.mkdir(path.dirname(driveSnapshotPath(userId)), { recursive: true });
  await fs.writeFile(
    driveSnapshotPath(userId),
    JSON.stringify({ folders, files }, null, 2),
    "utf-8"
  );
}

async function moveLocalFolder(userId, fromPath, toPath) {
  const fromResolved = resolveFolderPath(userId, fromPath);
  const toResolved = resolveFolderPath(userId, toPath);
  if (!fromResolved || !toResolved) return false;
  try {
    await fs.access(fromResolved.dirPath);
  } catch {
    return false;
  }
  try {
    await fs.mkdir(path.dirname(toResolved.dirPath), { recursive: true });
    await fs.rename(fromResolved.dirPath, toResolved.dirPath);
    return true;
  } catch (err) {
    console.warn("[reconcile] 로컬 폴더 이동 실패:", err.message);
    return false;
  }
}

async function moveLocalNote(userId, fromName, toName) {
  const from = resolveNotePath(userId, fromName);
  const to = resolveNotePath(userId, toName);
  if (!from || !to) return false;
  try {
    await fs.access(from.filePath);
  } catch {
    return false;
  }
  try {
    await fs.mkdir(path.dirname(to.filePath), { recursive: true });
    await fs.rename(from.filePath, to.filePath);
    return true;
  } catch (err) {
    console.warn("[reconcile] 로컬 노트 이동 실패:", err.message);
    return false;
  }
}

async function reconcileFromDrive(userId) {
  const stats = { renamedFolders: 0, renamedFiles: 0, deletedFolders: 0, deletedFiles: 0 };
  const tree = await fetchDriveTree(userId);
  const prev = await loadDriveSnapshot(userId);

  // 정렬: 깊은 폴더부터 처리하면 충돌 줄어듦
  const folderEntries = Object.entries(prev.folders || {});
  folderEntries.sort((a, b) => (b[1].path?.length || 0) - (a[1].path?.length || 0));

  const currentFolderById = new Map(
    (tree.folders || []).map((f) => [f.id, f.path])
  );
  const currentFileById = new Map(
    (tree.files || []).map((f) => [f.id, f.path])
  );

  // 폴더: prev → current 이름/위치 변경 감지
  for (const [id, prevInfo] of folderEntries) {
    const currentPath = currentFolderById.get(id);
    if (!currentPath) {
      // Drive에서 삭제됨
      const resolved = resolveFolderPath(userId, prevInfo.path);
      if (resolved) {
        try {
          await fs.rm(resolved.dirPath, { recursive: true, force: false });
          stats.deletedFolders++;
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.warn("[reconcile] 폴더 삭제 실패:", err.message);
          }
        }
      }
    } else if (currentPath !== prevInfo.path) {
      // 이름/위치 변경
      const ok = await moveLocalFolder(userId, prevInfo.path, currentPath);
      if (ok) stats.renamedFolders++;
    }
  }

  // 파일: prev → current 이름/위치 변경 감지
  for (const [id, prevInfo] of Object.entries(prev.files || {})) {
    const currentPath = currentFileById.get(id);
    if (!currentPath) {
      // Drive에서 삭제됨
      await deleteLocalMirror(userId, prevInfo.path);
      stats.deletedFiles++;
    } else if (currentPath !== prevInfo.path) {
      const ok = await moveLocalNote(userId, prevInfo.path, currentPath);
      if (ok) stats.renamedFiles++;
    }
  }

  // 새 스냅샷 저장
  await saveDriveSnapshot(userId, tree);
  return { stats, tree };
}

const requireAuth = (req, res, next) => {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  req.userId = userId;
  next();
};

const sanitizeSegment = (segment) =>
  segment
    .normalize("NFC")
    .replace(/[<>:"|?*\u0000-\u001F]/g, "")
    .trim();

const normalizeNotePath = (input) => {
  if (!input) return null;
  const raw = input
    .toString()
    .normalize("NFC")
    .trim()
    .replace(/\\/g, "/");
  if (!raw || raw.includes("..")) return null;
  const parts = raw.split("/").map(sanitizeSegment).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join("/");
};

const normalizeFolderPath = (input) => {
  if (!input) return null;
  const raw = input
    .toString()
    .normalize("NFC")
    .trim()
    .replace(/\\/g, "/");
  if (!raw || raw.includes("..")) return null;
  const parts = raw.split("/").map(sanitizeSegment).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join("/");
};

const resolveNotePath = (userId, name) => {
  const safe = normalizeNotePath(name);
  if (!safe) return null;
  return {
    safe,
    filePath: path.join(userNotesDir(userId), `${safe}.md`),
  };
};

const resolveFolderPath = (userId, folder) => {
  const safe = normalizeFolderPath(folder);
  if (!safe) return null;
  return {
    safe,
    dirPath: path.join(userNotesDir(userId), safe),
  };
};

const normalizeDisplayName = (value) => value.normalize("NFC");

const normalizeTagValue = (value) =>
  value
    .toString()
    .normalize("NFC")
    .replace(/^#/, "")
    .replace(/["'`\[\]{}()<>]/g, "")
    .trim();

const parseTagResponse = (raw) => {
  if (!raw) return [];
  let tags = [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      tags = parsed;
    }
  } catch (error) {
    tags = trimmed.split(/[\n,]+/);
  }
  const cleaned = tags
    .map((tag) => normalizeTagValue(tag))
    .filter(Boolean)
    .filter((tag) => tag.length <= 30)
    .filter((tag) => !/[\.!?\n]/.test(tag));
  return Array.from(new Set(cleaned)).slice(0, 5);
};

const updateLangsmithRun = async (runId, payload) => {
  if (!langsmithClient || !runId) return;
  try {
    await langsmithClient.updateRun(runId, payload);
  } catch (error) {
    console.warn("[langsmith] run 업데이트 실패:", error);
  }
};

const readDirSafe = async (dir) => {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const listNotesAt = async (dir, prefix = "") => {
  const entries = await readDirSafe(dir);
  const notes = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const entryName = normalizeDisplayName(entry.name);
    if (entry.isDirectory()) {
      const nested = await listNotesAt(
        fullPath,
        prefix ? `${prefix}/${entryName}` : entryName
      );
      notes.push(...nested);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const name = normalizeDisplayName(entry.name.replace(/\.md$/, ""));
      notes.push(prefix ? `${prefix}/${name}` : name);
    }
  }
  return notes;
};

const listFoldersAt = async (dir, prefix = "") => {
  const entries = await readDirSafe(dir);
  const folders = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryName = normalizeDisplayName(entry.name);
    const folderPath = prefix ? `${prefix}/${entryName}` : entryName;
    folders.push(folderPath);
    const fullPath = path.join(dir, entry.name);
    const nested = await listFoldersAt(fullPath, folderPath);
    folders.push(...nested);
  }
  return folders;
};

const listNotes = (userId) => listNotesAt(userNotesDir(userId));
const listFolders = (userId) => listFoldersAt(userNotesDir(userId));

const listNoteEntries = async (userId) => {
  const notes = await listNotes(userId);
  return notes.map((name) => ({
    name,
    filePath: path.join(userNotesDir(userId), `${name}.md`),
  }));
};

app.post("/api/tags/auto", requireAuth, async (req, res) => {
  const content = (req.body?.content ?? "").toString().trim();
  if (!content) {
    return res.status(400).json({ error: "내용이 필요합니다." });
  }
  console.log(
    `[auto-tags] content length=${content.length}, head=${content.slice(
      0,
      120
    )}, tail=${content.slice(-120)}`
  );
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res
      .status(400)
      .json({ error: "OPENAI_API_KEY 환경 변수가 필요합니다." });
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const messages = [
    {
      role: "system",
      content: `당신은 AI 기술 전문 블로그의 편집장입니다.

아래 글을 분석하여 블로그 태그 5개를 추출하세요.

태그 선정 기준:
1. 글의 핵심 기술 또는 개념을 대표해야 함
2. 글 전체에서 반복적으로 등장하거나 중심이 되는 개념
3. 너무 넓은 범주(예: AI, 개발, 시스템)는 제외
4. SEO와 전문성을 동시에 고려
5. 서로 의미가 겹치지 않아야 함

출력 형식:
- 번호 없이 한 줄에 쉼표로 구분하여 출력
- 추가 설명 금지`,
    },
    {
      role: "user",
      content: `Markdown 내용:\n${content}`,
    },
  ];
  let runId = null;
  if (langsmithClient) {
    try {
      const run = await langsmithClient.createRun({
        name: "auto-tags",
        run_type: "llm",
        inputs: { messages, model, temperature: 0.4 },
        project_name: LANGSMITH_PROJECT,
        start_time: new Date().toISOString(),
      });
      runId = run.id;
    } catch (error) {
      console.warn("[langsmith] run 생성 실패:", error);
    }
  }
  try {
    const response = await request("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      await updateLangsmithRun(runId, {
        error: detail,
        end_time: new Date().toISOString(),
      });
      console.error("[tags] OpenAI 오류:", detail);
      return res.status(500).json({ error: "태그 생성 실패. 잠시 후 다시 시도해 주세요." });
    }
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "";
    const tags = parseTagResponse(raw);
    await updateLangsmithRun(runId, {
      outputs: { raw, tags },
      end_time: new Date().toISOString(),
    });
    res.json({ tags });
  } catch (error) {
    await updateLangsmithRun(runId, {
      error: error.message,
      end_time: new Date().toISOString(),
    });
    res.status(500).json({ error: "태그 생성 중 오류가 발생했습니다." });
  }
});

app.post("/api/ai/ask", requireAuth, async (req, res) => {
  const content = (req.body?.content ?? "").toString().trim();
  const question = (req.body?.question ?? "").toString().trim();
  if (!content || !question) {
    return res.status(400).json({ error: "내용과 질문이 필요합니다." });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res
      .status(400)
      .json({ error: "OPENAI_API_KEY 환경 변수가 필요합니다." });
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const messages = [
    {
      role: "system",
      content:
        "당신은 제공된 문서를 기반으로 질문에 답하는 도우미 입니다. 답변은 간결한 Markdown으로 작성하세요.",
    },
    {
      role: "user",
      content: `문서 내용:\n${content}\n\n질문: ${question}`,
    },
  ];
  let runId = null;
  if (langsmithClient) {
    try {
      const run = await langsmithClient.createRun({
        name: "ai-ask",
        run_type: "llm",
        inputs: { messages, model, temperature: 0.3 },
        project_name: LANGSMITH_PROJECT,
        start_time: new Date().toISOString(),
      });
      runId = run.id;
    } catch (error) {
      console.warn("[langsmith] run 생성 실패:", error);
    }
  }
  try {
    const response = await request("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      await updateLangsmithRun(runId, {
        error: detail,
        end_time: new Date().toISOString(),
      });
      console.error("[ai/ask] OpenAI 오류:", detail);
      return res.status(500).json({ error: "AI 답변 생성 실패. 잠시 후 다시 시도해 주세요." });
    }
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content ?? "";
    await updateLangsmithRun(runId, {
      outputs: { answer },
      end_time: new Date().toISOString(),
    });
    res.json({ answer });
  } catch (error) {
    await updateLangsmithRun(runId, {
      error: error.message,
      end_time: new Date().toISOString(),
    });
    res.status(500).json({ error: "AI 답변 생성 중 오류가 발생했습니다." });
  }
});

app.post("/api/ai/pptify", requireAuth, async (req, res) => {
  const content = (req.body?.content ?? "").toString().trim();
  if (!content) {
    return res.status(400).json({ error: "내용이 필요합니다." });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res
      .status(400)
      .json({ error: "OPENAI_API_KEY 환경 변수가 필요합니다." });
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const systemPrompt = `당신은 발표 슬라이드 디자이너이자 발표 코치입니다. 마크다운 문서를 받아 발표용 슬라이드 구조와 발표 스크립트를 생성합니다.

규칙:
1. 슬라이드는 4~8개로 압축. 너무 많으면 의미 단위로 병합
2. 각 슬라이드 본문은 3~5개 핵심 불릿으로 요약 (한 불릿 30자 이내)
3. 내용 성격에 맞는 layout을 선택:
   - "bullets": 일반 불릿 (기본)
   - "comparison": A vs B, 장단점, 두 개념 비교 시
   - "process": 순서, 단계, 흐름 설명 시
   - "stat": 핵심 숫자/지표 강조 시
4. layout별 visual 데이터:
   - bullets: { items: ["불릿1", "불릿2", ...] }
   - comparison: { leftTitle, leftItems: [], rightTitle, rightItems: [] }
   - process: { steps: ["1단계", "2단계", "3단계", ...] (3~6개) }
   - stat: { value: "85%", label: "개선 효과", description: "추가 설명 한 줄" }
5. **각 슬라이드마다 "script" 필드를 작성**:
   - 발표자가 슬라이드를 보며 약 2분간 말할 분량 (한국어 500~700자, 3~4개 문단)
   - 도입 → 핵심 포인트 설명 → 예시/근거 → 마무리/다음 슬라이드 전환 흐름
   - 슬라이드의 불릿/숫자를 단순 나열하지 말고 풀어서 설명
   - 청중에게 직접 말하는 자연스러운 구어체. "~입니다", "~지요" 등
   - 강조 표현, 청중 호응 유도 문구도 적절히 포함
6. 반드시 다음 JSON 형식으로만 응답:

{
  "slides": [
    {
      "title": "슬라이드 제목",
      "layout": "bullets",
      "visual": { "items": ["..."] },
      "script": "여러분 안녕하세요. 오늘 첫 번째로 살펴볼 내용은 ... (500~700자)"
    }
  ]
}

추가 설명, 마크다운 코드블록 표시, 인사말 일절 금지. 순수 JSON만.`;
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Markdown 문서:\n${content}` },
  ];
  let runId = null;
  if (langsmithClient) {
    try {
      const run = await langsmithClient.createRun({
        name: "ai-pptify",
        run_type: "llm",
        inputs: { messages, model, temperature: 0.4 },
        project_name: LANGSMITH_PROJECT,
        start_time: new Date().toISOString(),
      });
      runId = run.id;
    } catch (error) {
      console.warn("[langsmith] run 생성 실패:", error);
    }
  }
  try {
    const response = await request("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      await updateLangsmithRun(runId, {
        error: detail,
        end_time: new Date().toISOString(),
      });
      console.error("[ai/pptify] OpenAI 오류:", detail);
      return res.status(500).json({ error: "AI 슬라이드 생성 실패. 잠시 후 다시 시도해 주세요." });
    }
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      await updateLangsmithRun(runId, {
        error: `JSON parse failed: ${raw}`,
        end_time: new Date().toISOString(),
      });
      return res.status(500).json({ error: "AI 응답 파싱 실패", raw });
    }
    const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
    await updateLangsmithRun(runId, {
      outputs: { slides },
      end_time: new Date().toISOString(),
    });
    res.json({ slides });
  } catch (error) {
    await updateLangsmithRun(runId, {
      error: error.message,
      end_time: new Date().toISOString(),
    });
    res.status(500).json({ error: "AI 슬라이드 생성 중 오류가 발생했습니다." });
  }
});

app.get("/api/notes", requireAuth, async (req, res) => {
  try {
    const notes = await listNotes(req.userId);
    res.json({ notes });
  } catch (error) {
    res.status(500).json({ error: "파일 목록을 불러오지 못했습니다." });
  }
});

app.get("/api/folders", requireAuth, async (req, res) => {
  try {
    const folders = await listFolders(req.userId);
    res.json({ folders });
  } catch (error) {
    res.status(500).json({ error: "폴더 목록을 불러오지 못했습니다." });
  }
});

app.get("/api/notes/:name", requireAuth, async (req, res) => {
  const resolved = resolveNotePath(req.userId, req.params.name);
  if (!resolved) {
    return res.status(400).json({ error: "파일 이름이 올바르지 않습니다." });
  }
  try {
    const content = await fs.readFile(resolved.filePath, "utf-8");
    res.json({ name: resolved.safe, content });
  } catch (error) {
    res.status(404).json({ error: "파일을 찾을 수 없습니다." });
  }
});

app.post("/api/notes", requireAuth, async (req, res) => {
  const resolved = resolveNotePath(req.userId, req.body?.name);
  if (!resolved) {
    return res.status(400).json({ error: "파일 이름이 필요합니다." });
  }
  try {
    await fs.mkdir(path.dirname(resolved.filePath), { recursive: true });
    await fs.writeFile(resolved.filePath, req.body?.content ?? "", "utf-8");
    res.json({ name: resolved.safe });
  } catch (error) {
    res.status(500).json({ error: "파일을 저장하지 못했습니다." });
  }
});

app.post("/api/folders", requireAuth, async (req, res) => {
  const resolved = resolveFolderPath(req.userId, req.body?.path);
  if (!resolved) {
    return res.status(400).json({ error: "폴더 경로가 필요합니다." });
  }
  try {
    await fs.access(resolved.dirPath);
    return res.status(409).json({ error: "이미 존재하는 폴더입니다." });
  } catch (error) {
    if (error.code !== "ENOENT") {
      return res.status(500).json({ error: "폴더를 만들지 못했습니다." });
    }
  }
  try {
    await fs.mkdir(resolved.dirPath, { recursive: true });
    try {
      await ensureDriveFolderPath(req.userId, resolved.safe);
    } catch (err) {
      console.warn("[drive-sync] 폴더 생성 실패:", err.message);
    }
    res.json({ path: resolved.safe });
  } catch (error) {
    res.status(500).json({ error: "폴더를 만들지 못했습니다." });
  }
});

app.delete("/api/notes/:name", requireAuth, async (req, res) => {
  const resolved = resolveNotePath(req.userId, req.params.name);
  if (!resolved) {
    return res.status(400).json({ error: "파일 이름이 올바르지 않습니다." });
  }
  try {
    await fs.unlink(resolved.filePath);
    res.json({ name: resolved.safe });
  } catch (error) {
    res.status(404).json({ error: "파일을 찾을 수 없습니다." });
  }
});

app.delete("/api/folders/*", requireAuth, async (req, res) => {
  const resolved = resolveFolderPath(req.userId, req.params[0]);
  if (!resolved) {
    return res.status(400).json({ error: "폴더 경로가 올바르지 않습니다." });
  }
  try {
    await fs.rm(resolved.dirPath, { recursive: true, force: false });
    try {
      await deleteDriveFolderByPath(req.userId, resolved.safe);
    } catch (err) {
      console.warn("[drive-sync] 폴더 삭제 실패:", err.message);
    }
    res.json({ path: resolved.safe });
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({ error: "폴더를 찾을 수 없습니다." });
    }
    res.status(500).json({ error: "폴더를 삭제하지 못했습니다." });
  }
});

app.put("/api/notes/:name/rename", requireAuth, async (req, res) => {
  const source = resolveNotePath(req.userId, req.params.name);
  const target = resolveNotePath(req.userId, req.body?.newName);
  if (!source || !target) {
    return res.status(400).json({ error: "파일 이름이 올바르지 않습니다." });
  }
  try {
    await fs.mkdir(path.dirname(target.filePath), { recursive: true });
    await fs.access(target.filePath);
    return res.status(409).json({ error: "이미 존재하는 이름입니다." });
  } catch (error) {
    if (error.code !== "ENOENT") {
      return res.status(500).json({ error: "파일을 이동하지 못했습니다." });
    }
  }
  try {
    await fs.rename(source.filePath, target.filePath);
    res.json({ name: target.safe });
  } catch (error) {
    res.status(500).json({ error: "파일을 이동하지 못했습니다." });
  }
});

app.put("/api/folders/rename", requireAuth, async (req, res) => {
  const source = resolveFolderPath(req.userId, req.body?.from);
  const target = resolveFolderPath(req.userId, req.body?.to);
  if (!source || !target) {
    return res.status(400).json({ error: "폴더 경로가 올바르지 않습니다." });
  }
  try {
    await fs.access(source.dirPath);
  } catch (error) {
    return res.status(404).json({ error: "폴더를 찾을 수 없습니다." });
  }
  try {
    await fs.access(target.dirPath);
    return res.status(409).json({ error: "이미 존재하는 폴더입니다." });
  } catch (error) {
    if (error.code !== "ENOENT") {
      return res.status(500).json({ error: "폴더를 이동하지 못했습니다." });
    }
  }
  try {
    await fs.mkdir(path.dirname(target.dirPath), { recursive: true });
    await fs.rename(source.dirPath, target.dirPath);
    try {
      const result = await renameDriveFolder(req.userId, source.safe, target.safe);
      if (!result.found) {
        console.log("[drive-sync] 매칭되는 Drive 폴더 없음:", source.safe);
      }
    } catch (err) {
      console.warn("[drive-sync] 폴더 이름 변경 실패:", err.message);
    }
    res.json({ path: target.safe });
  } catch (error) {
    res.status(500).json({ error: "폴더를 이동하지 못했습니다." });
  }
});

app.post("/api/notes/:name/copy", requireAuth, async (req, res) => {
  const source = resolveNotePath(req.userId, req.params.name);
  const target = resolveNotePath(req.userId, req.body?.targetName);
  if (!source || !target) {
    return res.status(400).json({ error: "파일 이름이 올바르지 않습니다." });
  }
  try {
    const content = await fs.readFile(source.filePath, "utf-8");
    await fs.mkdir(path.dirname(target.filePath), { recursive: true });
    await fs.writeFile(target.filePath, content, "utf-8");
    res.json({ name: target.safe });
  } catch (error) {
    res.status(500).json({ error: "파일을 복사하지 못했습니다." });
  }
});

app.get("/api/search", requireAuth, async (req, res) => {
  const query = (req.query.q ?? "").toString().toLowerCase();
  try {
    const entries = await listNoteEntries(req.userId);
    const results = [];
    for (const entry of entries) {
      const content = await fs.readFile(entry.filePath, "utf-8");
      const matches =
        entry.name.toLowerCase().includes(query) ||
        content.toLowerCase().includes(query);
      if (query && matches) {
        results.push({ name: entry.name });
      }
    }
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: "검색에 실패했습니다." });
  }
});

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const WIKILINK_RE = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;

app.get("/api/backlinks/:name", requireAuth, async (req, res) => {
  const resolved = resolveNotePath(req.userId, req.params.name);
  if (!resolved) return res.status(400).json({ error: "파일 이름이 올바르지 않습니다." });
  const pattern = new RegExp(`\\[\\[${escapeRegex(resolved.safe)}(?:\\|[^\\]\\n]*)?\\]\\]`);
  try {
    const entries = await listNoteEntries(req.userId);
    const backlinks = [];
    for (const entry of entries) {
      if (entry.name === resolved.safe) continue;
      const content = await fs.readFile(entry.filePath, "utf-8");
      if (pattern.test(content)) backlinks.push(entry.name);
    }
    res.json({ backlinks });
  } catch (error) {
    res.status(500).json({ error: "백링크를 불러오지 못했습니다." });
  }
});

app.get("/api/graph", requireAuth, async (req, res) => {
  try {
    const entries = await listNoteEntries(req.userId);
    const nameSet = new Set(entries.map((e) => e.name));
    const stats = await Promise.all(entries.map((e) => fs.stat(e.filePath).catch(() => null)));
    const nodes = entries.map((e, i) => ({
      id: e.name,
      mtime: stats[i]?.mtime?.toISOString() ?? null,
    }));
    const edgeSet = new Set();
    const edges = [];
    for (const entry of entries) {
      const content = await fs.readFile(entry.filePath, "utf-8");
      WIKILINK_RE.lastIndex = 0;
      let match;
      while ((match = WIKILINK_RE.exec(content)) !== null) {
        const target = match[1].trim();
        if (nameSet.has(target) && target !== entry.name) {
          const key = `${entry.name}→${target}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: entry.name, target });
          }
        }
      }
    }
    res.json({ nodes, edges });
  } catch (error) {
    res.status(500).json({ error: "그래프를 불러오지 못했습니다." });
  }
});

// ===== Authentication routes =====
app.get("/auth/google", (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    req.session.oauthState = state;
    const url = buildAuthUrl(state);
    res.redirect(url);
  } catch (error) {
    console.error("[oauth] /auth/google 오류:", error);
    res.status(500).send("OAuth 설정 오류가 발생했습니다. 관리자에게 문의하세요.");
  }
});

app.get("/auth/google/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError) {
    return res.status(400).send(`Google 인증 거부: ${oauthError}`);
  }
  if (!code || !state || state !== req.session?.oauthState) {
    return res.status(400).send("잘못된 OAuth state");
  }
  try {
    const tokens = await exchangeCodeForTokens(code.toString());
    if (!tokens.access_token) {
      throw new Error("access_token 없음");
    }
    const profile = await fetchGoogleUserInfo(tokens.access_token);
    if (!profile.id) throw new Error("프로필 ID 없음");
    await upsertUser({
      id: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      refreshToken: tokens.refresh_token,
    });
    await fs.mkdir(userNotesDir(profile.id), { recursive: true });
    req.session.userId = profile.id;
    delete req.session.oauthState;
    res.redirect("/");
  } catch (error) {
    console.error("[oauth] callback 실패:", error);
    res.status(500).send("Google 인증 처리에 실패했습니다. 다시 시도해 주세요.");
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("mde.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "로그인되지 않았습니다." });
  const user = await getUser(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "사용자를 찾을 수 없습니다." });
  }
  res.json(publicUserView(user));
});

// ===== Google Drive routes =====
const handleDriveError = (res, error) => {
  console.error("[drive]", error?.message || error);
  if (error?.code === "NO_REFRESH_TOKEN" || error?.code === 401) {
    return res.status(401).json({ error: error.message || "Drive 인증 만료" });
  }
  if (error?.code === "FORBIDDEN_FILE") {
    return res.status(403).json({ error: error.message });
  }
  res.status(500).json({ error: error?.message || "Drive 작업 실패" });
};

app.get("/api/drive/notes", requireAuth, async (req, res) => {
  try {
    const files = await listDriveNotes(req.userId);
    res.json({
      notes: files.map((f) => ({
        id: f.id,
        name: f.name.replace(/\.md$/, ""),
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
      })),
    });
  } catch (error) {
    handleDriveError(res, error);
  }
});

app.get("/api/drive/notes/:fileId", requireAuth, async (req, res) => {
  try {
    const file = await readDriveNote(req.userId, req.params.fileId);
    const cleanName = file.name.replace(/\.md$/, "");
    await mirrorToLocal(req.userId, cleanName, file.content);
    res.json({
      id: file.id,
      name: cleanName,
      mimeType: file.mimeType,
      content: file.content,
      modifiedTime: file.modifiedTime,
      mirroredLocal: true,
    });
  } catch (error) {
    handleDriveError(res, error);
  }
});

app.post("/api/drive/notes", requireAuth, async (req, res) => {
  const name = (req.body?.name ?? "").toString().trim();
  if (!name) return res.status(400).json({ error: "파일 이름이 필요합니다." });
  try {
    const content = req.body?.content ?? "";
    const file = await createDriveNote(req.userId, name, content);
    await mirrorToLocal(req.userId, name, content);
    res.json({
      id: file.id,
      name: file.name.replace(/\.md$/, ""),
      _updated: !!file._updated,
      mirroredLocal: true,
    });
  } catch (error) {
    handleDriveError(res, error);
  }
});

app.put("/api/drive/notes/:fileId", requireAuth, async (req, res) => {
  try {
    const file = await updateDriveNote(req.userId, req.params.fileId, {
      content: req.body?.content,
      name: req.body?.name,
    });
    const cleanName = file.name.replace(/\.md$/, "");
    if (typeof req.body?.content === "string") {
      await mirrorToLocal(req.userId, cleanName, req.body.content);
    }
    res.json({
      id: file.id,
      name: cleanName,
      modifiedTime: file.modifiedTime,
      mirroredLocal: typeof req.body?.content === "string",
    });
  } catch (error) {
    handleDriveError(res, error);
  }
});

app.delete("/api/drive/notes/:fileId", requireAuth, async (req, res) => {
  try {
    let nameForMirror = null;
    try {
      const file = await readDriveNote(req.userId, req.params.fileId);
      nameForMirror = file.name.replace(/\.md$/, "");
    } catch {
      /* ignore - delete proceeds anyway */
    }
    await deleteDriveNote(req.userId, req.params.fileId);
    if (nameForMirror) await deleteLocalMirror(req.userId, nameForMirror);
    res.json({ ok: true });
  } catch (error) {
    handleDriveError(res, error);
  }
});

app.post("/api/drive/sync-all", requireAuth, async (req, res) => {
  try {
    const reconciled = await reconcileFromDrive(req.userId);
    const files = reconciled.tree.files || [];
    let mirrored = 0;
    let failed = 0;
    for (const f of files) {
      try {
        const file = await readDriveNote(req.userId, f.id);
        await mirrorToLocal(req.userId, f.path, file.content);
        mirrored++;
      } catch (err) {
        console.warn("[sync-all]", f.path, err.message);
        failed++;
      }
    }
    res.json({
      total: files.length,
      mirrored,
      failed,
      ...reconciled.stats,
    });
  } catch (error) {
    handleDriveError(res, error);
  }
});

app.post("/api/drive/reconcile", requireAuth, async (req, res) => {
  try {
    const result = await reconcileFromDrive(req.userId);
    res.json(result.stats);
  } catch (error) {
    handleDriveError(res, error);
  }
});

app.post("/api/drive/sync-all-stream", requireAuth, async (req, res) => {
  res.set({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  const send = (obj) => {
    res.write(JSON.stringify(obj) + "\n");
  };
  try {
    send({ event: "stage", stage: "reconcile", message: "Drive 트리 비교 중..." });
    const reconciled = await reconcileFromDrive(req.userId);
    send({
      event: "reconciled",
      renamedFolders: reconciled.stats.renamedFolders,
      renamedFiles: reconciled.stats.renamedFiles,
      deletedFolders: reconciled.stats.deletedFolders,
      deletedFiles: reconciled.stats.deletedFiles,
    });

    const files = reconciled.tree.files || [];
    send({
      event: "stage",
      stage: "mirror",
      total: files.length,
      message: `파일 ${files.length}개 다운로드 중...`,
    });

    let mirrored = 0;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let errorMsg = null;
      try {
        const file = await readDriveNote(req.userId, f.id);
        await mirrorToLocal(req.userId, f.path, file.content);
        mirrored++;
      } catch (err) {
        failed++;
        errorMsg = err.message;
        console.warn("[sync-stream]", f.path, err.message);
      }
      send({
        event: "progress",
        current: i + 1,
        total: files.length,
        name: f.path,
        mirrored,
        failed,
        error: errorMsg,
      });
    }

    send({
      event: "done",
      total: files.length,
      mirrored,
      failed,
      ...reconciled.stats,
    });
  } catch (error) {
    console.error("[sync-stream] 실패:", error);
    send({ event: "error", message: error.message });
  } finally {
    res.end();
  }
});

app.get("/api/drive/diagnose", requireAuth, async (req, res) => {
  try {
    const { getRefreshToken } = await import("./auth/users.js");
    const { clientWithRefreshToken } = await import("./auth/google.js");
    const refreshToken = await getRefreshToken(req.userId);
    if (!refreshToken) {
      return res.status(400).json({ error: "refresh token 없음 - 재로그인 필요" });
    }
    const client = clientWithRefreshToken(refreshToken);
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("access token 발급 실패");
    const info = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    const data = await info.json();
    res.json({
      email: data.email,
      scope: data.scope,
      hasFullDrive: (data.scope || "").includes("auth/drive"),
      hasDriveFile: (data.scope || "").includes("auth/drive.file"),
      expires_in: data.expires_in,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Legacy notes migration =====
async function migrateLegacyNotes() {
  try {
    const entries = await fs.readdir(NOTES_DIR, { withFileTypes: true }).catch(() => []);
    const stragglers = entries.filter(
      (e) => e.name !== "_legacy" && !e.name.startsWith("u_")
    );
    if (!stragglers.length) return;
    await fs.mkdir(LEGACY_DIR, { recursive: true });
    for (const entry of stragglers) {
      const src = path.join(NOTES_DIR, entry.name);
      const dst = path.join(LEGACY_DIR, entry.name);
      try {
        await fs.rename(src, dst);
        console.log(`[migrate] ${entry.name} → _legacy/`);
      } catch (err) {
        console.warn(`[migrate] ${entry.name} 이동 실패:`, err.message);
      }
    }
  } catch (err) {
    console.warn("[migrate] 마이그레이션 중 오류:", err.message);
  }
}

app.use((_req, res) => {
  res.status(404).json({ error: "요청한 페이지를 찾을 수 없습니다." });
});

app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
  process.exit(1);
});

await fs.mkdir(NOTES_DIR, { recursive: true }).catch((error) => {
  console.error("[init] notes 폴더 생성 실패:", error);
});

app.listen(PORT, async () => {
  await migrateLegacyNotes();
  console.log(`[server] Listening on port ${PORT}`);
});
