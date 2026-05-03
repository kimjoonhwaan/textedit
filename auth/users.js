import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const ALGO = "aes-256-gcm";

function deriveKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET 환경변수가 필요합니다.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ct.toString("base64"),
  };
}

function decrypt(payload) {
  if (!payload || !payload.data) return null;
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");
  const decipher = crypto.createDecipheriv(ALGO, deriveKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(data), decipher.final()]);
  return pt.toString("utf8");
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readUsersFile() {
  try {
    const text = await fs.readFile(USERS_FILE, "utf8");
    return JSON.parse(text);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeUsersFile(users) {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export async function upsertUser({ id, email, name, picture, refreshToken }) {
  const users = await readUsersFile();
  const existing = users[id] || {};
  users[id] = {
    id,
    email: email || existing.email,
    name: name || existing.name,
    picture: picture || existing.picture,
    refreshToken: refreshToken
      ? encrypt(refreshToken)
      : existing.refreshToken || null,
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeUsersFile(users);
  return users[id];
}

export async function getUser(id) {
  if (!id) return null;
  const users = await readUsersFile();
  return users[id] || null;
}

export async function getRefreshToken(id) {
  const user = await getUser(id);
  if (!user || !user.refreshToken) return null;
  try {
    return decrypt(user.refreshToken);
  } catch (err) {
    console.error("[users] refresh token decrypt 실패:", err.message);
    return null;
  }
}

export function publicUserView(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  };
}
