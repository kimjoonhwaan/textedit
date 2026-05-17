const noteList = document.getElementById("note-list");
const favoriteList = document.getElementById("favorite-list");
const recentList = document.getElementById("recent-list");
const searchList = document.getElementById("search-list");
const editor = document.getElementById("editor");
const noteNameInput = document.getElementById("note-name");
const createBtn = document.getElementById("create-note");
const createFolderBtn = document.getElementById("create-folder");
const saveBtn = document.getElementById("save-note");
const saveStatus = document.getElementById("save-status");
const currentNoteLabel = document.getElementById("current-note");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const fontSizeSelect = document.getElementById("font-size");
const fontColorInput = document.getElementById("font-color");
const boldToggle = document.getElementById("bold-toggle");
const spellToggle = document.getElementById("spell-toggle");
const preview = document.getElementById("preview");
const editorPane = document.querySelector(".editor-pane");
const viewEditBtn = document.getElementById("view-edit");
const viewSplitBtn = document.getElementById("view-split");
const viewPreviewBtn = document.getElementById("view-preview");
const docSearchInput = document.getElementById("doc-search-input");
const docSearchPrev = document.getElementById("doc-search-prev");
const docSearchNext = document.getElementById("doc-search-next");
const docSearchCount = document.getElementById("doc-search-count");
const templateSelect = document.getElementById("template-select");
const applyTemplateBtn = document.getElementById("apply-template");
const saveTemplateBtn = document.getElementById("save-template");
const historyToggle = document.getElementById("history-toggle");
const historyPanel = document.getElementById("history-panel");
const historyClose = document.getElementById("history-close");
const historyList = document.getElementById("history-list");
const tagList = document.getElementById("tag-list");
const clearTagFilterBtn = document.getElementById("clear-tag-filter");
const noteTagsContainer = document.getElementById("note-tags");
const tagInput = document.getElementById("tag-input");
const addTagBtn = document.getElementById("add-tag");
const autoTagBtn = document.getElementById("auto-tag");
const autoTagStatus = document.getElementById("auto-tag-status");
const aiAskBtn = document.getElementById("ai-ask");
const aiAskStatus = document.getElementById("ai-ask-status");
const backlinkList = document.getElementById("backlink-list");
const backlinksSection = document.getElementById("backlinks-section");
const graphViewBtn = document.getElementById("graph-view-btn");
const graphModal = document.getElementById("graph-modal");
const graphModalClose = document.getElementById("graph-modal-close");
const graphContainer = document.getElementById("graph-container");
const overviewBtn = document.getElementById("overview-btn");
const graphSort = document.getElementById("graph-sort");
const graphTagFilter = document.getElementById("graph-tag-filter");
const graphFilterReset = document.getElementById("graph-filter-reset");
const userWidget = document.getElementById("user-widget");
const userAvatar = document.getElementById("user-avatar");
const userNameEl = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");
const loginOverlay = document.getElementById("login-overlay");
const driveNoteList = document.getElementById("drive-note-list");
const driveRefreshBtn = document.getElementById("drive-refresh-btn");
const driveSyncAllBtn = document.getElementById("drive-sync-all-btn");
const uploadDriveBtn = document.getElementById("upload-drive-btn");
const noteSourceIndicator = document.getElementById("note-source-indicator");

const exportPptBtn = document.getElementById("export-ppt");
const pptModal = document.getElementById("ppt-modal");
const pptModalClose = document.getElementById("ppt-modal-close");
const pptSlideList = document.getElementById("ppt-slide-list");
const pptSlidePreview = document.getElementById("ppt-slide-preview");
const pptSlideCount = document.getElementById("ppt-slide-count");
const pptDownloadBtn = document.getElementById("ppt-download");
const pptAiSummarizeBtn = document.getElementById("ppt-ai-summarize");
const pptResetBtn = document.getElementById("ppt-reset");
const pptAiStatus = document.getElementById("ppt-ai-status");

let currentPptSlides = [];
let originalPptSlides = [];
let currentPptIndex = 0;
let pptAiInFlight = false;

let currentUser = null;
let currentNoteSource = "local"; // "local" | "drive"
let currentDriveFileId = null;
let currentDriveMimeType = null;
let driveNotes = [];

let currentNote = null;
let isSpellcheck = true;
let isDirty = false;
let autosaveTimer = null;
let allNotes = [];
let allFolders = [];
let favorites = [];
let recents = [];
let docSearchQuery = "";
let docSearchMatches = [];
let docSearchIndex = -1;
let viewMode = "split";
let isNameComposing = false;
let tagsByNote = {};
let activeTagFilter = "";
let colorsByNote = {};
let colorsByFolder = {};

const showToast = (message, type = "info", duration = 3000) => {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove());
  }, duration);
};

const AUTO_SAVE_DELAY = 800;
const RECENT_LIMIT = 6;
const FAVORITES_KEY = "notes.favorites";
const RECENTS_KEY = "notes.recents";
const TAGS_KEY = "notes.tags";
const COLORS_KEY = "notes.colors";
const CUSTOM_TEMPLATES_KEY = "notes.templates";
const VERSION_KEY_PREFIX = "notes.versions.";
const VERSION_LIMIT = 20;

const defaultTemplates = [
  {
    id: "meeting",
    label: "회의록",
    content:
      "## 회의록\n- 일시: \n- 참석자: \n- 안건: \n- 결정 사항: \n- 다음 액션: \n",
  },
  {
    id: "daily",
    label: "일일 기록",
    content:
      "## 오늘의 할 일\n- [ ] \n\n## 회고\n- 잘한 점: \n- 개선할 점: \n",
  },
  {
    id: "idea",
    label: "아이디어",
    content:
      "## 아이디어 제목\n\n### 배경\n\n### 내용\n\n### 기대효과\n",
  },
];

const loadCustomTemplates = () => {
  try {
    const value = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.label === "string" &&
            typeof item.content === "string"
        )
      : [];
  } catch (error) {
    console.warn("템플릿 정보를 읽지 못했습니다.", error);
    return [];
  }
};

const saveCustomTemplates = (list) => {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(list));
};

let customTemplates = loadCustomTemplates();

const getAllTemplates = () => [...defaultTemplates, ...customTemplates];

const addCustomTemplate = (label, content) => {
  const trimmedLabel = label.trim();
  const trimmedContent = content.trimEnd();
  if (!trimmedLabel || !trimmedContent) return null;
  const id = `custom-${Date.now()}`;
  const next = [
    ...customTemplates,
    { id, label: trimmedLabel, content: trimmedContent },
  ];
  customTemplates = next;
  saveCustomTemplates(next);
  populateTemplates();
  return id;
};

const loadStoredList = (key) => {
  try {
    const value = localStorage.getItem(key);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("로컬 저장소를 읽지 못했습니다.", error);
    return [];
  }
};

const saveStoredList = (key, list) => {
  localStorage.setItem(key, JSON.stringify(list));
};

const loadTagsMap = () => {
  try {
    const value = localStorage.getItem(TAGS_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("태그 정보를 읽지 못했습니다.", error);
    return {};
  }
};

const saveTagsMap = (map) => {
  localStorage.setItem(TAGS_KEY, JSON.stringify(map));
};

const loadColorsMap = () => {
  try {
    const value = localStorage.getItem(COLORS_KEY);
    if (!value) return { notes: {}, folders: {} };
    const parsed = JSON.parse(value);
    return {
      notes: parsed?.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      folders:
        parsed?.folders && typeof parsed.folders === "object"
          ? parsed.folders
          : {},
    };
  } catch (error) {
    console.warn("색상 정보를 읽지 못했습니다.", error);
    return { notes: {}, folders: {} };
  }
};

const saveColorsMap = (notesMap, foldersMap) => {
  localStorage.setItem(
    COLORS_KEY,
    JSON.stringify({ notes: notesMap ?? {}, folders: foldersMap ?? {} })
  );
};

const normalizeTag = (value) =>
  normalizeName(value)
    .replace(/^#/, "")
    .replace(/["'`\[\]{}()<>]/g, "")
    .trim();

const parseTagsInput = (value) => {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((tag) => normalizeTag(tag))
        .filter(Boolean)
    )
  );
};

const getNoteTags = (name) => tagsByNote[name] ?? [];

const setNoteTags = (name, tags) => {
  if (!name) return;
  tagsByNote = { ...tagsByNote, [name]: tags };
  saveTagsMap(tagsByNote);
};

const getNoteColor = (name) => colorsByNote[name] ?? "";

const setNoteColor = (name, color) => {
  if (!name) return;
  const next = { ...colorsByNote };
  if (color) {
    next[name] = color;
  } else {
    delete next[name];
  }
  colorsByNote = next;
  saveColorsMap(colorsByNote, colorsByFolder);
};

const getFolderColor = (path) => colorsByFolder[path] ?? "";

const setFolderColor = (path, color) => {
  if (!path) return;
  const next = { ...colorsByFolder };
  if (color) {
    next[path] = color;
  } else {
    delete next[path];
  }
  colorsByFolder = next;
  saveColorsMap(colorsByNote, colorsByFolder);
};

const loadVersions = (name) => {
  if (!name) return [];
  try {
    const value = localStorage.getItem(`${VERSION_KEY_PREFIX}${name}`);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("버전 정보를 읽지 못했습니다.", error);
    return [];
  }
};

const saveVersions = (name, versions) => {
  if (!name) return;
  localStorage.setItem(`${VERSION_KEY_PREFIX}${name}`, JSON.stringify(versions));
};

const renameVersionsKey = (oldName, newName) => {
  if (!oldName || !newName || oldName === newName) return;
  const versions = loadVersions(oldName);
  if (versions.length > 0) {
    saveVersions(newName, versions);
  }
  localStorage.removeItem(`${VERSION_KEY_PREFIX}${oldName}`);
};

const removeVersionsKey = (name) => {
  if (!name) return;
  localStorage.removeItem(`${VERSION_KEY_PREFIX}${name}`);
};

const renderHistoryList = (versions = loadVersions(currentNote)) => {
  if (!historyList) return;
  historyList.innerHTML = "";
  if (!currentNote) {
    const li = document.createElement("li");
    li.textContent = "문서를 선택하세요.";
    historyList.appendChild(li);
    return;
  }
  if (versions.length === 0) {
    const li = document.createElement("li");
    li.textContent = "저장된 버전이 없습니다.";
    historyList.appendChild(li);
    return;
  }
  versions.forEach((version) => {
    const li = document.createElement("li");
    li.className = "history-item";

    const time = document.createElement("time");
    const date = new Date(version.timestamp);
    time.textContent = date.toLocaleString();
    li.appendChild(time);

    const previewText = document.createElement("p");
    previewText.textContent = (version.content || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    li.appendChild(previewText);

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.textContent = "이 버전 복원";
    restoreBtn.addEventListener("click", () => {
      editor.value = version.content || "";
      renderPreview(editor.value, docSearchQuery);
      if (docSearchQuery) {
        findDocMatches();
      }
      markDirty();
      scheduleAutosave();
    });
    li.appendChild(restoreBtn);

    historyList.appendChild(li);
  });
};

const addVersion = (name, content) => {
  if (!name) return;
  const versions = loadVersions(name);
  const latest = versions[0];
  if (latest && latest.content === content) {
    return;
  }
  const newVersion = {
    timestamp: new Date().toISOString(),
    content,
  };
  const nextVersions = [newVersion, ...versions].slice(0, VERSION_LIMIT);
  saveVersions(name, nextVersions);
  if (name === currentNote) {
    renderHistoryList(nextVersions);
  }
};

const fetchNotes = async () => {
  const [notesResponse, foldersResponse] = await Promise.all([
    fetch("/api/notes"),
    fetch("/api/folders"),
  ]);
  const notesData = await notesResponse.json();
  const foldersData = await foldersResponse.json();
  allNotes = (notesData.notes || [])
    .map((file) => normalizePath(file).replace(/\.md$/, ""))
    .filter(Boolean);
  allFolders = (foldersData.folders || [])
    .map((folder) => normalizePath(folder))
    .filter(Boolean);
  const cleanedTags = {};
  allNotes.forEach((note) => {
    if (tagsByNote[note]) {
      cleanedTags[note] = tagsByNote[note];
    }
  });
  tagsByNote = cleanedTags;
  saveTagsMap(tagsByNote);

  const cleanedNoteColors = {};
  allNotes.forEach((note) => {
    if (colorsByNote[note]) {
      cleanedNoteColors[note] = colorsByNote[note];
    }
  });
  const cleanedFolderColors = {};
  allFolders.forEach((folder) => {
    if (colorsByFolder[folder]) {
      cleanedFolderColors[folder] = colorsByFolder[folder];
    }
  });
  colorsByNote = cleanedNoteColors;
  colorsByFolder = cleanedFolderColors;
  saveColorsMap(colorsByNote, colorsByFolder);

  renderFilteredNoteTree();
  renderFavoriteList();
  renderRecentList();
  renderTagSidebar();
  renderNoteTags();
};

const normalizeName = (value) => (value ? value.normalize("NFC") : "");

const normalizePath = (value) =>
  normalizeName(value)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");

const ALLOWED_IMPORT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".mdown",
  ".mkd",
  ".txt",
]);

const getFileExtension = (filename) => {
  if (!filename) return "";
  const match = /\.([^.]+)$/.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : "";
};

const stripFileExtension = (filename) =>
  filename ? filename.replace(/\.[^/.]+$/, "") : "";

const isImportableFile = (file) => {
  if (!file) return false;
  if (file.type && file.type.startsWith("text/")) return true;
  const ext = getFileExtension(file.name);
  return ALLOWED_IMPORT_EXTENSIONS.has(ext);
};

const buildImportedNoteName = (folderPath, fileName) => {
  const base = normalizeName(stripFileExtension(fileName)).trim();
  if (!base) return "";
  const combined = folderPath ? `${folderPath}/${base}` : base;
  return normalizePath(combined);
};

const importFilesToFolder = async (files, folderPath) => {
  const fileArray = Array.from(files ?? []);
  if (fileArray.length === 0) return;
  const importable = fileArray.filter(isImportableFile);
  const skipped = fileArray.length - importable.length;
  if (skipped > 0) {
    showToast("가져올 수 없는 파일이 있어 제외했습니다.", "warning");
  }
  let successCount = 0;
  for (const file of importable) {
    const noteName = buildImportedNoteName(folderPath, file.name);
    if (!noteName) {
      showToast("파일 이름이 올바르지 않아 건너뛰었습니다.", "warning");
      continue;
    }
    try {
      const content = await file.text();
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: noteName, content }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "파일을 저장하지 못했습니다.");
      }
      successCount += 1;
    } catch (error) {
      console.error(error);
      showToast(error.message, "error");
    }
  }
  if (successCount > 0) {
    showToast(`파일 ${successCount}개를 가져왔습니다.`, "success");
    await fetchNotes();
  }
};

const getBaseName = (name) => {
  const normalized = normalizePath(name);
  if (!normalized) return "";
  const parts = normalized.split("/");
  return parts[parts.length - 1];
};

const createActionButton = (label, className, handler) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return btn;
};

const createNoteListItem = (
  name,
  { showStar = false, showActions = false, displayName, showTags = true } = {}
) => {
  const li = document.createElement("li");
  li.classList.add("note-item");
  li.draggable = true;
  li.dataset.note = name;

  li.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", name);
    event.dataTransfer.effectAllowed = "move";
    li.classList.add("dragging");
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
  });

  const nameWrapper = document.createElement("div");
  nameWrapper.className = "note-name";

  const nameTitle = document.createElement("span");
  nameTitle.className = "note-title";
  nameTitle.textContent = displayName ?? name;
  const noteColor = getNoteColor(name);
  if (noteColor) {
    nameTitle.style.color = noteColor;
  }
  nameWrapper.appendChild(nameTitle);

  if (showTags) {
    const tags = getNoteTags(name);
    if (tags.length > 0) {
      const tagContainer = document.createElement("span");
      tagContainer.className = "note-tags";
      tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "tag-chip";
        chip.textContent = `#${tag}`;
        tagContainer.appendChild(chip);
      });
      nameWrapper.appendChild(tagContainer);
    }
  }

  li.appendChild(nameWrapper);

  const actions = document.createElement("div");
  actions.className = "note-actions";

  if (showActions) {
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "action-btn row-menu-trigger";
    moreBtn.textContent = "⋯";
    moreBtn.title = "메뉴";
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRowMenu(moreBtn, [
        { label: "이름 변경", onClick: () => handleRename(name) },
        { label: "색상", onClick: () => handleNoteColor(name) },
        { label: "삭제", danger: true, onClick: () => handleDelete(name) },
      ]);
    });
    actions.appendChild(moreBtn);
  }

  if (showStar) {
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "fav-toggle";
    favBtn.textContent = favorites.includes(name) ? "★" : "☆";
    favBtn.classList.toggle("active", favorites.includes(name));
    favBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(name);
    });
    actions.appendChild(favBtn);
  }

  if (actions.childNodes.length > 0) {
    li.appendChild(actions);
  }

  li.addEventListener("click", () => loadNote(name));
  return li;
};

const buildNoteTree = (notes, folders) => {
  const root = { folders: new Map(), files: [] };
  folders.forEach((folder) => {
    const normalized = normalizePath(folder);
    if (!normalized) return;
    const parts = normalized.split("/");
    let node = root;
    parts.forEach((part) => {
      if (!node.folders.has(part)) {
        node.folders.set(part, { folders: new Map(), files: [] });
      }
      node = node.folders.get(part);
    });
  });
  notes.forEach((note) => {
    const normalized = normalizePath(note);
    if (!normalized) return;
    const parts = normalized.split("/");
    const fileName = parts.pop();
    let node = root;
    parts.forEach((part) => {
      if (!node.folders.has(part)) {
        node.folders.set(part, { folders: new Map(), files: [] });
      }
      node = node.folders.get(part);
    });
    if (fileName) {
      node.files.push(normalized);
    }
  });
  return root;
};

const naturalCompare = (a, b) =>
  String(a).localeCompare(String(b), "ko", {
    numeric: true,
    sensitivity: "base",
  });

const renderTree = (node, container, basePath = "") => {
  const folderNames = Array.from(node.folders.keys()).sort(naturalCompare);
  folderNames.forEach((folder) => {
    const folderNode = node.folders.get(folder);
    const folderPath = basePath ? `${basePath}/${folder}` : folder;
    const li = document.createElement("li");
    li.className = "folder-item";

    const label = document.createElement("div");
    label.className = "folder-label";
    label.dataset.path = folderPath;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = folder;
    const folderColor = getFolderColor(folderPath);
    if (folderColor) {
      nameSpan.style.color = folderColor;
    }
    label.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.className = "folder-actions";
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "action-btn row-menu-trigger";
    moreBtn.textContent = "⋯";
    moreBtn.title = "메뉴";
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openRowMenu(moreBtn, [
        { label: "새 문서", onClick: () => handleCreateNoteInFolder(folderPath) },
        { label: "하위 폴더", onClick: () => handleCreateFolder(folderPath) },
        { label: "이름 변경", onClick: () => handleRenameFolder(folderPath) },
        { label: "색상", onClick: () => handleFolderColor(folderPath) },
        { label: "삭제", danger: true, onClick: () => handleDeleteFolder(folderPath) },
      ]);
    });
    actions.appendChild(moreBtn);
    label.appendChild(actions);

    label.addEventListener("dragover", (event) => {
      event.preventDefault();
      label.classList.add("drop-target");
    });

    label.addEventListener("dragleave", () => {
      label.classList.remove("drop-target");
    });

    label.addEventListener("drop", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      label.classList.remove("drop-target");
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        await importFilesToFolder(files, folderPath);
        return;
      }
      const draggedName = event.dataTransfer.getData("text/plain");
      if (!draggedName) return;
      await moveNoteToFolder(draggedName, folderPath);
    });

    const children = document.createElement("ul");
    children.className = "folder-children";
    renderTree(folderNode, children, folderPath);

    label.addEventListener("click", () => {
      children.classList.toggle("collapsed");
      label.classList.toggle("collapsed", children.classList.contains("collapsed"));
    });

    li.appendChild(label);
    li.appendChild(children);
    container.appendChild(li);
  });

  const sortedFiles = node.files.slice().sort(naturalCompare);
  sortedFiles.forEach((note) => {
    const li = createNoteListItem(note, {
      showStar: true,
      showActions: true,
      displayName: getBaseName(note),
    });
    container.appendChild(li);
  });
};

const renderNoteList = (notes, folders = []) => {
  noteList.innerHTML = "";
  const tree = buildNoteTree(notes, folders);
  renderTree(tree, noteList);

  if (!noteList.dataset.dropReady) {
    noteList.dataset.dropReady = "true";

    noteList.addEventListener("dragover", (event) => {
      event.preventDefault();
      noteList.classList.add("drop-target");
    });

    noteList.addEventListener("dragleave", (event) => {
      if (event.relatedTarget && noteList.contains(event.relatedTarget)) return;
      noteList.classList.remove("drop-target");
    });

    noteList.addEventListener("drop", async (event) => {
      event.preventDefault();
      noteList.classList.remove("drop-target");
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        if (event.target.closest(".folder-label")) return;
        await importFilesToFolder(files, "");
        return;
      }
      const draggedName = event.dataTransfer.getData("text/plain");
      if (!draggedName) return;
      if (event.target.closest(".folder-label")) return;
      await moveNoteToFolder(draggedName, "");
    });
  }
};

const renderFavoriteList = () => {
  if (!favoriteList) return;
  favoriteList.innerHTML = "";
  const availableFavorites = favorites.filter((name) => allNotes.includes(name));
  if (availableFavorites.length === 0) {
    const li = document.createElement("li");
    li.textContent = "즐겨찾기 없음";
    favoriteList.appendChild(li);
    return;
  }
  availableFavorites.forEach((name) => {
    const li = createNoteListItem(name, { showActions: true, showStar: true });
    favoriteList.appendChild(li);
  });
};

const renderRecentList = () => {
  if (!recentList) return;
  recentList.innerHTML = "";
  const availableRecents = recents.filter((name) => allNotes.includes(name));
  if (availableRecents.length === 0) {
    const li = document.createElement("li");
    li.textContent = "최근 문서 없음";
    recentList.appendChild(li);
    return;
  }
  availableRecents.forEach((name) => {
    const li = createNoteListItem(name, { showActions: true, showStar: true });
    recentList.appendChild(li);
  });
};

const filterFoldersForNotes = (notes, folders) => {
  const visibleFolders = new Set();
  notes.forEach((note) => {
    const normalized = normalizePath(note);
    if (!normalized) return;
    const parts = normalized.split("/");
    parts.pop();
    let current = "";
    parts.forEach((part) => {
      current = current ? `${current}/${part}` : part;
      visibleFolders.add(current);
    });
  });
  return folders.filter((folder) => visibleFolders.has(normalizePath(folder)));
};

const getFilteredNotes = () => {
  if (!activeTagFilter) return allNotes.slice();
  return allNotes.filter((note) => getNoteTags(note).includes(activeTagFilter));
};

const renderTagSidebar = () => {
  if (!tagList) return;
  const counts = new Map();
  allNotes.forEach((note) => {
    getNoteTags(note).forEach((tag) => {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    });
  });
  tagList.innerHTML = "";
  if (activeTagFilter && !counts.has(activeTagFilter)) {
    activeTagFilter = "";
    renderFilteredNoteTree();
  }
  const tags = Array.from(counts.keys()).sort();
  if (tags.length === 0) {
    const li = document.createElement("li");
    li.textContent = "태그 없음";
    tagList.appendChild(li);
    return;
  }
  tags.forEach((tag) => {
    const li = document.createElement("li");
    li.className = "tag-item";
    li.textContent = `${tag} (${counts.get(tag)})`;
    li.classList.toggle("active", tag === activeTagFilter);
    li.addEventListener("click", () => {
      activeTagFilter = tag === activeTagFilter ? "" : tag;
      renderFilteredNoteTree();
    });
    tagList.appendChild(li);
  });
};

const setAutoTagStatus = (state, message) => {
  if (!autoTagStatus) return;
  autoTagStatus.textContent = message ?? "";
  autoTagStatus.classList.remove("loading", "success", "error");
  if (state) {
    autoTagStatus.classList.add(state);
  }
};

const setAiAskStatus = (state, message) => {
  if (!aiAskStatus) return;
  aiAskStatus.textContent = message ?? "";
  aiAskStatus.classList.remove("loading", "success", "error");
  if (state) {
    aiAskStatus.classList.add(state);
  }
};

const renderNoteTags = () => {
  if (!noteTagsContainer) return;
  noteTagsContainer.innerHTML = "";
  if (!currentNote) {
    const span = document.createElement("span");
    span.className = "tag-empty";
    span.textContent = "문서를 선택하세요.";
    noteTagsContainer.appendChild(span);
    setAutoTagStatus("", "");
    return;
  }
  const tags = getNoteTags(currentNote);
  if (tags.length === 0) {
    const span = document.createElement("span");
    span.className = "tag-empty";
    span.textContent = "태그 없음";
    noteTagsContainer.appendChild(span);
    return;
  }
  tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = `#${tag}`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tag-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      const nextTags = getNoteTags(currentNote).filter((item) => item !== tag);
      setNoteTags(currentNote, nextTags);
      renderNoteTags();
      renderTagSidebar();
      renderFilteredNoteTree();
    });
    chip.appendChild(removeBtn);
    noteTagsContainer.appendChild(chip);
  });
};

const addTagsToCurrentNote = (tagsToAdd) => {
  if (!currentNote) {
    showToast("먼저 문서를 선택하세요.", "warning");
    return;
  }
  const currentTags = getNoteTags(currentNote);
  const nextTags = Array.from(new Set([...currentTags, ...tagsToAdd]));
  setNoteTags(currentNote, nextTags);
  renderNoteTags();
  renderTagSidebar();
  renderFilteredNoteTree();
};

const requestAutoTags = async () => {
  if (!currentNote) {
    showToast("먼저 문서를 선택하세요.", "warning");
    return;
  }
  const content = editor.value.trim();
  if (!content) {
    showToast("내용이 비어 있습니다.", "warning");
    return;
  }
  if (autoTagBtn) {
    autoTagBtn.disabled = true;
  }
  setAutoTagStatus("loading", "자동 태그 생성 중...");
  try {
    const response = await fetch("/api/tags/auto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        existingTags: getNoteTags(currentNote),
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "태그 생성 실패");
    }
    const data = await response.json();
    const tags = Array.isArray(data.tags)
      ? data.tags.map((tag) => normalizeTag(tag)).filter(Boolean)
      : [];
    if (tags.length === 0) {
      setAutoTagStatus("error", "추천 태그가 없습니다.");
      return;
    }
    addTagsToCurrentNote(tags);
    setAutoTagStatus("success", `자동 태그 ${tags.length}개 추가`);
  } catch (error) {
    setAutoTagStatus("error", error.message || "태그 생성 실패");
  } finally {
    if (autoTagBtn) {
      autoTagBtn.disabled = false;
    }
  }
};

const appendAiAnswer = (question, answer) => {
  const timestamp = new Date().toLocaleString();
  const prefix = editor.value.trim() ? "\n\n---\n\n" : "";
  const block = `${prefix}### AI 질문 (${timestamp})\n- 질문: ${question}\n\n#### 답변\n${answer.trim()}\n`;
  editor.value = `${editor.value}${block}`;
  renderPreview(editor.value, docSearchQuery);
  if (docSearchQuery) {
    findDocMatches();
  }
  markDirty();
  scheduleAutosave();
};

const requestAiAnswer = async () => {
  if (!currentNote) {
    showToast("먼저 문서를 선택하세요.", "warning");
    return;
  }
  const question = window.prompt("AI에게 질문을 입력하세요.", "");
  if (!question) {
    showToast("질문이 필요합니다.", "warning");
    return;
  }
  const content = editor.value.trim();
  if (!content) {
    showToast("내용이 비어 있습니다.", "warning");
    return;
  }
  if (aiAskBtn) {
    aiAskBtn.disabled = true;
  }
  setAiAskStatus("loading", "AI 답변 생성 중...");
  try {
    const response = await fetch("/api/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        question,
        note: currentNote,
      }),
    });
    if (!response.ok) {
      let message = "AI 답변 실패";
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorData = await response.json().catch(() => ({}));
        message = errorData.detail || errorData.error || message;
      } else {
        const text = await response.text().catch(() => "");
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }
    const data = await response.json();
    const answer = (data.answer ?? "").toString().trim();
    if (!answer) {
      setAiAskStatus("error", "AI 응답이 비어 있습니다.");
      return;
    }
    appendAiAnswer(question, answer);
    setAiAskStatus("success", "AI 답변을 추가했습니다.");
  } catch (error) {
    setAiAskStatus("error", error.message || "AI 답변 실패");
  } finally {
    if (aiAskBtn) {
      aiAskBtn.disabled = false;
    }
  }
};

const renderFilteredNoteTree = () => {
  const filteredNotes = getFilteredNotes();
  const filteredFolders = activeTagFilter
    ? filterFoldersForNotes(filteredNotes, allFolders)
    : allFolders;
  renderNoteList(filteredNotes, filteredFolders);
};

const toggleFavorite = (name) => {
  if (favorites.includes(name)) {
    favorites = favorites.filter((item) => item !== name);
  } else {
    favorites = [name, ...favorites.filter((item) => item !== name)];
  }
  saveStoredList(FAVORITES_KEY, favorites);
  renderFavoriteList();
  renderFilteredNoteTree();
};

const updateRecent = (name) => {
  recents = [name, ...recents.filter((item) => item !== name)].slice(
    0,
    RECENT_LIMIT
  );
  saveStoredList(RECENTS_KEY, recents);
  renderRecentList();
};

const replaceNameInList = (list, oldName, newName) => {
  const updated = list.map((item) => (item === oldName ? newName : item));
  return Array.from(new Set(updated));
};

const removeNameFromList = (list, name) => list.filter((item) => item !== name);

const replaceFolderPrefixInList = (list, fromPrefix, toPrefix) => {
  const updated = list.map((item) =>
    item.startsWith(`${fromPrefix}/`)
      ? `${toPrefix}${item.slice(fromPrefix.length)}`
      : item
  );
  return Array.from(new Set(updated));
};

const replaceFolderPrefixInTags = (fromPrefix, toPrefix) => {
  const updated = {};
  Object.keys(tagsByNote).forEach((name) => {
    if (name === fromPrefix || name.startsWith(`${fromPrefix}/`)) {
      const nextName = `${toPrefix}${name.slice(fromPrefix.length)}`;
      updated[nextName] = tagsByNote[name];
      return;
    }
    updated[name] = tagsByNote[name];
  });
  tagsByNote = updated;
  saveTagsMap(tagsByNote);
};

const replaceFolderPrefixInColors = (fromPrefix, toPrefix) => {
  const nextNoteColors = {};
  Object.keys(colorsByNote).forEach((name) => {
    if (name === fromPrefix || name.startsWith(`${fromPrefix}/`)) {
      const nextName = `${toPrefix}${name.slice(fromPrefix.length)}`;
      nextNoteColors[nextName] = colorsByNote[name];
      return;
    }
    nextNoteColors[name] = colorsByNote[name];
  });
  const nextFolderColors = {};
  Object.keys(colorsByFolder).forEach((path) => {
    if (path === fromPrefix || path.startsWith(`${fromPrefix}/`)) {
      const nextPath = `${toPrefix}${path.slice(fromPrefix.length)}`;
      nextFolderColors[nextPath] = colorsByFolder[path];
      return;
    }
    nextFolderColors[path] = colorsByFolder[path];
  });
  colorsByNote = nextNoteColors;
  colorsByFolder = nextFolderColors;
  saveColorsMap(colorsByNote, colorsByFolder);
};

const removeFolderTags = (folderPrefix) => {
  const updated = {};
  Object.keys(tagsByNote).forEach((name) => {
    if (name === folderPrefix || name.startsWith(`${folderPrefix}/`)) {
      return;
    }
    updated[name] = tagsByNote[name];
  });
  tagsByNote = updated;
  saveTagsMap(tagsByNote);
};

const removeFolderColors = (folderPrefix) => {
  const nextNoteColors = {};
  Object.keys(colorsByNote).forEach((name) => {
    if (name === folderPrefix || name.startsWith(`${folderPrefix}/`)) {
      return;
    }
    nextNoteColors[name] = colorsByNote[name];
  });
  const nextFolderColors = {};
  Object.keys(colorsByFolder).forEach((path) => {
    if (path === folderPrefix || path.startsWith(`${folderPrefix}/`)) {
      return;
    }
    nextFolderColors[path] = colorsByFolder[path];
  });
  colorsByNote = nextNoteColors;
  colorsByFolder = nextFolderColors;
  saveColorsMap(colorsByNote, colorsByFolder);
};

const removeFolderFromList = (list, folderPrefix) =>
  list.filter((item) => !item.startsWith(`${folderPrefix}/`));

const renameFolderVersions = (fromPrefix, toPrefix) => {
  const fromKeyPrefix = `${VERSION_KEY_PREFIX}${fromPrefix}/`;
  const toKeyPrefix = `${VERSION_KEY_PREFIX}${toPrefix}/`;
  const keysToRename = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(fromKeyPrefix)) {
      keysToRename.push(key);
    }
  }
  keysToRename.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.setItem(
        `${toKeyPrefix}${key.slice(fromKeyPrefix.length)}`,
        value
      );
    }
    localStorage.removeItem(key);
  });
};

const removeFolderVersions = (folderPrefix) => {
  const prefix = `${VERSION_KEY_PREFIX}${folderPrefix}/`;
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
};

const populateTemplates = () => {
  if (!templateSelect) return;
  templateSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "선택...";
  templateSelect.appendChild(placeholder);
  getAllTemplates().forEach((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    templateSelect.appendChild(option);
  });
};

const insertTemplateContent = (content) => {
  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? editor.value.length;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  editor.value = `${before}${content}${after}`;
  const cursor = start + content.length;
  editor.setSelectionRange(cursor, cursor);
  renderPreview(editor.value, docSearchQuery);
  if (docSearchQuery) {
    findDocMatches();
  }
  markDirty();
  scheduleAutosave();
};

const escapeRegExp = (text) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderMarkdownFallback = (content, highlightQuery = "") => {
  const lines = (content || "").split(/\n/);
  let html = "";
  let inUnorderedList = false;
  let inOrderedList = false;

  const closeLists = () => {
    if (inUnorderedList) {
      html += "</ul>";
      inUnorderedList = false;
    }
    if (inOrderedList) {
      html += "</ol>";
      inOrderedList = false;
    }
  };

  lines.forEach((line) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);

    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      html += "<h" + level + ">" + escapeHtml(headingMatch[2]) + "</h" + level + ">";
      return;
    }

    if (unorderedMatch) {
      if (!inUnorderedList) {
        closeLists();
        html += "<ul>";
        inUnorderedList = true;
      }
      html += "<li>" + escapeHtml(unorderedMatch[1]) + "</li>";
      return;
    }

    if (orderedMatch) {
      if (!inOrderedList) {
        closeLists();
        html += "<ol>";
        inOrderedList = true;
      }
      html += "<li>" + escapeHtml(orderedMatch[2]) + "</li>";
      return;
    }

    closeLists();

    if (!line.trim()) {
      return;
    }

    html += "<p>" + escapeHtml(line) + "</p>";
  });

  closeLists();

  if (highlightQuery) {
    const safeQuery = escapeRegExp(highlightQuery);
    const regex = new RegExp("(" + safeQuery + ")", "gi");
    html = html.replace(regex, "<mark>$1</mark>");
  }

  return html;
};

const getTaskLines = (content) => {
  const lines = (content || "").split("\n");
  const tasks = [];
  lines.forEach((line, lineIndex) => {
    if (/^\s*(?:[-*+]|\d+\.)\s+\[( |x|X)\]\s+/.test(line)) {
      const match = line.match(/\[( |x|X)\]/);
      tasks.push({
        lineIndex,
        checked: match ? match[1].toLowerCase() === "x" : false,
      });
    }
  });
  return tasks;
};

const toggleTaskAtIndex = (content, taskIndex, isChecked) => {
  const lines = (content || "").split("\n");
  const tasks = getTaskLines(content);
  const task = tasks[taskIndex];
  if (!task) return content;
  const line = lines[task.lineIndex];
  lines[task.lineIndex] = line.replace(
    /\[( |x|X)\]/,
    isChecked ? "[x]" : "[ ]"
  );
  return lines.join("\n");
};

const syncPreviewTaskCheckboxes = (content) => {
  if (!preview) return;
  const tasks = getTaskLines(content);
  const checkboxes = preview.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((checkbox, index) => {
    const task = tasks[index];
    checkbox.disabled = false;
    checkbox.dataset.taskIndex = String(index);
    if (task) {
      checkbox.checked = task.checked;
    }
  });
};

const processWikiLinks = (content) =>
  content.replace(/\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g, (_, name, alias) => {
    const noteName = name.trim();
    const displayName = alias ? alias.trim() : noteName;
    const exists = allNotes.includes(noteName);
    const cls = exists ? "wikilink" : "wikilink wikilink-missing";
    return `<a class="${cls}" data-note="${escapeHtml(noteName)}">${escapeHtml(displayName)}</a>`;
  });

const renderPreview = (content, highlightQuery = "") => {
  if (!preview) return;
  if (window.marked) {
    let html = window.DOMPurify
      ? window.DOMPurify.sanitize(window.marked.parse(processWikiLinks(content || "")))
      : window.marked.parse(processWikiLinks(content || ""));
    if (highlightQuery) {
      const safeQuery = escapeRegExp(highlightQuery);
      const regex = new RegExp("(" + safeQuery + ")", "gi");
      html = html.replace(regex, "<mark>$1</mark>");
    }
    preview.innerHTML = html;
  } else {
    preview.innerHTML = renderMarkdownFallback(content, highlightQuery);
  }
  syncPreviewTaskCheckboxes(content);
};

if (preview) {
  preview.addEventListener("click", (event) => {
    const link = event.target.closest(".wikilink");
    if (!link) return;
    event.preventDefault();
    const noteName = link.dataset.note;
    if (noteName) loadNote(noteName);
  });

  preview.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "checkbox") return;
    const index = Number(target.dataset.taskIndex);
    if (!Number.isFinite(index)) return;
    const updated = toggleTaskAtIndex(editor.value, index, target.checked);
    if (updated !== editor.value) {
      editor.value = updated;
      markDirty();
      scheduleAutosave();
      renderPreview(editor.value, docSearchQuery);
    }
  });
}

const updateDocSearchCount = () => {
  if (!docSearchCount) return;
  if (docSearchMatches.length === 0) {
    docSearchCount.textContent = "0/0";
    return;
  }
  docSearchCount.textContent = `${docSearchIndex + 1}/${docSearchMatches.length}`;
};

const findDocMatches = () => {
  const content = editor.value || "";
  if (!docSearchQuery) {
    docSearchMatches = [];
    docSearchIndex = -1;
    updateDocSearchCount();
    renderPreview(content);
    return;
  }
  const query = docSearchQuery;
  const matches = [];
  let startIndex = 0;
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  while (true) {
    const index = lowerContent.indexOf(lowerQuery, startIndex);
    if (index === -1) break;
    matches.push(index);
    startIndex = index + query.length;
  }
  docSearchMatches = matches;
  docSearchIndex = matches.length > 0 ? 0 : -1;
  updateDocSearchCount();
  renderPreview(content, docSearchQuery);
  selectDocMatch();
};

const getEditorLineHeight = () => {
  const style = window.getComputedStyle(editor);
  const lineHeight = parseFloat(style.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;
  const fontSize = parseFloat(style.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.3 : null;
};

const scrollPreviewToMatch = () => {
  if (!preview) return;
  const marks = preview.querySelectorAll("mark");
  const target = marks[docSearchIndex];
  if (target) {
    target.scrollIntoView({ block: "center", behavior: "auto" });
  }
};

const selectDocMatch = () => {
  if (docSearchIndex === -1 || docSearchMatches.length === 0) return;
  const start = docSearchMatches[docSearchIndex];
  const end = start + docSearchQuery.length;
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(start, end);

  requestAnimationFrame(() => {
    const maxScrollTop = editor.scrollHeight - editor.clientHeight;
    if (maxScrollTop > 0) {
      const lineHeight = getEditorLineHeight();
      if (lineHeight) {
        const lineIndex = editor.value.slice(0, start).split("\n").length - 1;
        const targetScroll = lineIndex * lineHeight - editor.clientHeight * 0.3;
        editor.scrollTop = Math.min(
          maxScrollTop,
          Math.max(0, targetScroll)
        );
      } else {
        const contentLength = editor.value.length || 1;
        const targetScroll = maxScrollTop * (start / contentLength);
        editor.scrollTop = Math.min(maxScrollTop, Math.max(0, targetScroll));
      }
    }
    scrollPreviewToMatch();
  });

  updateDocSearchCount();
};

const moveDocMatch = (direction) => {
  if (docSearchMatches.length === 0) return;
  docSearchIndex =
    (docSearchIndex + direction + docSearchMatches.length) %
    docSearchMatches.length;
  selectDocMatch();
};

const syncDocSearchIndexWithSelection = () => {
  if (!docSearchQuery || docSearchMatches.length === 0) return;
  const cursor = editor.selectionStart ?? 0;
  const matchIndex = docSearchMatches.findIndex((start) =>
    cursor >= start && cursor <= start + docSearchQuery.length
  );
  if (matchIndex !== -1) {
    docSearchIndex = matchIndex;
  }
};

const getCurrentDocMatchIndex = () => {
  if (!docSearchQuery || docSearchMatches.length === 0) return -1;
  const cursorStart = editor.selectionStart ?? 0;
  const cursorEnd = editor.selectionEnd ?? cursorStart;
  const exactIndex = docSearchMatches.findIndex(
    (start) => cursorStart === start && cursorEnd === start + docSearchQuery.length
  );
  if (exactIndex !== -1) return exactIndex;
  const rangeIndex = docSearchMatches.findIndex(
    (start) => cursorStart >= start && cursorStart <= start + docSearchQuery.length
  );
  if (rangeIndex !== -1) return rangeIndex;
  let prevIndex = -1;
  docSearchMatches.forEach((start, index) => {
    if (start < cursorStart) {
      prevIndex = index;
    }
  });
  return prevIndex;
};

const moveDocMatchForwardWithAlert = () => {
  if (!docSearchQuery) return false;
  if (docSearchMatches.length === 0) {
    showToast("검색 결과가 없습니다.", "info");
    return true;
  }
  let currentIndex = getCurrentDocMatchIndex();
  if (currentIndex === -1 && docSearchIndex >= 0) {
    currentIndex = docSearchIndex;
  }
  const nextIndex = currentIndex + 1;
  if (nextIndex < docSearchMatches.length) {
    docSearchIndex = nextIndex;
    selectDocMatch();
    return true;
  }
  showToast("다음 검색어가 없습니다.", "info");
  return true;
};

const setViewMode = (mode) => {
  if (!editorPane) return;
  viewMode = mode;
  editorPane.classList.remove("view-edit", "view-split", "view-preview");
  editorPane.classList.add(`view-${mode}`);
  viewEditBtn?.classList.toggle("active", mode === "edit");
  viewSplitBtn?.classList.toggle("active", mode === "split");
  viewPreviewBtn?.classList.toggle("active", mode === "preview");
};

const setSaveStatus = (state, text) => {
  if (!saveStatus) return;
  saveStatus.textContent = text;
  saveStatus.classList.remove("saving", "dirty", "saved");
  if (state) {
    saveStatus.classList.add(state);
  }
};

const markSaved = () => {
  isDirty = false;
  setSaveStatus("saved", "저장됨");
};

const markDirty = () => {
  if (!currentNote) return;
  isDirty = true;
  setSaveStatus("dirty", "변경 있음");
};

const scheduleAutosave = () => {
  if (!currentNote) return;
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
  }
  autosaveTimer = setTimeout(() => {
    if (!isDirty) return;
    saveNote({ silent: true });
  }, AUTO_SAVE_DELAY);
};

const saveNote = async ({ silent } = {}) => {
  if (!currentNote) {
    if (!silent) {
      showToast("먼저 문서를 선택하세요.", "warning");
    }
    return false;
  }
  if (
    currentNoteSource === "drive" &&
    currentDriveMimeType === "application/vnd.google-apps.document"
  ) {
    setSaveStatus("saved", "읽기 전용");
    if (!silent) {
      showToast("Google Docs는 읽기 전용입니다.", "warning");
    }
    return false;
  }

  setSaveStatus("saving", "저장 중...");

  let response;
  if (currentNoteSource === "drive" && currentDriveFileId) {
    response = await fetch(`/api/drive/notes/${encodeURIComponent(currentDriveFileId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editor.value }),
    });
  } else {
    response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: currentNote, content: editor.value }),
    });
  }

  if (!response.ok) {
    setSaveStatus("dirty", "저장 실패");
    if (!silent) {
      showToast("저장 실패", "error");
    }
    return false;
  }
  markSaved();
  addVersion(currentNote, editor.value);
  return true;
};

const loadNote = async (name) => {
  const response = await fetch(`/api/notes/${encodeURIComponent(name)}`);
  if (!response.ok) {
    showToast("문서를 불러오지 못했습니다.", "error");
    return;
  }
  const data = await response.json();
  currentNoteSource = "local";
  currentDriveFileId = null;
  currentDriveMimeType = null;
  updateNoteSourceIndicator();
  currentNote = normalizeName(data.name);
  currentNoteLabel.textContent = `편집 중: ${currentNote}`;
  editor.value = data.content;
  renderPreview(editor.value, docSearchQuery);
  if (docSearchQuery) {
    findDocMatches();
  }
  markSaved();
  updateRecent(currentNote);
  renderHistoryList();
  renderNoteTags();
  setAutoTagStatus("", "");
  setAiAskStatus("", "");
  renderBacklinks(currentNote);
};

const renderBacklinks = async (name) => {
  if (!backlinkList || !backlinksSection) return;
  backlinkList.innerHTML = "";
  if (!name) { backlinksSection.style.display = "none"; return; }
  try {
    const res = await fetch(`/api/backlinks/${encodeURIComponent(name)}`);
    if (!res.ok) return;
    const { backlinks } = await res.json();
    backlinksSection.style.display = "";
    if (backlinks.length === 0) {
      const li = document.createElement("li");
      li.textContent = "참조 없음";
      li.style.color = "#999";
      backlinkList.appendChild(li);
      return;
    }
    backlinks.forEach((noteName) => {
      const li = document.createElement("li");
      li.textContent = noteName;
      li.style.cursor = "pointer";
      li.addEventListener("click", () => loadNote(noteName));
      backlinkList.appendChild(li);
    });
  } catch (error) {
    console.error("[backlinks] 오류:", error);
  }
};

const extractSummary = (content) => {
  const match = content.match(/%%([^%]+)%%/);
  if (match) return match[1].trim();
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~\-#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
};

const openGraphView = async () => {
  if (!graphModal || !graphContainer || !window.d3) {
    showToast("그래프 뷰를 로드할 수 없습니다.", "error");
    return;
  }
  graphModal.classList.remove("hidden");
  graphContainer.innerHTML = '<p style="padding:16px;color:#999">로딩 중...</p>';

  let nodes, edges;
  try {
    const res = await fetch("/api/graph");
    if (!res.ok) throw new Error();
    ({ nodes, edges } = await res.json());
  } catch (error) {
    graphContainer.innerHTML = "";
    showToast("그래프 로드 실패", "error");
    return;
  }

  // 모든 노트 요약 병렬 로드
  const summaryResults = await Promise.allSettled(
    nodes.map((n) => fetch(`/api/notes/${encodeURIComponent(n.id)}`).then((r) => r.json()))
  );
  const summaryMap = new Map();
  nodes.forEach((n, i) => {
    const r = summaryResults[i];
    if (r.status === "fulfilled") summaryMap.set(n.id, extractSummary(r.value.content ?? ""));
  });

  // 태그 필터 드롭다운 구성
  const allTags = new Set();
  Object.values(tagsByNote).forEach((tags) => tags.forEach((t) => allTags.add(t)));
  if (graphTagFilter) {
    graphTagFilter.innerHTML =
      '<option value="">태그 전체</option>' +
      [...allTags].sort().map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
  }

  graphContainer.innerHTML = "";
  const width = graphContainer.clientWidth || 800;
  const height = graphContainer.clientHeight || 500;

  // 연결 수 계산
  const totalConn = new Map(nodes.map((n) => [n.id, 0]));
  const outCount = new Map(nodes.map((n) => [n.id, 0]));
  const inCount = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => {
    const s = e.source?.id ?? e.source;
    const t = e.target?.id ?? e.target;
    outCount.set(s, (outCount.get(s) ?? 0) + 1);
    inCount.set(t, (inCount.get(t) ?? 0) + 1);
    totalConn.set(s, (totalConn.get(s) ?? 0) + 1);
    totalConn.set(t, (totalConn.get(t) ?? 0) + 1);
  });

  // 호버 툴팁
  const tooltip = document.createElement("div");
  tooltip.className = "graph-tooltip";
  tooltip.style.display = "none";
  graphContainer.appendChild(tooltip);

  // 전체 보기 카드 컨테이너 (그래프 위에 절대 위치)
  const cardsContainer = document.createElement("div");
  cardsContainer.className = "graph-cards-container";
  cardsContainer.style.display = "none";
  graphContainer.appendChild(cardsContainer);
  const cardEls = new Map();
  let showCards = false;
  let currentTransform = d3.zoomIdentity;

  const updateCards = () => {
    const { x: tx, y: ty, k } = currentTransform;
    nodes.forEach((n) => {
      let card = cardEls.get(n.id);
      if (!card) {
        card = document.createElement("div");
        card.className = "graph-node-card";
        const summary = summaryMap.get(n.id) ?? "";
        const conn = totalConn.get(n.id) ?? 0;
        card.innerHTML =
          `<div class="gnc-name">📄 ${escapeHtml(n.id.split("/").pop())}</div>` +
          `<div class="gnc-stats">연결 ${conn}개</div>` +
          (summary ? `<div class="gnc-summary">${escapeHtml(summary)}</div>` : `<div class="gnc-summary gnc-empty">요약 없음</div>`);
        card.addEventListener("click", () => {
          graphModal.classList.add("hidden");
          loadNote(n.id);
        });
        cardsContainer.appendChild(card);
        cardEls.set(n.id, card);
      }
      card.style.left = `${n.x * k + tx + 14}px`;
      card.style.top = `${n.y * k + ty - 10}px`;
    });
  };

  // SVG 설정
  const svg = d3.select(graphContainer)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (event) => {
    g.attr("transform", event.transform);
    currentTransform = event.transform;
    if (showCards) updateCards();
  });
  svg.call(zoom);

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((d) => d.id).distance(70))
    .force("charge", d3.forceManyBody().strength(-120))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(28));

  const link = g.append("g")
    .selectAll("line")
    .data(edges)
    .join("line")
    .attr("stroke", "#ccc")
    .attr("stroke-width", 1.5)
    .attr("marker-end", "url(#arrow)");

  svg.append("defs").append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -4 8 8")
    .attr("refX", 18)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-4L8,0L0,4")
    .attr("fill", "#ccc");

  let hoverTimer = null;

  const node = g.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .style("cursor", "pointer")
    .call(
      d3.drag()
        .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on("mouseover", (event, d) => {
      if (showCards) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        const out = outCount.get(d.id) ?? 0;
        const inc = inCount.get(d.id) ?? 0;
        const summary = summaryMap.get(d.id) ?? "";
        tooltip.innerHTML =
          `<div class="gt-name">📄 ${escapeHtml(d.id)}</div>` +
          `<div class="gt-stats">→ 발신: ${out}&nbsp;&nbsp;← 백링크: ${inc}</div>` +
          (summary ? `<div class="gt-divider"></div><div class="gt-summary">${escapeHtml(summary)}</div>` : "");
        tooltip.style.display = "block";
      }, 200);
    })
    .on("mousemove", (event) => {
      if (showCards) return;
      const rect = graphContainer.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - rect.left + 14}px`;
      tooltip.style.top = `${event.clientY - rect.top + 14}px`;
    })
    .on("mouseout", () => {
      clearTimeout(hoverTimer);
      tooltip.style.display = "none";
    })
    .on("click", (event, d) => {
      clearTimeout(hoverTimer);
      tooltip.style.display = "none";
      graphModal.classList.add("hidden");
      loadNote(d.id);
    });

  node.append("circle")
    .attr("r", 14)
    .attr("fill", (d) => d.id === currentNote ? "#4a6fa5" : "#6c8ebf")
    .attr("stroke", "#fff")
    .attr("stroke-width", 2);

  node.append("text")
    .text((d) => d.id.split("/").pop())
    .attr("x", 18)
    .attr("y", 4)
    .attr("font-size", "12px")
    .attr("fill", "#333");

  // 정렬/필터 적용
  const applyFilter = () => {
    const tagVal = graphTagFilter?.value ?? "";
    const sortVal = graphSort?.value ?? "none";

    const matchSet = new Set(
      tagVal
        ? nodes.filter((n) => getNoteTags(n.id).includes(tagVal)).map((n) => n.id)
        : nodes.map((n) => n.id)
    );

    node.select("circle").attr("opacity", (d) => matchSet.has(d.id) ? 1 : 0.12);
    node.select("text").attr("opacity", (d) => matchSet.has(d.id) ? 1 : 0.12);
    link.attr("opacity", (d) => {
      const s = d.source?.id ?? d.source;
      const t = d.target?.id ?? d.target;
      return matchSet.has(s) && matchSet.has(t) ? 0.8 : 0.05;
    });

    // 기존 radial force 제거
    simulation.force("radial-in", null).force("radial-out", null).force("sort-radial", null);

    // 태그 필터: 매칭 노드 → 중앙, 나머지 → 외곽
    if (tagVal) {
      simulation
        .force("radial-in", d3.forceRadial(80, width / 2, height / 2)
          .strength((d) => matchSet.has(d.id) ? 0.25 : 0))
        .force("radial-out", d3.forceRadial(Math.min(width, height) * 0.42, width / 2, height / 2)
          .strength((d) => matchSet.has(d.id) ? 0 : 0.3));
    }

    // 정렬: 순위에 따라 반경 차등 배치 (1위 = 중앙, 꼴찌 = 외곽)
    if (sortVal === "connections" || sortVal === "mtime") {
      const sorted = [...nodes].sort((a, b) =>
        sortVal === "connections"
          ? (totalConn.get(b.id) ?? 0) - (totalConn.get(a.id) ?? 0)
          : (b.mtime ?? "").localeCompare(a.mtime ?? "")
      );
      const maxRank = Math.max(sorted.length - 1, 1);
      const rankMap = new Map(sorted.map((n, i) => [n.id, i]));
      const maxR = Math.min(width, height) * 0.38;
      simulation.force("sort-radial", d3.forceRadial(
        (d) => (rankMap.get(d.id) / maxRank) * maxR,
        width / 2, height / 2
      ).strength(0.35));
    }

    simulation.alpha(0.5).restart();
  };

  graphSort?.addEventListener("change", applyFilter);
  graphTagFilter?.addEventListener("change", applyFilter);
  if (graphFilterReset) {
    graphFilterReset.onclick = () => {
      if (graphSort) graphSort.value = "none";
      if (graphTagFilter) graphTagFilter.value = "";
      applyFilter();
    };
  }

  // 전체 보기 토글
  if (overviewBtn) {
    overviewBtn.onclick = () => {
      showCards = !showCards;
      overviewBtn.textContent = showCards ? "요약 숨기기" : "전체 보기";
      cardsContainer.style.display = showCards ? "" : "none";
      tooltip.style.display = "none";
      if (showCards) updateCards();
    };
  }

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    if (showCards) updateCards();
  });
};

graphViewBtn?.addEventListener("click", openGraphView);
graphModalClose?.addEventListener("click", () => graphModal?.classList.add("hidden"));
graphModal?.addEventListener("click", (event) => {
  if (event.target === graphModal) graphModal.classList.add("hidden");
});

const renderSearchResults = (results) => {
  searchList.innerHTML = "";
  if (results.length === 0) {
    const li = document.createElement("li");
    li.textContent = "검색 결과가 없습니다.";
    searchList.appendChild(li);
    return;
  }
  results.forEach(({ name }) => {
    const normalizedName = normalizeName(name);
    const li = document.createElement("li");
    li.textContent = normalizedName;
    li.addEventListener("click", () => loadNote(normalizedName));
    searchList.appendChild(li);
  });
};

const applyEditorStyles = () => {
  const size = fontSizeSelect.value;
  editor.style.fontSize = `${size}px`;
  editor.style.color = fontColorInput.value;
};

const applyBoldToSelection = () => {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  const selected = value.slice(start, end);

  if (!selected) {
    const marker = "**";
    editor.value = value.slice(0, start) + marker + marker + value.slice(end);
    const caret = start + marker.length;
    editor.selectionStart = caret;
    editor.selectionEnd = caret;
  } else {
    const before = value.slice(Math.max(0, start - 2), start);
    const after = value.slice(end, end + 2);
    if (before === "**" && after === "**") {
      editor.value =
        value.slice(0, start - 2) + selected + value.slice(end + 2);
      editor.selectionStart = start - 2;
      editor.selectionEnd = end - 2;
    } else if (selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4) {
      const inner = selected.slice(2, -2);
      editor.value = value.slice(0, start) + inner + value.slice(end);
      editor.selectionStart = start;
      editor.selectionEnd = start + inner.length;
    } else {
      const leadMatch = selected.match(/^\s+/);
      const trailMatch = selected.match(/\s+$/);
      const lead = leadMatch ? leadMatch[0] : "";
      const trail = trailMatch ? trailMatch[0] : "";
      const core = selected.slice(lead.length, selected.length - trail.length);
      if (!core) {
        const wrapped = `**${selected}**`;
        editor.value = value.slice(0, start) + wrapped + value.slice(end);
        editor.selectionStart = start + 2;
        editor.selectionEnd = end + 2;
      } else {
        const wrapped = `${lead}**${core}**${trail}`;
        editor.value = value.slice(0, start) + wrapped + value.slice(end);
        editor.selectionStart = start + lead.length + 2;
        editor.selectionEnd = editor.selectionStart + core.length;
      }
    }
  }
  editor.focus();
  renderPreview(editor.value, docSearchQuery);
  if (docSearchQuery) {
    findDocMatches();
  }
  markDirty();
  scheduleAutosave();
};

const applySpellcheck = () => {
  editor.spellcheck = isSpellcheck;
  editor.setAttribute("spellcheck", isSpellcheck ? "true" : "false");
  spellToggle.classList.toggle("active", isSpellcheck);
};

const createNoteByName = async (name, { content = "", focus = true } = {}) => {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  if (!response.ok) {
    showToast("문서를 생성하지 못했습니다.", "error");
    return null;
  }
  const data = await response.json();
  const createdName = data.name ?? name;
  tagsByNote = { ...tagsByNote, [createdName]: [] };
  saveTagsMap(tagsByNote);
  await fetchNotes();
  if (focus) {
    await loadNote(createdName);
  }
  return createdName;
};

const createNote = async () => {
  if (isNameComposing) {
    noteNameInput.focus();
    return;
  }
  const rawName = noteNameInput.value;
  const name = rawName.normalize("NFC").trim();
  if (!name) {
    showToast("문서 이름을 입력하세요.", "warning");
    return;
  }
  const createdName = await createNoteByName(name);
  if (!createdName) return;
  noteNameInput.value = "";
};

const renameNote = async (name, newName) => {
  const response = await fetch(`/api/notes/${encodeURIComponent(name)}/rename`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newName }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "이름 변경 실패", "error");
    return null;
  }
  const data = await response.json();
  return data.name;
};

const copyNote = async (name, targetName) => {
  const response = await fetch(`/api/notes/${encodeURIComponent(name)}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetName }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "복사 실패", "error");
    return null;
  }
  const data = await response.json();
  return data.name;
};

const deleteNote = async (name) => {
  const response = await fetch(`/api/notes/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "삭제 실패", "error");
    return false;
  }
  return true;
};

const createFolder = async (folderPath) => {
  const response = await fetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: folderPath }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "폴더 생성 실패", "error");
    return null;
  }
  const data = await response.json();
  return data.path;
};

const renameFolder = async (from, to) => {
  const response = await fetch("/api/folders/rename", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "폴더 이름 변경 실패", "error");
    return null;
  }
  const data = await response.json();
  return data.path;
};

const deleteFolder = async (folderPath) => {
  const response = await fetch(`/api/folders/${encodeURIComponent(folderPath)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "폴더 삭제 실패", "error");
    return false;
  }
  return true;
};

const promptForName = (message, defaultValue) => {
  const value = window.prompt(message, defaultValue);
  if (!value) return null;
  return value.normalize("NFC").trim();
};

const openColorPicker = (message, defaultValue) =>
  new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "color-picker-overlay";

    const panel = document.createElement("div");
    panel.className = "color-picker-panel";

    const title = document.createElement("p");
    title.className = "color-picker-title";
    title.textContent = message;

    const row = document.createElement("div");
    row.className = "color-picker-row";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "color-picker-input";

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "color-picker-text";
    textInput.placeholder = "#RRGGBB 또는 비우기";

    const isHexColor = (value) => /^#([0-9a-f]{6})$/i.test(value);
    const initialColor =
      defaultValue && isHexColor(defaultValue) ? defaultValue : "";

    colorInput.value = initialColor || "#000000";
    textInput.value = initialColor;

    colorInput.addEventListener("input", () => {
      textInput.value = colorInput.value.toUpperCase();
    });

    textInput.addEventListener("input", () => {
      const value = textInput.value.trim();
      if (isHexColor(value)) {
        colorInput.value = value;
      }
    });

    row.appendChild(colorInput);
    row.appendChild(textInput);

    const actions = document.createElement("div");
    actions.className = "color-picker-actions";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "secondary";
    resetBtn.textContent = "기본색";
    resetBtn.addEventListener("click", () => {
      textInput.value = "";
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "secondary";
    cancelBtn.textContent = "취소";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "적용";

    actions.appendChild(resetBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);

    panel.appendChild(title);
    panel.appendChild(row);
    panel.appendChild(actions);

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });

    cancelBtn.addEventListener("click", () => cleanup(null));
    applyBtn.addEventListener("click", () =>
      cleanup(textInput.value.trim())
    );

    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        cleanup(null);
      }
      if (event.key === "Enter") {
        cleanup(textInput.value.trim());
      }
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    textInput.focus();
  });

const applyRenamedNote = async (oldName, newName) => {
  favorites = replaceNameInList(favorites, oldName, newName);
  recents = replaceNameInList(recents, oldName, newName);
  saveStoredList(FAVORITES_KEY, favorites);
  saveStoredList(RECENTS_KEY, recents);
  renameVersionsKey(oldName, newName);
  if (tagsByNote[oldName]) {
    tagsByNote = { ...tagsByNote, [newName]: tagsByNote[oldName] };
    delete tagsByNote[oldName];
    saveTagsMap(tagsByNote);
  }
  if (colorsByNote[oldName]) {
    colorsByNote = { ...colorsByNote, [newName]: colorsByNote[oldName] };
    delete colorsByNote[oldName];
    saveColorsMap(colorsByNote, colorsByFolder);
  }
  if (currentNote === oldName) {
    currentNote = newName;
    currentNoteLabel.textContent = `편집 중: ${currentNote}`;
  }
  await fetchNotes();
};

const moveNoteToFolder = async (name, folderPath) => {
  const baseName = getBaseName(name);
  const targetName = folderPath ? `${folderPath}/${baseName}` : baseName;
  if (!targetName || targetName === name) return;
  const renamed = await renameNote(name, targetName);
  if (!renamed) return;
  await applyRenamedNote(name, renamed);
};

const handleRename = async (name) => {
  const newName = promptForName("새 이름을 입력하세요 (폴더/이름)", name);
  if (!newName || newName === name) return;
  const renamed = await renameNote(name, newName);
  if (!renamed) return;
  await applyRenamedNote(name, renamed);
};

const handleNoteColor = async (name) => {
  const currentColor = getNoteColor(name);
  const input = await openColorPicker(
    "문서 색상을 선택하세요. 비우면 기본색으로 돌아갑니다.",
    currentColor
  );
  if (input === null) return;
  setNoteColor(name, input || "");
  renderFilteredNoteTree();
  renderFavoriteList();
  renderRecentList();
};

const handleMove = async (name) => {
  const newName = promptForName("이동할 경로를 입력하세요 (폴더/이름)", name);
  if (!newName || newName === name) return;
  const renamed = await renameNote(name, newName);
  if (!renamed) return;
  await applyRenamedNote(name, renamed);
};

const handleCopy = async (name) => {
  const defaultName = `${name}-copy`;
  const targetName = promptForName("복사할 새 이름을 입력하세요", defaultName);
  if (!targetName || targetName === name) return;
  const copied = await copyNote(name, targetName);
  if (!copied) return;
  if (tagsByNote[name]) {
    tagsByNote = { ...tagsByNote, [copied]: [...tagsByNote[name]] };
    saveTagsMap(tagsByNote);
  }
  await fetchNotes();
};

const handleDelete = async (name) => {
  const confirmed = window.confirm(`"${name}" 문서를 삭제할까요?`);
  if (!confirmed) return;
  const ok = await deleteNote(name);
  if (!ok) return;
  favorites = removeNameFromList(favorites, name);
  recents = removeNameFromList(recents, name);
  saveStoredList(FAVORITES_KEY, favorites);
  saveStoredList(RECENTS_KEY, recents);
  removeVersionsKey(name);
  if (tagsByNote[name]) {
    delete tagsByNote[name];
    saveTagsMap(tagsByNote);
  }
  if (colorsByNote[name]) {
    delete colorsByNote[name];
    saveColorsMap(colorsByNote, colorsByFolder);
  }
  if (currentNote === name) {
    currentNote = null;
    currentNoteLabel.textContent = "선택된 문서 없음";
    editor.value = "";
    renderPreview(editor.value, docSearchQuery);
    renderHistoryList();
    setSaveStatus("saved", "저장됨");
    renderNoteTags();
  }
  await fetchNotes();
};

const handleCreateNoteInFolder = async (folderPath = "") => {
  const defaultName = folderPath ? `${folderPath}/새 문서` : "새 문서";
  const notePath = promptForName("새 문서 이름을 입력하세요", defaultName);
  if (!notePath) return;
  const normalized = normalizePath(notePath);
  if (!normalized) {
    showToast("문서 이름이 올바르지 않습니다.", "error");
    return;
  }
  await createNoteByName(normalized);
};

const handleCreateFolder = async (basePath = "") => {
  const defaultName = basePath ? `${basePath}/새 폴더` : "새 폴더";
  const folderPath = promptForName("새 폴더 경로를 입력하세요", defaultName);
  if (!folderPath) return;
  const created = await createFolder(folderPath);
  if (!created) return;
  await fetchNotes();
};

const handleFolderColor = async (folderPath) => {
  const currentColor = getFolderColor(folderPath);
  const input = await openColorPicker(
    "폴더 색상을 선택하세요. 비우면 기본색으로 돌아갑니다.",
    currentColor
  );
  if (input === null) return;
  setFolderColor(folderPath, input || "");
  renderFilteredNoteTree();
};

const handleRenameFolder = async (folderPath) => {
  const newPath = promptForName("새 폴더 이름을 입력하세요", folderPath);
  if (!newPath || newPath === folderPath) return;
  const renamed = await renameFolder(folderPath, newPath);
  if (!renamed) return;
  favorites = replaceFolderPrefixInList(favorites, folderPath, renamed);
  recents = replaceFolderPrefixInList(recents, folderPath, renamed);
  saveStoredList(FAVORITES_KEY, favorites);
  saveStoredList(RECENTS_KEY, recents);
  renameFolderVersions(folderPath, renamed);
  replaceFolderPrefixInTags(folderPath, renamed);
  replaceFolderPrefixInColors(folderPath, renamed);
  if (currentNote?.startsWith(`${folderPath}/`)) {
    currentNote = `${renamed}${currentNote.slice(folderPath.length)}`;
    currentNoteLabel.textContent = `편집 중: ${currentNote}`;
  }
  await fetchNotes();
};

const handleDeleteFolder = async (folderPath) => {
  const confirmed = window.confirm(
    `"${folderPath}" 폴더와 하위 문서를 삭제할까요?`
  );
  if (!confirmed) return;
  const ok = await deleteFolder(folderPath);
  if (!ok) return;
  favorites = removeFolderFromList(favorites, folderPath);
  recents = removeFolderFromList(recents, folderPath);
  saveStoredList(FAVORITES_KEY, favorites);
  saveStoredList(RECENTS_KEY, recents);
  removeFolderVersions(folderPath);
  removeFolderTags(folderPath);
  removeFolderColors(folderPath);
  if (currentNote?.startsWith(`${folderPath}/`)) {
    currentNote = null;
    currentNoteLabel.textContent = "선택된 문서 없음";
    editor.value = "";
    renderPreview(editor.value, docSearchQuery);
    renderHistoryList();
    setSaveStatus("saved", "저장됨");
    renderNoteTags();
  }
  await fetchNotes();
};

createBtn.addEventListener("click", async () => {
  await createNote();
});

createFolderBtn?.addEventListener("click", async () => {
  await handleCreateFolder();
});

noteNameInput.addEventListener("compositionstart", () => {
  isNameComposing = true;
});

noteNameInput.addEventListener("compositionend", () => {
  isNameComposing = false;
});

noteNameInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  event.preventDefault();
  await createNote();
});

tagInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const tags = parseTagsInput(tagInput.value);
  if (tags.length === 0) return;
  addTagsToCurrentNote(tags);
  tagInput.value = "";
});

addTagBtn?.addEventListener("click", () => {
  const tags = parseTagsInput(tagInput.value);
  if (tags.length === 0) return;
  addTagsToCurrentNote(tags);
  tagInput.value = "";
});

autoTagBtn?.addEventListener("click", async () => {
  await requestAutoTags();
});

aiAskBtn?.addEventListener("click", async () => {
  await requestAiAnswer();
});

clearTagFilterBtn?.addEventListener("click", () => {
  if (!activeTagFilter) return;
  activeTagFilter = "";
  renderFilteredNoteTree();
  renderTagSidebar();
});

saveBtn.addEventListener("click", async () => {
  await saveNote();
});

searchBtn.addEventListener("click", async () => {
  const q = searchInput.value.trim();
  if (!q) {
    showToast("검색어를 입력하세요.", "warning");
    return;
  }
  const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await response.json();
  renderSearchResults(data.results || []);
});

docSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const query = docSearchInput.value.trim();
  if (!query) {
    showToast("검색어를 입력하세요.", "warning");
    return;
  }
  docSearchQuery = query;
  findDocMatches();
  if (docSearchMatches.length === 0) {
    showToast("검색 결과가 없습니다.", "info");
  }
});

docSearchPrev.addEventListener("click", () => moveDocMatch(-1));
docSearchNext.addEventListener("click", () => moveDocMatch(1));

viewEditBtn?.addEventListener("click", () => setViewMode("edit"));
viewSplitBtn?.addEventListener("click", () => setViewMode("split"));
viewPreviewBtn?.addEventListener("click", () => setViewMode("preview"));

applyTemplateBtn?.addEventListener("click", () => {
  const selectedId = templateSelect?.value;
  if (!selectedId) {
    showToast("템플릿을 선택하세요.", "warning");
    return;
  }
  if (!currentNote) {
    showToast("먼저 문서를 선택하세요.", "warning");
    return;
  }
  const template = getAllTemplates().find((item) => item.id === selectedId);
  if (!template) return;
  insertTemplateContent(template.content);
});

saveTemplateBtn?.addEventListener("click", () => {
  if (!currentNote) {
    showToast("먼저 문서를 선택하세요.", "warning");
    return;
  }
  const label = window.prompt("템플릿 이름을 입력하세요.", "");
  if (!label) {
    showToast("템플릿 이름이 필요합니다.", "warning");
    return;
  }
  const content = editor.value.trim();
  if (!content) {
    showToast("템플릿으로 저장할 내용이 없습니다.", "warning");
    return;
  }
  const id = addCustomTemplate(label, content);
  if (!id) {
    showToast("템플릿 저장에 실패했습니다.", "error");
    return;
  }
  if (templateSelect) {
    templateSelect.value = id;
  }
  showToast("템플릿을 저장했습니다.", "success");
});

historyToggle?.addEventListener("click", () => {
  historyPanel?.classList.toggle("hidden");
  if (!historyPanel?.classList.contains("hidden")) {
    renderHistoryList();
  }
});

historyClose?.addEventListener("click", () => {
  historyPanel?.classList.add("hidden");
});

fontSizeSelect.addEventListener("change", applyEditorStyles);
fontColorInput.addEventListener("input", applyEditorStyles);
boldToggle.addEventListener("click", () => {
  applyBoldToSelection();
});

spellToggle.addEventListener("click", () => {
  isSpellcheck = !isSpellcheck;
  applySpellcheck();
});

editor.addEventListener("input", () => {
  renderPreview(editor.value, docSearchQuery);
  if (docSearchQuery) {
    findDocMatches();
  }
  markDirty();
  scheduleAutosave();
});

editor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    const tabText = "    ";
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value =
      editor.value.slice(0, start) + tabText + editor.value.slice(end);
    const nextPos = start + tabText.length;
    editor.selectionStart = nextPos;
    editor.selectionEnd = nextPos;
    renderPreview(editor.value, docSearchQuery);
    if (docSearchQuery) {
      findDocMatches();
    }
    markDirty();
    scheduleAutosave();
    return;
  }

  if (event.key !== "Enter") return;
  if (!docSearchQuery) return;
  syncDocSearchIndexWithSelection();
  const handled = moveDocMatchForwardWithAlert();
  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
});

window.addEventListener("keydown", (event) => {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const modifier = isMac ? event.metaKey : event.ctrlKey;
  if (!modifier) return;

  const key = event.key.toLowerCase();
  if (key === "s") {
    event.preventDefault();
    saveNote();
    return;
  }

  if (key === "n") {
    event.preventDefault();
    noteNameInput.focus();
    noteNameInput.select();
    return;
  }

  if (key === "f" && event.shiftKey) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  if (key === "f") {
    event.preventDefault();
    docSearchInput.focus();
    docSearchInput.select();
    return;
  }

  if (key === "b") {
    event.preventDefault();
    applyBoldToSelection();
    return;
  }

  if (key === "1") {
    event.preventDefault();
    setViewMode("edit");
    return;
  }

  if (key === "2") {
    event.preventDefault();
    setViewMode("split");
    return;
  }

  if (key === "3") {
    event.preventDefault();
    setViewMode("preview");
    return;
  }

  if (key === "h" && event.shiftKey) {
    event.preventDefault();
    historyPanel?.classList.toggle("hidden");
    if (!historyPanel?.classList.contains("hidden")) {
      renderHistoryList();
    }
  }
});

function splitMarkdownIntoSlides(md) {
  const text = (md || "").trim();
  if (!text) return [];

  const hasHorizontalRule = /^\s*---\s*$/m.test(text);
  let chunks;
  if (hasHorizontalRule) {
    chunks = text.split(/^\s*---\s*$/m);
  } else if (/^#\s+/m.test(text)) {
    chunks = text.split(/(?=^#\s+)/m);
  } else {
    chunks = [text];
  }

  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk, idx) => {
      const lines = chunk.split(/\r?\n/);
      let title = `슬라이드 ${idx + 1}`;
      let bodyStartIdx = 0;
      const headingMatch = lines[0]?.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        title = headingMatch[1].trim();
        bodyStartIdx = 1;
      }
      const body = lines.slice(bodyStartIdx).join("\n").trim();
      return { title, layout: "raw", body };
    });
}

function renderSlidePreview(slide) {
  if (!pptSlidePreview) return;
  if (!slide) {
    pptSlidePreview.innerHTML = "";
    return;
  }
  const titleHtml = `<h1 class="ppt-preview-title">${escapeHtml(slide.title || "(제목 없음)")}</h1>`;
  let bodyHtml = "";
  const layout = slide.layout || "raw";

  if (layout === "raw") {
    bodyHtml = slide.body
      ? window.marked.parse(slide.body)
      : '<p class="ppt-preview-empty">(내용 없음)</p>';
  } else if (layout === "bullets") {
    const items = slide.visual?.items || [];
    bodyHtml = items.length
      ? `<ul class="ppt-preview-bullets">${items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`
      : '<p class="ppt-preview-empty">(불릿 없음)</p>';
  } else if (layout === "comparison") {
    const v = slide.visual || {};
    const left = (v.leftItems || []).map((it) => `<li>${escapeHtml(it)}</li>`).join("");
    const right = (v.rightItems || []).map((it) => `<li>${escapeHtml(it)}</li>`).join("");
    bodyHtml = `
      <div class="ppt-preview-compare">
        <div class="ppt-compare-col">
          <h3>${escapeHtml(v.leftTitle || "A")}</h3>
          <ul>${left}</ul>
        </div>
        <div class="ppt-compare-divider"></div>
        <div class="ppt-compare-col">
          <h3>${escapeHtml(v.rightTitle || "B")}</h3>
          <ul>${right}</ul>
        </div>
      </div>`;
  } else if (layout === "process") {
    const steps = slide.visual?.steps || [];
    bodyHtml = steps.length
      ? `<div class="ppt-preview-process">${steps
          .map(
            (step, i) =>
              `<div class="ppt-process-step"><div class="ppt-process-num">${i + 1}</div><div class="ppt-process-text">${escapeHtml(step)}</div></div>${i < steps.length - 1 ? '<div class="ppt-process-arrow">→</div>' : ""}`
          )
          .join("")}</div>`
      : '<p class="ppt-preview-empty">(단계 없음)</p>';
  } else if (layout === "stat") {
    const v = slide.visual || {};
    bodyHtml = `
      <div class="ppt-preview-stat">
        <div class="ppt-stat-value">${escapeHtml(v.value || "—")}</div>
        <div class="ppt-stat-label">${escapeHtml(v.label || "")}</div>
        ${v.description ? `<div class="ppt-stat-desc">${escapeHtml(v.description)}</div>` : ""}
      </div>`;
  } else {
    bodyHtml = '<p class="ppt-preview-empty">(알 수 없는 레이아웃)</p>';
  }

  const layoutBadge = layout !== "raw"
    ? `<span class="ppt-layout-badge ppt-layout-${layout}">${layout}</span>`
    : "";

  let scriptHtml = "";
  if (slide.script) {
    const charCount = slide.script.length;
    const estSeconds = Math.round((charCount / 600) * 120); // ~600 chars per 2min
    scriptHtml = `
      <div class="ppt-preview-script">
        <div class="ppt-script-header">
          <span class="ppt-script-icon">🎤</span>
          <span class="ppt-script-title">발표 스크립트</span>
          <span class="ppt-script-meta">${charCount}자 · 약 ${estSeconds}초</span>
        </div>
        <div class="ppt-script-text">${escapeHtml(slide.script).replace(/\n/g, "<br>")}</div>
      </div>`;
  }

  pptSlidePreview.innerHTML = `${layoutBadge}${titleHtml}<div class="ppt-preview-body">${bodyHtml}</div>${scriptHtml}`;
}

function setActivePptSlide(index) {
  if (!currentPptSlides.length) return;
  currentPptIndex = Math.max(0, Math.min(index, currentPptSlides.length - 1));
  Array.from(pptSlideList?.children || []).forEach((li, i) => {
    li.classList.toggle("active", i === currentPptIndex);
  });
  renderSlidePreview(currentPptSlides[currentPptIndex]);
}

function renderPptSlideList() {
  if (!pptSlideList) return;
  pptSlideList.innerHTML = "";
  currentPptSlides.forEach((slide, idx) => {
    const li = document.createElement("li");
    li.className = "ppt-slide-list-item";
    li.textContent = `${idx + 1}. ${slide.title}`;
    li.addEventListener("click", () => setActivePptSlide(idx));
    pptSlideList.appendChild(li);
  });
}

function updatePptSlideCount() {
  if (pptSlideCount) {
    pptSlideCount.textContent = `총 ${currentPptSlides.length}개 슬라이드`;
  }
}

function openPptModal() {
  if (!pptModal) return;
  const md = editor.value.trim();
  if (!md) {
    showToast("문서 내용이 없습니다.", "warning");
    return;
  }
  originalPptSlides = splitMarkdownIntoSlides(md);
  if (!originalPptSlides.length) {
    showToast("슬라이드를 만들 수 없습니다.", "warning");
    return;
  }
  currentPptSlides = originalPptSlides.map((s) => ({ ...s }));
  updatePptSlideCount();
  if (pptAiStatus) pptAiStatus.textContent = "";
  renderPptSlideList();
  setActivePptSlide(0);
  pptModal.classList.remove("hidden");
}

async function aiSummarizeSlides() {
  if (pptAiInFlight) return;
  const md = editor.value.trim();
  if (!md) {
    showToast("문서 내용이 없습니다.", "warning");
    return;
  }
  pptAiInFlight = true;
  if (pptAiSummarizeBtn) pptAiSummarizeBtn.disabled = true;
  if (pptAiStatus) pptAiStatus.textContent = "AI 분석 중...";
  try {
    const response = await fetch("/api/ai/pptify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: md }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "AI 요약 실패");
    }
    const slides = Array.isArray(data.slides) ? data.slides : [];
    if (!slides.length) {
      throw new Error("AI가 슬라이드를 생성하지 못했습니다.");
    }
    currentPptSlides = slides.map((s) => ({
      title: s.title || "",
      layout: s.layout || "bullets",
      visual: s.visual || {},
      script: s.script || "",
    }));
    updatePptSlideCount();
    renderPptSlideList();
    setActivePptSlide(0);
    if (pptAiStatus) pptAiStatus.textContent = "✓ AI 요약 완료";
    showToast("AI 요약 완료", "success");
  } catch (err) {
    console.error("AI pptify failed:", err);
    if (pptAiStatus) pptAiStatus.textContent = "✕ 실패";
    showToast("AI 요약 실패: " + (err?.message || "알 수 없는 오류"), "error");
  } finally {
    pptAiInFlight = false;
    if (pptAiSummarizeBtn) pptAiSummarizeBtn.disabled = false;
  }
}

function resetPptSlides() {
  if (!originalPptSlides.length) return;
  currentPptSlides = originalPptSlides.map((s) => ({ ...s }));
  updatePptSlideCount();
  renderPptSlideList();
  setActivePptSlide(0);
  if (pptAiStatus) pptAiStatus.textContent = "";
}

function closePptModal() {
  pptModal?.classList.add("hidden");
}

function markdownBodyToBulletItems(body) {
  const lines = (body || "").split(/\r?\n/);
  const items = [];
  let currentParagraph = [];
  const flushParagraph = () => {
    if (currentParagraph.length) {
      items.push({ text: currentParagraph.join(" "), options: { bullet: false } });
      currentParagraph = [];
    }
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      items.push({ text: bulletMatch[1], options: { bullet: true } });
    } else if (numberedMatch) {
      flushParagraph();
      items.push({ text: numberedMatch[1], options: { bullet: { type: "number" } } });
    } else if (/^#{1,6}\s+/.test(line)) {
      flushParagraph();
      items.push({
        text: line.replace(/^#{1,6}\s+/, ""),
        options: { bullet: false, bold: true },
      });
    } else {
      currentParagraph.push(line);
    }
  }
  flushParagraph();
  return items.length ? items : [{ text: "", options: { bullet: false } }];
}

function renderSlideToPptx(pptx, slide) {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  if (slide.script) {
    s.addNotes(slide.script);
  }
  s.addText(slide.title || "", {
    x: 0.5,
    y: 0.35,
    w: 12.3,
    h: 0.9,
    fontSize: 32,
    bold: true,
    color: "1F1F2A",
  });
  // colored accent bar under title
  s.addShape("rect", {
    x: 0.5,
    y: 1.25,
    w: 1.2,
    h: 0.08,
    fill: { color: "2563EB" },
    line: { color: "2563EB" },
  });

  const layout = slide.layout || "raw";

  if (layout === "raw") {
    const bodyItems = markdownBodyToBulletItems(slide.body || "");
    s.addText(bodyItems, {
      x: 0.6,
      y: 1.6,
      w: 12.1,
      h: 5.5,
      fontSize: 18,
      color: "374151",
      valign: "top",
    });
  } else if (layout === "bullets") {
    const items = (slide.visual?.items || []).map((it) => ({
      text: String(it),
      options: { bullet: { code: "25CF" } },
    }));
    s.addText(items.length ? items : [{ text: "(내용 없음)", options: {} }], {
      x: 0.7,
      y: 1.6,
      w: 12.0,
      h: 5.5,
      fontSize: 22,
      color: "1F1F2A",
      paraSpaceAfter: 12,
      valign: "top",
    });
  } else if (layout === "comparison") {
    const v = slide.visual || {};
    const colW = 5.7;
    const startY = 1.6;
    // left card
    s.addShape("rect", {
      x: 0.5,
      y: startY,
      w: colW,
      h: 5.4,
      fill: { color: "F0F9FF" },
      line: { color: "BAE6FD" },
    });
    s.addText(v.leftTitle || "A", {
      x: 0.7,
      y: startY + 0.15,
      w: colW - 0.4,
      h: 0.5,
      fontSize: 22,
      bold: true,
      color: "0369A1",
    });
    s.addText(
      (v.leftItems || []).map((it) => ({ text: String(it), options: { bullet: true } })),
      {
        x: 0.8,
        y: startY + 0.85,
        w: colW - 0.5,
        h: 4.4,
        fontSize: 16,
        color: "0F172A",
        paraSpaceAfter: 8,
        valign: "top",
      }
    );
    // right card
    s.addShape("rect", {
      x: 0.5 + colW + 0.4,
      y: startY,
      w: colW,
      h: 5.4,
      fill: { color: "FEF3F2" },
      line: { color: "FECDD3" },
    });
    s.addText(v.rightTitle || "B", {
      x: 0.7 + colW + 0.4,
      y: startY + 0.15,
      w: colW - 0.4,
      h: 0.5,
      fontSize: 22,
      bold: true,
      color: "B91C1C",
    });
    s.addText(
      (v.rightItems || []).map((it) => ({ text: String(it), options: { bullet: true } })),
      {
        x: 0.8 + colW + 0.4,
        y: startY + 0.85,
        w: colW - 0.5,
        h: 4.4,
        fontSize: 16,
        color: "0F172A",
        paraSpaceAfter: 8,
        valign: "top",
      }
    );
  } else if (layout === "process") {
    const steps = (slide.visual?.steps || []).slice(0, 6);
    if (steps.length) {
      const totalW = 12.0;
      const gap = 0.3;
      const stepW = (totalW - gap * (steps.length - 1)) / steps.length;
      const startX = 0.7;
      const y = 3.0;
      const h = 1.6;
      steps.forEach((step, i) => {
        const x = startX + i * (stepW + gap);
        s.addShape("roundRect", {
          x,
          y,
          w: stepW,
          h,
          fill: { color: "EFF6FF" },
          line: { color: "2563EB", width: 2 },
          rectRadius: 0.12,
        });
        s.addText(`${i + 1}`, {
          x,
          y: y - 0.55,
          w: stepW,
          h: 0.5,
          fontSize: 18,
          bold: true,
          color: "2563EB",
          align: "center",
        });
        s.addText(String(step), {
          x: x + 0.1,
          y,
          w: stepW - 0.2,
          h,
          fontSize: 14,
          color: "1F1F2A",
          align: "center",
          valign: "middle",
        });
        if (i < steps.length - 1) {
          s.addText("→", {
            x: x + stepW,
            y,
            w: gap,
            h,
            fontSize: 22,
            color: "2563EB",
            align: "center",
            valign: "middle",
          });
        }
      });
    }
  } else if (layout === "stat") {
    const v = slide.visual || {};
    s.addText(String(v.value || "—"), {
      x: 0.5,
      y: 2.2,
      w: 12.3,
      h: 2.0,
      fontSize: 96,
      bold: true,
      color: "2563EB",
      align: "center",
      valign: "middle",
    });
    s.addText(String(v.label || ""), {
      x: 0.5,
      y: 4.4,
      w: 12.3,
      h: 0.7,
      fontSize: 28,
      color: "1F1F2A",
      align: "center",
    });
    if (v.description) {
      s.addText(String(v.description), {
        x: 1.5,
        y: 5.3,
        w: 10.3,
        h: 1.0,
        fontSize: 16,
        color: "64748B",
        align: "center",
        italic: true,
      });
    }
  }
}

async function generatePptxFile() {
  if (!currentPptSlides.length) {
    showToast("내보낼 슬라이드가 없습니다.", "warning");
    return;
  }
  if (typeof PptxGenJS === "undefined") {
    showToast("PPT 라이브러리 로딩 실패", "error");
    console.error("PptxGenJS not loaded");
    return;
  }
  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    currentPptSlides.forEach((slide) => renderSlideToPptx(pptx, slide));

    const baseName = currentNote ? currentNote.replace(/\.[^.]+$/, "") : "presentation";
    const fileName = `${baseName}.pptx`;
    await pptx.writeFile({ fileName });
    showToast("PPT 다운로드 완료", "success");
  } catch (err) {
    console.error("PPT generation failed:", err);
    showToast("PPT 생성 실패: " + (err?.message || "알 수 없는 오류"), "error");
  }
}

exportPptBtn?.addEventListener("click", openPptModal);
pptModalClose?.addEventListener("click", closePptModal);
pptDownloadBtn?.addEventListener("click", generatePptxFile);
pptAiSummarizeBtn?.addEventListener("click", aiSummarizeSlides);
pptResetBtn?.addEventListener("click", resetPptSlides);
pptModal?.addEventListener("click", (event) => {
  if (event.target === pptModal) closePptModal();
});

// ===== Authentication & Drive integration =====

function updateNoteSourceIndicator() {
  if (!noteSourceIndicator) return;
  if (!currentNote) {
    noteSourceIndicator.textContent = "";
    noteSourceIndicator.className = "note-source-indicator";
    return;
  }
  if (currentNoteSource === "drive") {
    noteSourceIndicator.textContent = "☁ Drive";
    noteSourceIndicator.className = "note-source-indicator source-drive";
  } else {
    noteSourceIndicator.textContent = "💾 로컬";
    noteSourceIndicator.className = "note-source-indicator source-local";
  }
}

function renderUserWidget(user) {
  if (!userWidget) return;
  if (!user) {
    userWidget.classList.add("hidden");
    return;
  }
  userWidget.classList.remove("hidden");
  if (userAvatar) {
    userAvatar.src = user.picture || "";
    userAvatar.alt = user.name || user.email || "";
    userAvatar.style.display = user.picture ? "" : "none";
  }
  if (userNameEl) {
    userNameEl.textContent = user.name || user.email || "사용자";
  }
}

function showLoginScreen() {
  loginOverlay?.classList.remove("hidden");
}

function hideLoginScreen() {
  loginOverlay?.classList.add("hidden");
}

async function fetchCurrentUser() {
  try {
    const res = await fetch("/api/me");
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("[auth] /api/me 실패:", err);
    return null;
  }
}

async function logout() {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } catch (err) {
    console.warn("logout 호출 실패:", err);
  }
  location.reload();
}

async function fetchDriveNotes({ reconcile = false } = {}) {
  if (!driveNoteList) return;
  try {
    if (reconcile) {
      try {
        const r = await fetch("/api/drive/reconcile", { method: "POST" });
        if (r.ok) {
          const stats = await r.json();
          const total =
            (stats.renamedFolders || 0) +
            (stats.renamedFiles || 0) +
            (stats.deletedFolders || 0) +
            (stats.deletedFiles || 0);
          if (total > 0) {
            const parts = [];
            if (stats.renamedFolders) parts.push(`폴더 이름 ${stats.renamedFolders}`);
            if (stats.renamedFiles) parts.push(`파일 이름 ${stats.renamedFiles}`);
            if (stats.deletedFolders) parts.push(`폴더 삭제 ${stats.deletedFolders}`);
            if (stats.deletedFiles) parts.push(`파일 삭제 ${stats.deletedFiles}`);
            showToast(`Drive→로컬 반영: ${parts.join(", ")}`, "info");
            await fetchNotes();
          }
        }
      } catch (err) {
        console.warn("[drive] reconcile 실패:", err);
      }
    }
    const res = await fetch("/api/drive/notes");
    if (res.status === 401) {
      showToast("Drive 인증 만료, 다시 로그인하세요.", "error");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Drive 노트 목록 실패", "error");
      return;
    }
    const data = await res.json();
    driveNotes = data.notes || [];
    renderDriveNoteList();
  } catch (err) {
    console.error("[drive] 목록 조회 실패:", err);
    showToast("Drive 연결 실패", "error");
  }
}

function renderDriveNoteList() {
  if (!driveNoteList) return;
  driveNoteList.innerHTML = "";
  if (!driveNotes.length) {
    const li = document.createElement("li");
    li.className = "drive-note-empty";
    li.textContent = "Drive 노트 없음";
    driveNoteList.appendChild(li);
    return;
  }
  const sortedDriveNotes = driveNotes
    .slice()
    .sort((a, b) => naturalCompare(a.name, b.name));
  sortedDriveNotes.forEach((note) => {
    const li = document.createElement("li");
    li.className = "drive-note-item";
    if (currentNoteSource === "drive" && currentDriveFileId === note.id) {
      li.classList.add("active");
    }
    const isGoogleDoc = note.mimeType === "application/vnd.google-apps.document";
    const icon = isGoogleDoc ? "📄" : "☁";
    if (isGoogleDoc) li.classList.add("drive-note-gdoc");
    li.innerHTML = `<span class="drive-note-icon"></span><span class="drive-note-name"></span>${isGoogleDoc ? '<span class="drive-note-badge">Doc</span>' : ""}`;
    li.querySelector(".drive-note-icon").textContent = icon;
    li.querySelector(".drive-note-name").textContent = note.name;
    const dateStr = note.modifiedTime ? new Date(note.modifiedTime).toLocaleString() : "";
    li.title = isGoogleDoc
      ? `Google Docs (읽기 전용) · 수정: ${dateStr}`
      : `수정: ${dateStr}`;
    li.addEventListener("click", () => loadDriveNote(note.id));
    driveNoteList.appendChild(li);
  });
}

async function loadDriveNote(fileId) {
  try {
    const res = await fetch(`/api/drive/notes/${encodeURIComponent(fileId)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Drive 노트 로딩 실패", "error");
      return;
    }
    const data = await res.json();
    currentNoteSource = "drive";
    currentDriveFileId = data.id;
    currentDriveMimeType = data.mimeType || null;
    currentNote = data.name;
    const isGoogleDoc = data.mimeType === "application/vnd.google-apps.document";
    if (currentNoteLabel) {
      currentNoteLabel.textContent = isGoogleDoc
        ? `편집 중: ${data.name} (Drive · Google Docs · 읽기 전용)`
        : `편집 중: ${data.name} (Drive)`;
    }
    editor.value = data.content || "";
    renderPreview(editor.value, docSearchQuery);
    markSaved();
    updateNoteSourceIndicator();
    renderDriveNoteList();
    if (isGoogleDoc) {
      showToast(
        "Google Docs 파일은 읽기 전용입니다. 수정하려면 로컬에 복사 후 사용하세요.",
        "info",
        5000
      );
    }
    if (data.mirroredLocal) {
      await fetchNotes();
    }
  } catch (err) {
    console.error("[drive] load 실패:", err);
    showToast("Drive 노트 로딩 실패", "error");
  }
}

async function uploadCurrentNoteToDrive() {
  if (!currentNote) {
    showToast("먼저 노트를 선택하세요.", "warning");
    return;
  }
  if (currentNoteSource === "drive") {
    showToast("이미 Drive 노트입니다.", "info");
    return;
  }
  try {
    const res = await fetch("/api/drive/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: currentNote, content: editor.value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Drive 업로드 실패", "error");
      return;
    }
    const data = await res.json();
    const verb = data._updated ? "업데이트" : "업로드";
    showToast(`Drive로 ${verb}: ${data.name}`, "success");
    await fetchDriveNotes();
    if (data.mirroredLocal) {
      await fetchNotes();
    }
    currentNoteSource = "drive";
    currentDriveFileId = data.id;
    updateNoteSourceIndicator();
    renderDriveNoteList();
  } catch (err) {
    console.error("[drive] 업로드 실패:", err);
    showToast("Drive 업로드 실패", "error");
  }
}

const syncModal = document.getElementById("sync-progress-modal");
const syncIcon = document.getElementById("sync-progress-icon");
const syncTitleText = document.getElementById("sync-progress-title-text");
const syncStage = document.getElementById("sync-progress-stage");
const syncBar = document.getElementById("sync-progress-bar");
const syncCountsText = document.getElementById("sync-progress-counts-text");
const syncPercent = document.getElementById("sync-progress-percent");
const syncCurrentEl = document.getElementById("sync-progress-current");
const syncSummary = document.getElementById("sync-progress-summary");
const syncCloseBtn = document.getElementById("sync-progress-close");

function openSyncModal() {
  if (!syncModal) return;
  syncModal.classList.remove("hidden");
  if (syncIcon) {
    syncIcon.textContent = "⏳";
    syncIcon.classList.add("spinning");
  }
  if (syncTitleText) syncTitleText.textContent = "Drive 동기화 중...";
  if (syncStage) syncStage.textContent = "시작 준비 중...";
  if (syncBar) syncBar.style.width = "0%";
  if (syncCountsText) syncCountsText.textContent = "0 / 0";
  if (syncPercent) syncPercent.textContent = "0%";
  if (syncCurrentEl) syncCurrentEl.textContent = "";
  if (syncSummary) {
    syncSummary.textContent = "";
    syncSummary.classList.add("hidden");
  }
  if (syncCloseBtn) syncCloseBtn.classList.add("hidden");
}

function updateSyncBar(current, total) {
  const pct = total > 0 ? Math.floor((current / total) * 100) : 0;
  if (syncBar) syncBar.style.width = `${pct}%`;
  if (syncCountsText) syncCountsText.textContent = `${current} / ${total}`;
  if (syncPercent) syncPercent.textContent = `${pct}%`;
}

function finishSyncModal({ ok, summary }) {
  if (syncIcon) {
    syncIcon.textContent = ok ? "✅" : "⚠️";
    syncIcon.classList.remove("spinning");
  }
  if (syncTitleText) syncTitleText.textContent = ok ? "동기화 완료" : "동기화 종료 (오류 포함)";
  if (syncCurrentEl) syncCurrentEl.textContent = "";
  if (syncSummary) {
    syncSummary.textContent = summary;
    syncSummary.classList.remove("hidden");
  }
  if (syncCloseBtn) syncCloseBtn.classList.remove("hidden");
}

syncCloseBtn?.addEventListener("click", () => syncModal?.classList.add("hidden"));

async function syncAllDriveNotes() {
  if (!driveSyncAllBtn) return;
  driveSyncAllBtn.disabled = true;
  const originalText = driveSyncAllBtn.textContent;
  driveSyncAllBtn.textContent = "⏳";
  openSyncModal();
  try {
    const res = await fetch("/api/drive/sync-all-stream", { method: "POST" });
    if (!res.ok || !res.body) {
      throw new Error(`서버 응답 오류 (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastSummary = null;
    let total = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.event === "stage") {
          if (syncStage) syncStage.textContent = evt.message || evt.stage;
          if (evt.total != null) {
            total = evt.total;
            updateSyncBar(0, total);
          }
        } else if (evt.event === "reconciled") {
          const parts = [];
          if (evt.renamedFolders) parts.push(`폴더 이름 ${evt.renamedFolders}`);
          if (evt.renamedFiles) parts.push(`파일 이름 ${evt.renamedFiles}`);
          if (evt.deletedFolders) parts.push(`폴더 삭제 ${evt.deletedFolders}`);
          if (evt.deletedFiles) parts.push(`파일 삭제 ${evt.deletedFiles}`);
          if (parts.length && syncStage) {
            syncStage.textContent = `구조 동기화: ${parts.join(", ")}`;
          }
        } else if (evt.event === "progress") {
          updateSyncBar(evt.current, evt.total);
          if (syncCurrentEl) {
            syncCurrentEl.textContent = evt.error
              ? `⚠ ${evt.name}: ${evt.error}`
              : `📄 ${evt.name}`;
          }
          if (syncStage && evt.failed > 0) {
            syncStage.textContent = `다운로드 중 (성공 ${evt.mirrored} · 실패 ${evt.failed})`;
          } else if (syncStage) {
            syncStage.textContent = `다운로드 중 (성공 ${evt.mirrored})`;
          }
        } else if (evt.event === "done") {
          lastSummary = evt;
        } else if (evt.event === "error") {
          throw new Error(evt.message || "스트림 오류");
        }
      }
    }

    if (lastSummary) {
      const okFlag = (lastSummary.failed || 0) === 0;
      const summaryText = `총 ${lastSummary.total}개 중 ${lastSummary.mirrored}개 미러링 완료${lastSummary.failed ? ` · ${lastSummary.failed}개 실패` : ""}`;
      finishSyncModal({ ok: okFlag, summary: summaryText });
      showToast(
        `Drive → 로컬 동기화: ${lastSummary.mirrored}/${lastSummary.total}${lastSummary.failed ? ` (${lastSummary.failed} 실패)` : ""}`,
        lastSummary.failed ? "warning" : "success"
      );
      await fetchNotes();
    } else {
      finishSyncModal({ ok: false, summary: "응답이 비정상 종료되었습니다." });
    }
  } catch (err) {
    console.error("[sync-all] 실패:", err);
    finishSyncModal({ ok: false, summary: err?.message || "알 수 없는 오류" });
    showToast("전체 동기화 실패: " + (err?.message || "알 수 없는 오류"), "error");
  } finally {
    driveSyncAllBtn.disabled = false;
    driveSyncAllBtn.textContent = originalText;
  }
}

logoutBtn?.addEventListener("click", logout);
driveRefreshBtn?.addEventListener("click", () => fetchDriveNotes({ reconcile: true }));
driveSyncAllBtn?.addEventListener("click", syncAllDriveNotes);
uploadDriveBtn?.addEventListener("click", uploadCurrentNoteToDrive);

async function bootApp() {
  const user = await fetchCurrentUser();
  if (!user) {
    showLoginScreen();
    return;
  }
  currentUser = user;
  renderUserWidget(user);
  hideLoginScreen();

  favorites = loadStoredList(FAVORITES_KEY);
  recents = loadStoredList(RECENTS_KEY);
  tagsByNote = loadTagsMap();
  const storedColors = loadColorsMap();
  colorsByNote = storedColors.notes;
  colorsByFolder = storedColors.folders;

  populateTemplates();
  applyEditorStyles();
  applySpellcheck();
  setSaveStatus("saved", "저장됨");
  renderPreview(editor.value, docSearchQuery);
  setViewMode(viewMode);
  updateNoteSourceIndicator();
  await fetchNotes();
  await fetchDriveNotes();
}

if (window.marked) {
  window.marked.use({ breaks: true, gfm: true });
}

bootApp();

// ===== 모바일 반응형 =====
const sidebarToggleBtn = document.getElementById("sidebar-toggle");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const toolbarMoreBtn = document.getElementById("toolbar-more");
const mobileSidebar = document.querySelector(".sidebar");

function openMobileSidebar() {
  mobileSidebar?.classList.add("mobile-open");
  sidebarOverlay?.classList.add("visible");
  document.body.style.overflow = "hidden";
}

function closeMobileSidebar() {
  mobileSidebar?.classList.remove("mobile-open");
  sidebarOverlay?.classList.remove("visible");
  document.body.style.overflow = "";
}

sidebarToggleBtn?.addEventListener("click", () => {
  mobileSidebar?.classList.contains("mobile-open")
    ? closeMobileSidebar()
    : openMobileSidebar();
});

sidebarOverlay?.addEventListener("click", closeMobileSidebar);

// 노트 클릭 시 사이드바 자동 닫기
mobileSidebar?.addEventListener("click", (e) => {
  if (window.innerWidth >= 768) return;
  if (e.target.closest("[data-note]") || e.target.closest(".note-item")) {
    closeMobileSidebar();
  }
});

// 툴바 더보기 토글
let toolbarMoreOpen = false;
toolbarMoreBtn?.addEventListener("click", () => {
  toolbarMoreOpen = !toolbarMoreOpen;
  document.querySelectorAll(".toolbar-extra").forEach((el) => {
    el.classList.toggle("visible", toolbarMoreOpen);
  });
  toolbarMoreBtn.textContent = toolbarMoreOpen ? "✕" : "···";
});

// ===== 행 액션 메뉴 팝오버 =====
let activeRowMenu = null;
function closeRowMenu() {
  activeRowMenu?.remove();
  activeRowMenu = null;
  document.removeEventListener("click", closeRowMenu, true);
  window.removeEventListener("resize", closeRowMenu);
  window.removeEventListener("scroll", closeRowMenu, true);
}
function openRowMenu(triggerEl, items) {
  closeRowMenu();
  const menu = document.createElement("div");
  menu.className = "row-menu-popover";
  items.forEach((it) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-menu-item" + (it.danger ? " danger" : "");
    btn.textContent = it.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeRowMenu();
      it.onClick();
    });
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const rect = triggerEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const top = rect.bottom + menuRect.height + 4 > window.innerHeight
    ? Math.max(8, rect.top - menuRect.height - 4)
    : rect.bottom + 4;
  const left = Math.max(
    8,
    Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 8)
  );
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  activeRowMenu = menu;
  setTimeout(() => {
    document.addEventListener("click", closeRowMenu, true);
    window.addEventListener("resize", closeRowMenu);
    window.addEventListener("scroll", closeRowMenu, true);
  }, 0);
}
