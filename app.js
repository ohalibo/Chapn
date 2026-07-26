import { getStore } from "./store.js";
import {
  MAX_PHOTOS,
  MAX_PHOTO_BASE64_TOTAL,
  PHOTO_MAX_WIDTH,
  PHOTO_JPEG_QUALITY,
  formatRange,
  hslToHex,
  DEFAULT_MEMBER_COLOR,
} from "./config.js";

const root = document.getElementById("app");
const SESSION_KEY = "chapn_session";

let store = null;
let members = [];
let allEntries = new Map();
let WEEKS = [];
let announcements = [];
let session = loadSession();
let entryUnsub = null;
let commentsUnsub = null;
let draft = null;
let dirty = false;
let comments = [];
let editingCommentId = null;

init();

async function init() {
  store = await getStore();
  store.subscribeMembers((list) => {
    members = list;
    if (session && !members.some((m) => m.name === session.name && m.pin === session.pin)) {
      session = null;
      clearSession();
    }
    render();
  });
  store.subscribeAllEntries((map) => {
    allEntries = map;
    render();
  });
  store.subscribeWeeks((list) => {
    WEEKS = list;
    render();
  });
  store.subscribeAnnouncements((list) => {
    announcements = list;
    render();
  });
  window.addEventListener("hashchange", () => {
    dirty = false;
    render();
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}
function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "week" && parts[1]) {
    const week = Number(parts[1]);
    if (parts[2] === "person" && parts[3]) {
      return { view: "entry", week, person: decodeURIComponent(parts[3]) };
    }
    return { view: "people", week };
  }
  if (parts[0] === "notice" && parts[1]) {
    return { view: "notice", noticeId: decodeURIComponent(parts[1]) };
  }
  return { view: "weeks" };
}

function go(hash) {
  location.hash = hash;
}

function entryId(week, person) {
  return `w${week}_${person}`;
}

function isEntryFilled(e) {
  return !!(e && ((e.keep && e.keep.trim()) || (e.problem && e.problem.trim()) || (e.try && e.try.trim())));
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
function sidebarIcon() {
  return `<svg class="sb-icon" width="14" height="12" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 3a1 1 0 0 1 1-1h3.3l1.2 1.4H14a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3Z" stroke="currentColor" stroke-width="1.1"/>
  </svg>`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

let iconUidCounter = 0;

function folderIcon(color) {
  const { h, s, l } = color || DEFAULT_MEMBER_COLOR;
  const uid = `fg${iconUidCounter++}`;
  const tabLight = hslToHex(h, s, clamp(l + 22, 0, 92));
  const tabDark = hslToHex(h, s, clamp(l + 6, 0, 88));
  const bodyLight = hslToHex(h, s, clamp(l + 12, 0, 90));
  const bodyDark = hslToHex(h, s, clamp(l - 12, 8, 100));
  const glyph = hslToHex(h, s, clamp(l - 22, 5, 100));
  return `<svg viewBox="0 0 68 54" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${uid}Tab" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${tabLight}"/><stop offset="1" stop-color="${tabDark}"/>
      </linearGradient>
      <linearGradient id="${uid}Body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${bodyLight}"/><stop offset="1" stop-color="${bodyDark}"/>
      </linearGradient>
    </defs>
    <path d="M2 8a3 3 0 0 1 3-3h15l4 4h39a3 3 0 0 1 3 3v3H2V8Z" fill="url(#${uid}Tab)"/>
    <path d="M2 11h64v32a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V11Z" fill="url(#${uid}Body)"/>
    <rect x="21" y="19" width="26" height="18" rx="1.5" fill="#ffffff" opacity="0.5"/>
    <circle cx="27" cy="25" r="2.1" fill="${glyph}"/>
    <path d="M23 34l6-7 5 5.5 4-4.5 6 6H23Z" fill="${glyph}"/>
  </svg>`;
}

function documentIcon() {
  return `<svg viewBox="0 0 54 54" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 3h22l10 10v34a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" fill="#fbfbf9" stroke="#d8d6cd" stroke-width="1"/>
    <path d="M32 3v8a2 2 0 0 0 2 2h8L32 3Z" fill="#e7e5de"/>
    <rect x="14" y="24" width="18" height="3" rx="1.5" fill="#c1402a"/>
    <rect x="14" y="31" width="24" height="2.4" rx="1.2" fill="#d8d6cd"/>
    <rect x="14" y="37" width="24" height="2.4" rx="1.2" fill="#d8d6cd"/>
    <rect x="14" y="43" width="16" height="2.4" rx="1.2" fill="#d8d6cd"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Shell (macOS-style window: titlebar + sidebar + main)
// ---------------------------------------------------------------------------
function render() {
  if (!session) return renderGate();
  const route = parseHash();
  if (route.view !== "entry" && entryUnsub) {
    entryUnsub();
    entryUnsub = null;
    draft = null;
  }
  if (route.view !== "entry" && commentsUnsub) {
    commentsUnsub();
    commentsUnsub = null;
    comments = [];
    editingCommentId = null;
  }

  root.innerHTML = `
    <div class="cargo-window">
      <div class="cargo-titlebar">
        <span class="tl-dot red"></span><span class="tl-dot yellow"></span><span class="tl-dot green"></span>
        <span class="cargo-title">챕터엔 회고록</span>
      </div>
      <div class="cargo-body">
        <aside class="cargo-sidebar">
          <div class="sb-session">
            <span class="sb-session-name">${esc(session.name)}님</span>
            <button class="sb-session-logout" id="logout-btn">나가기</button>
          </div>
          <button class="sb-item ${route.view === "weeks" ? "active" : ""}" data-hash="#/">
            ${sidebarIcon()}<span class="sb-label">전체보기</span>
          </button>
          <div class="sb-section-title">주차</div>
          ${WEEKS.map(
            (w) => `
            <button class="sb-item ${route.week === w.n ? "active" : ""}" data-hash="#/week/${w.n}">
              ${sidebarIcon()}<span class="sb-label">${esc(w.label)}</span>
            </button>`
          ).join("")}
        </aside>
        <main class="cargo-main" id="view"></main>
      </div>
    </div>
  `;

  root.querySelectorAll(".sb-item[data-hash]").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.hash));
  });
  document.getElementById("logout-btn").addEventListener("click", () => {
    session = null;
    clearSession();
    render();
  });

  if (route.view === "weeks") renderWeeks();
  else if (route.view === "people") renderPeople(route.week);
  else if (route.view === "notice") renderNotice(route.noticeId);
  else renderEntry(route.week, route.person);
}

// ---------------------------------------------------------------------------
// View: weeks grid
// ---------------------------------------------------------------------------
function renderWeeks() {
  const view = document.getElementById("view");
  if (WEEKS.length === 0) {
    view.innerHTML = `<div class="empty-state">아직 등록된 주차가 없어요. 운영진에게 문의해주세요.</div>`;
    return;
  }

  const noticeTiles = announcements.map((a) => `
    <button class="file-tile" data-hash="#/notice/${encodeURIComponent(a.id)}">
      ${documentIcon()}
      <span class="ft-label">${esc(a.title || "제목 없음")}</span>
    </button>
  `).join("");

  const tiles = WEEKS.map((w) => {
    const total = members.length;
    const filled = members.filter((m) => isEntryFilled(allEntries.get(entryId(w.n, m.name)))).length;
    return `
      <button class="folder-tile" data-hash="#/week/${w.n}">
        ${folderIcon()}
        <span class="ft-label">${filled > 0 ? '<span class="status-dot"></span>' : ""}${esc(w.label)}</span>
        <span class="ft-meta">${formatRange(w.start, w.end)} · ${filled}/${total || 0}</span>
      </button>
    `;
  }).join("");

  view.innerHTML = `
    ${announcements.length > 0 ? `<div class="file-grid">${noticeTiles}</div><hr class="section-divider" />` : ""}
    <div class="folder-grid">${tiles}</div>
  `;
  view.querySelectorAll(".folder-tile, .file-tile").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.hash));
  });
}

// ---------------------------------------------------------------------------
// View: people grid (for a given week)
// ---------------------------------------------------------------------------
function renderPeople(week) {
  const view = document.getElementById("view");
  const w = WEEKS.find((x) => x.n === week);
  if (!w) return renderNotFound(view);

  if (members.length === 0) {
    view.innerHTML = `<div class="empty-state">아직 등록된 팀원이 없어요. 운영진에게 문의해주세요.</div>`;
    return;
  }

  const tiles = members.map((m) => {
    const e = allEntries.get(entryId(week, m.name));
    const filled = isEntryFilled(e);
    const isMe = m.name === session.name;
    return `
      <button class="folder-tile ${isMe ? "is-me" : ""}" data-hash="#/week/${week}/person/${encodeURIComponent(m.name)}">
        ${folderIcon(m.color)}
        <span class="ft-label">${filled ? '<span class="status-dot"></span>' : ""}${esc(m.name)}</span>
        ${isMe ? '<span class="ft-me-tag">내 폴더</span>' : `<span class="ft-meta">${filled ? "작성 완료" : "미작성"}</span>`}
      </button>
    `;
  }).join("");

  view.innerHTML = `<div class="folder-grid">${tiles}</div>`;
  view.querySelectorAll(".folder-tile").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.hash));
  });
}

function renderNotFound(view) {
  view.innerHTML = `<div class="empty-state">존재하지 않는 페이지예요.</div>`;
}

// ---------------------------------------------------------------------------
// View: single entry (read or edit) — gallery-style detail page
// ---------------------------------------------------------------------------
function renderEntry(week, person) {
  const view = document.getElementById("view");
  const w = WEEKS.find((x) => x.n === week);
  const member = members.find((m) => m.name === person);
  if (!w || !member) return renderNotFound(view);

  const isOwner = session.name === person;

  view.innerHTML = `
    ${!isOwner ? '<div class="readonly-banner">다른 팀원의 회고예요 — 열람만 가능해요.</div><br/>' : ""}
    <div class="entry-header">
      <div class="entry-id">
        <div class="name">${esc(person)}</div>
        <div class="sub">${esc(w.label)} · ${formatRange(w.start, w.end)}</div>
        <div class="sub" id="date-line"></div>
      </div>
      <div class="entry-content" id="entry-content">불러오는 중...</div>
    </div>
    <div class="photo-section-label">사진</div>
    <div class="photo-grid" id="photo-grid"></div>
    ${isOwner ? `
    <div class="entry-footer">
      <div class="save-status" id="save-status"></div>
      <button class="primary-btn" id="save-btn">저장하기</button>
    </div>` : ""}
    <div class="comments-section" id="comments-section"></div>
  `;

  if (entryUnsub) entryUnsub();
  entryUnsub = store.subscribeEntry(week, person, (entry) => {
    draft = {
      keep: entry?.keep || "",
      problem: entry?.problem || "",
      try: entry?.try || "",
      photos: entry?.photos ? entry.photos.map((p) => ({ ...p })) : [],
      updatedAt: entry?.updatedAt || null,
    };
    dirty = false;
    renderEntryBody(week, person, isOwner);
  });

  if (commentsUnsub) commentsUnsub();
  commentsUnsub = store.subscribeComments(entryId(week, person), (list) => {
    comments = list;
    renderComments(week, person, isOwner);
  });
}

function formatDateTime(ts) {
  if (!ts) return "";
  const ms = typeof ts === "number" ? ts : ts.toMillis ? ts.toMillis() : Date.parse(ts);
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const KPT_FIELDS = [
  { key: "keep", title: "Keep", desc: "이번 주 잘한 일" },
  { key: "problem", title: "Problem", desc: "아쉬웠던 일" },
  { key: "try", title: "Try", desc: "시도한 일" },
];

function renderEntryBody(week, person, isOwner) {
  const dateLine = document.getElementById("date-line");
  const contentEl = document.getElementById("entry-content");
  const photoGrid = document.getElementById("photo-grid");

  dateLine.textContent = draft.updatedAt ? `작성 시간 ${formatDateTime(draft.updatedAt)}` : "아직 저장 전이에요";

  if (!isOwner) {
    contentEl.innerHTML = KPT_FIELDS.map(
      (f) => `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${f.title}</strong><span>${f.desc}</span></div>
        <div class="readonly-content">${draft[f.key] ? esc(draft[f.key]) : "작성하지 않았어요."}</div>
      </div>`
    ).join("");
  } else {
    contentEl.innerHTML = KPT_FIELDS.map(
      (f) => `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${f.title}</strong><span>${f.desc}</span></div>
        <textarea id="kpt-${f.key}"></textarea>
      </div>`
    ).join("");
    KPT_FIELDS.forEach((f) => {
      const textarea = document.getElementById(`kpt-${f.key}`);
      textarea.value = draft[f.key];
      textarea.addEventListener("input", (e) => {
        draft[f.key] = e.target.value;
        e.target.classList.add("is-dirty");
        markDirty();
      });
    });
  }

  fillPhotoGrid(photoGrid, isOwner);

  if (isOwner) {
    document.getElementById("save-btn").addEventListener("click", () => doSave(week, person));
    updateSaveStatus();
  }
}

function fillPhotoGrid(gridEl, editable) {
  gridEl.innerHTML = "";
  if (!editable && draft.photos.length === 0) {
    gridEl.innerHTML = `<p class="ft-meta">첨부된 사진이 없어요.</p>`;
    return;
  }
  draft.photos.forEach((photo, idx) => {
    const card = document.createElement("div");
    card.className = "photo-card";
    const thumb = document.createElement("div");
    thumb.className = "photo-thumb";
    const img = document.createElement("img");
    img.src = photo.src;
    img.alt = photo.caption || "첨부 사진";
    img.addEventListener("click", () => openLightbox(photo.src, photo.caption));
    thumb.appendChild(img);
    if (editable) {
      const rm = document.createElement("button");
      rm.className = "photo-remove";
      rm.textContent = "×";
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        draft.photos.splice(idx, 1);
        markDirty();
        fillPhotoGrid(gridEl, editable);
      });
      thumb.appendChild(rm);
    }
    card.appendChild(thumb);
    if (editable) {
      const captionInput = document.createElement("input");
      captionInput.type = "text";
      captionInput.className = "photo-caption-input";
      captionInput.placeholder = "사진 설명 (선택)";
      captionInput.value = photo.caption || "";
      captionInput.addEventListener("input", (e) => {
        photo.caption = e.target.value;
        markDirty();
      });
      card.appendChild(captionInput);
    } else if (photo.caption) {
      const caption = document.createElement("div");
      caption.className = "photo-caption";
      caption.textContent = photo.caption;
      card.appendChild(caption);
    }
    gridEl.appendChild(card);
  });
  if (editable && draft.photos.length < MAX_PHOTOS) {
    const addBtn = document.createElement("button");
    addBtn.className = "photo-add";
    addBtn.innerHTML = '<span class="plus">+</span><span>사진 추가</span>';
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    addBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const files = Array.from(fileInput.files || []).slice(0, MAX_PHOTOS - draft.photos.length);
      for (const file of files) {
        try {
          const dataUrl = await compressImage(file);
          const currentTotal = draft.photos.reduce((s, p) => s + p.src.length, 0);
          if (currentTotal + dataUrl.length > MAX_PHOTO_BASE64_TOTAL) {
            alert("사진 용량이 너무 커요. 몇 장을 지우고 다시 시도해주세요.");
            break;
          }
          draft.photos.push({ src: dataUrl, caption: "" });
        } catch (err) {
          console.error(err);
        }
      }
      markDirty();
      fillPhotoGrid(gridEl, editable);
    });
    gridEl.appendChild(addBtn);
    gridEl.appendChild(fileInput);
  }
}

function openLightbox(src, caption) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  const img = document.createElement("img");
  img.src = src;
  overlay.appendChild(img);
  if (caption) {
    const cap = document.createElement("div");
    cap.className = "lightbox-caption";
    cap.textContent = caption;
    overlay.appendChild(cap);
  }
  const closeBtn = document.createElement("button");
  closeBtn.className = "lightbox-close";
  closeBtn.textContent = "×";
  overlay.appendChild(closeBtn);
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key === "Escape") close();
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(overlay);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function markDirty() {
  dirty = true;
  updateSaveStatus();
}

function updateSaveStatus() {
  const el = document.getElementById("save-status");
  if (!el) return;
  el.innerHTML = dirty ? '<span class="unsaved-dot"></span> 저장 안 된 변경사항이 있어요' : "";
}

async function doSave(week, person) {
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "저장 중...";
  try {
    await store.saveEntry(week, person, {
      keep: draft.keep,
      problem: draft.problem,
      try: draft.try,
      photos: draft.photos,
    });
    dirty = false;
    updateSaveStatus();
    KPT_FIELDS.forEach((f) => {
      document.getElementById(`kpt-${f.key}`)?.classList.remove("is-dirty");
    });
  } catch (err) {
    console.error(err);
    alert("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
  } finally {
    btn.disabled = false;
    btn.textContent = "저장하기";
  }
}

// ---------------------------------------------------------------------------
// Comments (댓글 + 대댓글, 1단계 답글까지)
// ---------------------------------------------------------------------------
function renderComments(week, person, isOwner) {
  const section = document.getElementById("comments-section");
  if (!section) return;

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesOf = (id) => comments.filter((c) => c.parentId === id);

  function commentHtml(c, isReply) {
    const isMine = c.author === session.name;
    if (editingCommentId === c.id) {
      return `
        <div class="comment-item" data-id="${c.id}">
          <div class="comment-head">
            <span class="comment-author">${esc(c.author)}</span>
            <span class="comment-time">${formatDateTime(c.createdAt)}</span>
          </div>
          <div class="comment-reply-form">
            <textarea data-edit-input="${c.id}">${esc(c.content)}</textarea>
            <div class="comment-form-actions">
              <button class="text-btn" data-cancel-edit="${c.id}">취소</button>
              <button class="text-btn text-btn-accent" data-save-edit="${c.id}">저장</button>
            </div>
          </div>
        </div>
      `;
    }
    return `
      <div class="comment-item" data-id="${c.id}">
        <div class="comment-head">
          <span class="comment-author">${esc(c.author)}</span>
          <span class="comment-time">${formatDateTime(c.createdAt)}</span>
          ${isMine ? `
            <button class="comment-reply-btn" data-edit-comment="${c.id}">수정</button>
            <button class="comment-reply-btn comment-reply-btn-danger" data-delete-comment="${c.id}">삭제</button>
          ` : ""}
        </div>
        <div class="comment-body">${esc(c.content)}</div>
        ${!isReply ? `<button class="comment-reply-btn" data-reply-to="${c.id}">답글</button>` : ""}
      </div>
    `;
  }

  const listHtml = topLevel
    .map((c) => {
      const replies = repliesOf(c.id);
      return `
        ${commentHtml(c, false)}
        <div class="comment-reply-form" id="reply-form-${c.id}" hidden>
          <textarea placeholder="답글을 입력하세요"></textarea>
          <div class="comment-form-actions">
            <button class="text-btn" data-cancel-reply="${c.id}">취소</button>
            <button class="text-btn text-btn-accent" data-submit-reply="${c.id}">답글 남기기</button>
          </div>
        </div>
        ${replies.length ? `<div class="comment-replies">${replies.map((r) => commentHtml(r, true)).join("")}</div>` : ""}
      `;
    })
    .join("");

  section.innerHTML = `
    <div class="comments-heading">댓글 ${comments.length > 0 ? comments.length : ""}</div>
    <div class="comment-list">
      ${topLevel.length === 0 ? '<p class="comment-empty">아직 댓글이 없어요.</p>' : listHtml}
    </div>
    ${!isOwner ? `
      <div class="comment-form">
        <textarea id="new-comment-input" placeholder="댓글을 남겨보세요"></textarea>
        <div class="comment-form-actions">
          <button class="text-btn text-btn-accent" id="submit-comment-btn">댓글 남기기</button>
        </div>
      </div>
    ` : ""}
  `;

  if (!isOwner) {
    const input = document.getElementById("new-comment-input");
    input.addEventListener("input", () => {
      input.classList.toggle("is-dirty", input.value.length > 0);
    });
    document.getElementById("submit-comment-btn").addEventListener("click", async () => {
      const content = input.value.trim();
      if (!content) return;
      await store.addComment(entryId(week, person), { author: session.name, content, parentId: null });
      input.value = "";
      input.classList.remove("is-dirty");
    });
  }

  section.querySelectorAll(".comment-reply-form textarea").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      textarea.classList.toggle("is-dirty", textarea.value.length > 0);
    });
  });

  section.querySelectorAll("[data-reply-to]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.replyTo;
      const form = document.getElementById(`reply-form-${id}`);
      if (form) form.hidden = !form.hidden;
    });
  });
  section.querySelectorAll("[data-cancel-reply]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = document.getElementById(`reply-form-${btn.dataset.cancelReply}`);
      if (form) form.hidden = true;
    });
  });
  section.querySelectorAll("[data-submit-reply]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const parentId = btn.dataset.submitReply;
      const form = document.getElementById(`reply-form-${parentId}`);
      const textarea = form.querySelector("textarea");
      const content = textarea.value.trim();
      if (!content) return;
      await store.addComment(entryId(week, person), { author: session.name, content, parentId });
      textarea.value = "";
      textarea.classList.remove("is-dirty");
      form.hidden = true;
    });
  });

  section.querySelectorAll("[data-edit-comment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCommentId = btn.dataset.editComment;
      renderComments(week, person, isOwner);
    });
  });
  section.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCommentId = null;
      renderComments(week, person, isOwner);
    });
  });
  section.querySelectorAll("[data-save-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.saveEdit;
      const textarea = section.querySelector(`[data-edit-input="${id}"]`);
      const content = textarea.value.trim();
      if (!content) return;
      editingCommentId = null;
      await store.updateComment(id, { content });
    });
  });
  section.querySelectorAll("[data-delete-comment]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("댓글을 삭제할까요?")) return;
      await store.deleteComment(btn.dataset.deleteComment);
    });
  });
}

// ---------------------------------------------------------------------------
// View: notice (read-only announcement post)
// ---------------------------------------------------------------------------
function renderNotice(id) {
  const view = document.getElementById("view");
  const notice = announcements.find((a) => a.id === id);
  if (!notice) return renderNotFound(view);

  const blocksHtml = (notice.blocks || [])
    .map((b) => {
      if (b.type === "image") {
        return `
          <div class="notice-block notice-block-image">
            <img src="${b.src}" alt="${esc(b.caption || "공지 사진")}" />
            ${b.caption ? `<div class="photo-caption">${esc(b.caption)}</div>` : ""}
          </div>`;
      }
      return `<div class="notice-block notice-block-text">${esc(b.content || "")}</div>`;
    })
    .join("");

  view.innerHTML = `
    <div class="notice-title">${esc(notice.title || "제목 없음")}</div>
    <div class="notice-date">${formatDateTime(notice.createdAt)} 작성</div>
    <div class="notice-body">${blocksHtml || '<p class="ft-meta">내용이 없어요.</p>'}</div>
  `;
}

// ---------------------------------------------------------------------------
// Login gate
// ---------------------------------------------------------------------------
async function renderGate() {
  const isDemo = store && store.mode === "demo";
  root.innerHTML = `
    <div class="gate-wrap">
      <div class="gate-window">
        <div class="cargo-titlebar">
          <span class="tl-dot red"></span><span class="tl-dot yellow"></span><span class="tl-dot green"></span>
        </div>
        <div class="gate-card">
          <p class="gate-kicker">Welcome!</p>
          <h1 class="gate-title">챕터엔 회고록</h1>
          <p class="gate-sub">4자리 번호를 입력해서 들어가세요</p>
          <form id="pin-form" novalidate>
            <input class="pin-input" id="pin-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" />
            <div class="gate-error" id="pin-error"></div>
            <button class="primary-btn" type="submit">입장하기</button>
          </form>
          ${isDemo ? `<p class="demo-banner">데모 모드예요. 예시 번호로 들어가보세요 — 김영서: 1111 / 남현아: 2222</p>` : ""}
        </div>
      </div>
    </div>
  `;
  const input = document.getElementById("pin-input");
  input.focus();
  document.getElementById("pin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = input.value.trim();
    const errorEl = document.getElementById("pin-error");
    if (!/^\d{4}$/.test(pin)) {
      errorEl.textContent = "숫자 4자리를 입력해주세요.";
      return;
    }
    const match = await store.verifyPin(pin);
    if (!match) {
      errorEl.textContent = "등록되지 않은 번호예요. 운영진에게 문의해주세요.";
      input.value = "";
      input.focus();
      return;
    }
    session = { name: match.name, pin: match.pin };
    saveSession(session);
    render();
  });
}
