import { google } from "googleapis";
import { clientWithRefreshToken } from "./google.js";
import { getRefreshToken } from "./users.js";

const APP_FOLDER_NAME = "MarkdownEditor";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const NOTE_MIME = "text/markdown";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const PLAIN_TEXT_MIME = "text/plain";

const READABLE_MIMES = new Set([NOTE_MIME, GOOGLE_DOC_MIME, PLAIN_TEXT_MIME]);

const folderCache = new Map(); // userId -> rootFolderId

export async function getDriveClient(userId) {
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) {
    const err = new Error("Drive 접근 권한이 없습니다. 다시 로그인해 주세요.");
    err.code = "NO_REFRESH_TOKEN";
    throw err;
  }
  const auth = clientWithRefreshToken(refreshToken);
  return google.drive({ version: "v3", auth });
}

function escapeForQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function splitNotePath(name) {
  const cleaned = String(name || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "");
  const parts = cleaned.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { folders: [], baseName: "" };
  const baseName = parts.pop();
  return { folders: parts, baseName };
}

export async function ensureAppFolder(userId) {
  if (folderCache.has(userId)) return folderCache.get(userId);
  const drive = await getDriveClient(userId);
  const search = await drive.files.list({
    q: `name='${escapeForQuery(APP_FOLDER_NAME)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });
  let folderId = search.data.files?.[0]?.id;
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: {
        name: APP_FOLDER_NAME,
        mimeType: FOLDER_MIME,
      },
      fields: "id",
    });
    folderId = created.data.id;
  }
  folderCache.set(userId, folderId);
  return folderId;
}

async function findChildFolder(drive, parentId, name) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${escapeForQuery(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: "files(id, name)",
    pageSize: 5,
  });
  return res.data.files?.[0]?.id || null;
}

async function findChildNote(drive, parentId, fileName) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${escapeForQuery(fileName)}' and mimeType='${NOTE_MIME}' and trashed=false`,
    fields: "files(id, name, modifiedTime)",
    pageSize: 5,
  });
  return res.data.files?.[0] || null;
}

async function findFolderByPath(drive, rootId, segments) {
  let parentId = rootId;
  for (const segment of segments) {
    if (!segment) continue;
    const childId = await findChildFolder(drive, parentId, segment);
    if (!childId) return null;
    parentId = childId;
  }
  return parentId;
}

export async function ensureDriveFolderPath(userId, pathString) {
  const drive = await getDriveClient(userId);
  const rootId = await ensureAppFolder(userId);
  const { folders, baseName } = splitNotePath(pathString);
  const segments = baseName ? [...folders, baseName] : folders;
  return ensureFolderPath(drive, rootId, segments);
}

export async function renameDriveFolder(userId, fromPath, toPath) {
  const drive = await getDriveClient(userId);
  const rootId = await ensureAppFolder(userId);
  const fromSegments = splitPath(fromPath);
  const toSegments = splitPath(toPath);
  if (fromSegments.length === 0 || toSegments.length === 0) {
    throw new Error("경로가 비어 있습니다.");
  }
  const folderId = await findFolderByPath(drive, rootId, fromSegments);
  if (!folderId) {
    return { found: false };
  }
  const parentSegments = toSegments.slice(0, -1);
  const newName = toSegments[toSegments.length - 1];
  const newParentId = await ensureFolderPath(drive, rootId, parentSegments);
  const meta = await drive.files.get({ fileId: folderId, fields: "id, parents, name" });
  const params = {
    fileId: folderId,
    requestBody: { name: newName },
    fields: "id, name, parents",
  };
  const currentParents = meta.data.parents || [];
  if (!currentParents.includes(newParentId)) {
    params.addParents = newParentId;
    params.removeParents = currentParents.join(",");
  }
  await drive.files.update(params);
  return { found: true, id: folderId };
}

export async function deleteDriveFolderByPath(userId, pathString) {
  const drive = await getDriveClient(userId);
  const rootId = await ensureAppFolder(userId);
  const segments = splitPath(pathString);
  if (segments.length === 0) return { found: false };
  const folderId = await findFolderByPath(drive, rootId, segments);
  if (!folderId) return { found: false };
  await drive.files.delete({ fileId: folderId });
  return { found: true, id: folderId };
}

function splitPath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function ensureFolderPath(drive, rootId, segments) {
  let parentId = rootId;
  for (const segment of segments) {
    if (!segment) continue;
    let childId = await findChildFolder(drive, parentId, segment);
    if (!childId) {
      const created = await drive.files.create({
        requestBody: {
          name: segment,
          mimeType: FOLDER_MIME,
          parents: [parentId],
          appProperties: { markdownEditor: "true" },
        },
        fields: "id",
      });
      childId = created.data.id;
    }
    parentId = childId;
  }
  return parentId;
}

async function walkSubtree(drive, folderId, prefix = "") {
  const out = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)",
      orderBy: "name",
      pageSize: 200,
      pageToken,
    });
    for (const file of res.data.files || []) {
      if (file.mimeType === FOLDER_MIME) {
        const nestedPrefix = prefix ? `${prefix}/${file.name}` : file.name;
        const nested = await walkSubtree(drive, file.id, nestedPrefix);
        out.push(...nested);
      } else if (READABLE_MIMES.has(file.mimeType)) {
        const baseName = file.name.replace(/\.md$/i, "").replace(/\.txt$/i, "");
        out.push({
          id: file.id,
          name: prefix ? `${prefix}/${baseName}` : baseName,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          parents: file.parents || [],
        });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return out;
}

export async function listDriveNotes(userId) {
  const drive = await getDriveClient(userId);
  const rootId = await ensureAppFolder(userId);
  const notes = await walkSubtree(drive, rootId);
  notes.sort(
    (a, b) => new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0)
  );
  return notes;
}

async function walkFullTree(drive, folderId, prefix = "") {
  const folders = [];
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields:
        "nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)",
      orderBy: "name",
      pageSize: 200,
      pageToken,
    });
    for (const file of res.data.files || []) {
      if (file.mimeType === FOLDER_MIME) {
        const folderPath = prefix ? `${prefix}/${file.name}` : file.name;
        folders.push({ id: file.id, path: folderPath, parents: file.parents || [] });
        const nested = await walkFullTree(drive, file.id, folderPath);
        folders.push(...nested.folders);
        files.push(...nested.files);
      } else if (READABLE_MIMES.has(file.mimeType)) {
        const baseName = file.name.replace(/\.md$/i, "").replace(/\.txt$/i, "");
        files.push({
          id: file.id,
          path: prefix ? `${prefix}/${baseName}` : baseName,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          parents: file.parents || [],
        });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return { folders, files };
}

export async function fetchDriveTree(userId) {
  const drive = await getDriveClient(userId);
  const rootId = await ensureAppFolder(userId);
  return walkFullTree(drive, rootId);
}

export async function readDriveNote(userId, fileId) {
  const drive = await getDriveClient(userId);
  const meta = await drive.files.get({
    fileId,
    fields: "id, name, modifiedTime, parents, mimeType",
  });
  await assertOwnedByApp(userId, drive, meta.data);

  let content = "";
  if (meta.data.mimeType === GOOGLE_DOC_MIME) {
    const exported = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" }
    );
    content = typeof exported.data === "string" ? exported.data : "";
  } else {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "text" }
    );
    content = typeof res.data === "string" ? res.data : "";
  }

  return {
    id: meta.data.id,
    name: meta.data.name,
    mimeType: meta.data.mimeType,
    modifiedTime: meta.data.modifiedTime,
    content,
  };
}

export async function createDriveNote(userId, name, content) {
  const drive = await getDriveClient(userId);
  const rootId = await ensureAppFolder(userId);
  const { folders, baseName } = splitNotePath(name);
  if (!baseName) {
    const err = new Error("파일 이름이 비어 있습니다.");
    err.code = "INVALID_NAME";
    throw err;
  }
  const parentId = await ensureFolderPath(drive, rootId, folders);
  const fileName = `${baseName}.md`;

  const existing = await findChildNote(drive, parentId, fileName);
  if (existing) {
    const updated = await drive.files.update({
      fileId: existing.id,
      media: { mimeType: NOTE_MIME, body: content || "" },
      fields: "id, name, modifiedTime",
    });
    return { ...updated.data, _updated: true };
  }

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentId],
      mimeType: NOTE_MIME,
      appProperties: { markdownEditor: "true" },
    },
    media: {
      mimeType: NOTE_MIME,
      body: content || "",
    },
    fields: "id, name, modifiedTime",
  });
  return { ...res.data, _updated: false };
}

export async function updateDriveNote(userId, fileId, { content, name }) {
  const drive = await getDriveClient(userId);
  const meta = await drive.files.get({
    fileId,
    fields: "id, parents, name, mimeType",
  });
  await assertOwnedByApp(userId, drive, meta.data);

  if (meta.data.mimeType === GOOGLE_DOC_MIME && typeof content === "string") {
    const err = new Error(
      "Google Docs 형식 파일은 직접 수정할 수 없습니다. '이름 바꾸기' 또는 '복제' 후 .md로 저장하세요."
    );
    err.code = "READ_ONLY_DOC";
    throw err;
  }

  const params = {
    fileId,
    fields: "id, name, modifiedTime, parents",
  };

  if (typeof name === "string" && name.length) {
    const { folders, baseName } = splitNotePath(name);
    if (baseName) {
      const rootId = await ensureAppFolder(userId);
      const targetParentId = await ensureFolderPath(drive, rootId, folders);
      const newFileName = `${baseName}.md`;
      params.requestBody = { name: newFileName };
      const currentParents = meta.data.parents || [];
      if (!currentParents.includes(targetParentId)) {
        params.addParents = targetParentId;
        params.removeParents = currentParents.join(",");
      }
    }
  }

  if (typeof content === "string") {
    params.media = { mimeType: NOTE_MIME, body: content };
  }

  const res = await drive.files.update(params);
  return res.data;
}

export async function deleteDriveNote(userId, fileId) {
  const drive = await getDriveClient(userId);
  const meta = await drive.files.get({
    fileId,
    fields: "id, parents, mimeType",
  });
  await assertOwnedByApp(userId, drive, meta.data);
  await drive.files.delete({ fileId });
}

async function assertOwnedByApp(userId, drive, fileMeta) {
  const rootId = await ensureAppFolder(userId);
  const visited = new Set();
  const queue = [...(fileMeta?.parents || [])];
  while (queue.length) {
    const parentId = queue.shift();
    if (!parentId || visited.has(parentId)) continue;
    visited.add(parentId);
    if (parentId === rootId) return;
    try {
      const meta = await drive.files.get({
        fileId: parentId,
        fields: "id, parents",
      });
      for (const p of meta.data.parents || []) queue.push(p);
    } catch {
      // ignore inaccessible ancestors (drive.file scope hides non-app files)
    }
  }
  const err = new Error("앱 폴더 외부 파일은 접근할 수 없습니다.");
  err.code = "FORBIDDEN_FILE";
  throw err;
}
