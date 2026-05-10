import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NOTES_DIR = path.join(__dirname, "notes");

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

const resolveNotePath = (name) => {
  const safe = normalizeNotePath(name);
  if (!safe) return null;
  return {
    safe,
    filePath: path.join(NOTES_DIR, `${safe}.md`),
  };
};

const ensureNotesDir = async () => {
  await fs.mkdir(NOTES_DIR, { recursive: true });
};

const listNotesRecursive = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listNotesRecursive(fullPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
};

const relativeNoteName = (filePath) => {
  const relative = path.relative(NOTES_DIR, filePath);
  return relative.replace(/\\/g, "/").replace(/\.md$/i, "");
};

const server = new Server(
  {
    name: "StMarkdownEditor",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_note",
      description:
        "새 Markdown 문서를 생성하고 notes 폴더에 저장합니다. name에는 폴더 경로를 포함할 수 있습니다.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "파일명 (확장자 없이, 폴더 경로 포함 가능)",
          },
          content: {
            type: "string",
            description: "Markdown 본문",
          },
        },
        required: ["name", "content"],
      },
    },
    {
      name: "update_note",
      description:
        "기존 Markdown 문서를 덮어써서 업데이트합니다. 문서가 없으면 새로 생성합니다.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "파일명 (확장자 없이, 폴더 경로 포함 가능)",
          },
          content: {
            type: "string",
            description: "Markdown 본문",
          },
        },
        required: ["name", "content"],
      },
    },
    {
      name: "append_note",
      description:
        "기존 Markdown 문서의 끝에 내용을 추가합니다. 문서가 없으면 새로 생성합니다.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "파일명 (확장자 없이, 폴더 경로 포함 가능)",
          },
          content: {
            type: "string",
            description: "추가할 Markdown 본문",
          },
        },
        required: ["name", "content"],
      },
    },
    {
      name: "list_notes",
      description: "notes 폴더에 있는 모든 문서 이름을 반환합니다.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "search_notes",
      description:
        "문서 제목/내용을 검색해 일치하는 문서를 반환합니다.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "검색어",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list_notes") {
    try {
      await ensureNotesDir();
      const files = await listNotesRecursive(NOTES_DIR);
      const notes = files.map(relativeNoteName).sort((a, b) =>
        a.localeCompare(b, "ko")
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ notes }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `목록을 불러오지 못했습니다: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "search_notes") {
    const query = (args?.query ?? "").toString().trim();
    if (!query) {
      return {
        content: [
          {
            type: "text",
            text: "검색어가 필요합니다.",
          },
        ],
        isError: true,
      };
    }

    try {
      await ensureNotesDir();
      const files = await listNotesRecursive(NOTES_DIR);
      const loweredQuery = query.toLowerCase();
      const matches = [];
      for (const filePath of files) {
        const content = await fs.readFile(filePath, "utf-8");
        const nameMatch = relativeNoteName(filePath)
          .toLowerCase()
          .includes(loweredQuery);
        const contentMatch = content.toLowerCase().includes(loweredQuery);
        if (nameMatch || contentMatch) {
          matches.push(relativeNoteName(filePath));
        }
      }
      matches.sort((a, b) => a.localeCompare(b, "ko"));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ matches }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `검색에 실패했습니다: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name !== "create_note" && name !== "update_note" && name !== "append_note") {
    return {
      content: [
        {
          type: "text",
          text: `알 수 없는 도구 요청: ${name}`,
        },
      ],
      isError: true,
    };
  }

  const resolved = resolveNotePath(args?.name);
  if (!resolved) {
    return {
      content: [
        {
          type: "text",
          text: "파일 이름이 올바르지 않습니다.",
        },
      ],
      isError: true,
    };
  }

  try {
    await ensureNotesDir();
    await fs.mkdir(path.dirname(resolved.filePath), { recursive: true });
    const content = args?.content ?? "";
    if (name === "append_note") {
      await fs.appendFile(resolved.filePath, content, "utf-8");
    } else {
      await fs.writeFile(resolved.filePath, content, "utf-8");
    }
    const actionLabel =
      name === "create_note"
        ? "문서를 저장했습니다"
        : name === "update_note"
          ? "문서를 업데이트했습니다"
          : "문서에 내용을 추가했습니다";
    return {
      content: [
        {
          type: "text",
          text: `${actionLabel}: ${resolved.safe}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `문서를 처리하지 못했습니다: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
