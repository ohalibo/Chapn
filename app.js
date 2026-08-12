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
let MONTHS = [];
let announcements = [];
let session = loadSession();
let entryUnsub = null;
let commentsUnsub = null;
let draft = null;
let dirty = false;
let comments = [];
let editingCommentId = null;
let nowPlayingHandles = [];
let allComments = [];
let commentsDigestOpen = false;
let commentsDigestTab = "mine"; // "mine" | "others"
let mountedEntryKey = null;
let membersLoaded = false;
let weeksLoaded = false;
let monthsLoaded = false;

init();

async function init() {
  store = await getStore();
  store.subscribeMembers((list) => {
    members = list;
    if (membersLoaded && session && !members.some((m) => m.name === session.name && m.pin === session.pin)) {
      session = null;
      clearSession();
    }
    membersLoaded = true;
    render();
  });
  store.subscribeAllEntries((map) => {
    allEntries = map;
    render();
  });
  store.subscribeWeeks((list) => {
    WEEKS = list;
    weeksLoaded = true;
    render();
  });
  store.subscribeMonths((list) => {
    MONTHS = list;
    monthsLoaded = true;
    render();
  });
  store.subscribeAnnouncements((list) => {
    announcements = list;
    render();
  });
  store.subscribeAllComments((list) => {
    allComments = list;
    renderCommentsDigest();
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
  document.addEventListener("click", (e) => {
    if (!commentsDigestOpen) return;
    if (e.target.closest("#comments-digest-panel, #comments-digest-btn")) return;
    commentsDigestOpen = false;
    renderCommentsDigest();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && commentsDigestOpen) {
      commentsDigestOpen = false;
      renderCommentsDigest();
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
  if ((parts[0] === "week" || parts[0] === "month") && parts[1]) {
    const kind = parts[0];
    const n = Number(parts[1]);
    if (parts[2] === "person" && parts[3]) {
      return { view: "entry", kind, n, person: decodeURIComponent(parts[3]) };
    }
    return { view: "people", kind, n };
  }
  if (parts[0] === "notice" && parts[1]) {
    return { view: "notice", noticeId: decodeURIComponent(parts[1]) };
  }
  return { view: "weeks" };
}

function go(hash) {
  location.hash = hash;
}

function entryKey(kind, n, person) {
  return `${kind === "month" ? "m" : "w"}${n}_${person}`;
}

function periodsFor(kind) {
  return kind === "month" ? MONTHS : WEEKS;
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
  return `<svg viewBox="0 0 68 54" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
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
// Comments digest (좌측 하단 종 모양 버튼 — 지금까지 달린 댓글을 모아보고
// 눌러서 바로 그 회고 페이지로 이동)
// ---------------------------------------------------------------------------
const COMMENTS_DIGEST_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000; // 작성일로부터 10일까지만 목록에 보여줘요.

function bellIcon() {
  return `<svg viewBox="0 0 20 20" width="17" height="17" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 2.3a3.9 3.9 0 0 0-3.9 3.9v2.2c0 .7-.25 1.4-.7 1.95L4.3 11.7a1 1 0 0 0 .8 1.6h9.8a1 1 0 0 0 .8-1.6l-1.1-1.35c-.45-.55-.7-1.25-.7-1.95V6.2A3.9 3.9 0 0 0 10 2.3Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>
    <path d="M8.1 15.8a1.9 1.9 0 0 0 3.8 0" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/>
  </svg>`;
}

function commentsDigestSeenKey() {
  return `chapn_comments_seen_${session ? session.name : ""}`;
}
function getCommentsSeenAt() {
  if (!session) return 0;
  return Number(localStorage.getItem(commentsDigestSeenKey())) || 0;
}
function markCommentsSeen() {
  if (!session) return;
  localStorage.setItem(commentsDigestSeenKey(), String(Date.now()));
}
function commentTimeMs(c) {
  const ts = c && c.createdAt;
  if (!ts) return 0;
  return typeof ts === "number" ? ts : ts.toMillis ? ts.toMillis() : Date.parse(ts) || 0;
}
function parseEntryId(entryId) {
  const m = /^([wm])(\d+)_(.+)$/.exec(entryId || "");
  if (!m) return null;
  return { kind: m[1] === "m" ? "month" : "week", n: Number(m[2]), person: m[3] };
}
function entryLabelFor(parsed) {
  const period = periodsFor(parsed.kind).find((p) => p.n === parsed.n);
  const periodLabel = period ? period.label : `${parsed.kind === "month" ? "월" : "주차"} ${parsed.n}`;
  return `${periodLabel} · ${parsed.person}`;
}

// renderEntry()가 페이지를 못 찾는 것과 같은 조건 — 주차/월이나 팀원이
// 삭제돼서 더 이상 이동할 수 없는 댓글은 모아보기 목록에서 아예 빼요.
function entryStillExists(parsed) {
  const periodExists = periodsFor(parsed.kind).some((p) => p.n === parsed.n);
  const memberExists = members.some((m) => m.name === parsed.person);
  return periodExists && memberExists;
}

function digestRowHtml(c, parsed) {
  const hash = `#/${parsed.kind}/${parsed.n}/person/${encodeURIComponent(parsed.person)}`;
  const preview = (c.content || "").trim().replace(/\s+/g, " ");
  const truncated = preview.length > 42 ? `${preview.slice(0, 42)}…` : preview;
  return `
    <button type="button" class="comments-digest-row" data-hash="${esc(hash)}">
      <span class="comments-digest-row-top">
        <span class="comments-digest-row-author">${esc(c.author || "")}</span>
        <span class="comments-digest-row-time">${formatDateTime(c.createdAt)}</span>
      </span>
      <span class="comments-digest-row-preview">${esc(truncated) || "(내용 없음)"}</span>
      <span class="comments-digest-row-meta">${esc(entryLabelFor(parsed))}</span>
    </button>
  `;
}

// 버튼/패널 DOM만 갱신합니다 — 전체 render()를 다시 부르면 지금 작성 중인
// 다른 화면(예: 회고 작성 중 textarea)이 초기화될 수 있어서, 댓글이 새로
// 달릴 때마다 이 함수만 따로 호출해요.
function renderCommentsDigest() {
  const btn = document.getElementById("comments-digest-btn");
  const panel = document.getElementById("comments-digest-panel");
  if (!btn || !panel) return;

  const seenAt = getCommentsSeenAt();
  const oldestVisible = Date.now() - COMMENTS_DIGEST_MAX_AGE_MS;
  const allRows = allComments
    .map((c) => ({ c, parsed: parseEntryId(c.entryId) }))
    .filter((x) => x.parsed && entryStillExists(x.parsed) && commentTimeMs(x.c) >= oldestVisible)
    .sort((a, b) => commentTimeMs(b.c) - commentTimeMs(a.c));
  const mineRows = allRows.filter((x) => x.parsed.person === session.name);
  const othersRows = allRows.filter((x) => x.parsed.person !== session.name);
  const rows = commentsDigestTab === "mine" ? mineRows : othersRows;
  const newRows = rows.filter((x) => commentTimeMs(x.c) > seenAt);
  const oldRows = rows.filter((x) => commentTimeMs(x.c) <= seenAt);
  const totalNewCount = allRows.filter((x) => commentTimeMs(x.c) > seenAt).length;

  btn.innerHTML = `
    ${bellIcon()}
    ${totalNewCount > 0 ? `<span class="comments-digest-badge">${totalNewCount > 99 ? "99+" : totalNewCount}</span>` : ""}
  `;

  panel.hidden = !commentsDigestOpen;
  panel.innerHTML = `
    <div class="comments-digest-head">
      <span>댓글 모아보기</span>
      <button type="button" class="comments-digest-close" id="comments-digest-close" aria-label="닫기">×</button>
    </div>
    <div class="comments-digest-tabs">
      <button type="button" class="comments-digest-tab ${commentsDigestTab === "mine" ? "active" : ""}" data-digest-tab="mine">
        내 글 댓글${mineRows.length > 0 ? ` (${mineRows.length})` : ""}
      </button>
      <button type="button" class="comments-digest-tab ${commentsDigestTab === "others" ? "active" : ""}" data-digest-tab="others">
        다른 사람 댓글${othersRows.length > 0 ? ` (${othersRows.length})` : ""}
      </button>
    </div>
    <div class="comments-digest-list">
      ${
        rows.length === 0
          ? `<p class="comments-digest-empty">${commentsDigestTab === "mine" ? "내 글에 달린 댓글이 없어요." : "다른 사람 글에 달린 댓글이 없어요."}</p>`
          : `
        ${newRows.length > 0 ? `<div class="comments-digest-section-label">신규</div>${newRows.map((x) => digestRowHtml(x.c, x.parsed)).join("")}` : ""}
        ${oldRows.length > 0 ? `<div class="comments-digest-section-label">이전</div>${oldRows.map((x) => digestRowHtml(x.c, x.parsed)).join("")}` : ""}
      `
      }
    </div>
  `;

  document.getElementById("comments-digest-close").addEventListener("click", () => {
    commentsDigestOpen = false;
    renderCommentsDigest();
  });
  panel.querySelectorAll("[data-digest-tab]").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      commentsDigestTab = tabBtn.dataset.digestTab;
      renderCommentsDigest();
    });
  });
  panel.querySelectorAll(".comments-digest-row").forEach((row) => {
    row.addEventListener("click", () => {
      commentsDigestOpen = false;
      go(row.dataset.hash);
      renderCommentsDigest();
    });
  });
}

// ---------------------------------------------------------------------------
// Shell (macOS-style window: titlebar + sidebar + main)
// ---------------------------------------------------------------------------
// 13명이 같이 쓰다 보니, 누군가 어디서든 저장/댓글/설정 변경을 하면 그
// 구독 콜백이 "전체" render()를 다시 부르게 되어 있었어요. 예전에는
// render()가 매번 root.innerHTML을 통째로 새로 그렸는데, 그러면 하필
// 그 순간 다른 사람이 회고를 쓰고 있던 <textarea>까지 통째로 새로 만들어져서
// 입력 중이던(아직 저장 안 한) 내용과 포커스가 날아가 버렸어요 — "저장하면
// 리셋되는" 것처럼 보인 원인. 그래서 지금은 껍데기(사이드바 등)는 한 번만
// 만들고, "이미 보고 있는 회고와 같은 회고"면 본문(#view)은 다시 그리지
// 않도록 바꿨어요. 그 회고 자체의 최신 내용은 renderEntry()가 따로 걸어둔
// 전용 구독(entryUnsub)이 알아서 반영해줘요.
function wireShellOnce() {
  const sidebarEl = document.getElementById("cargo-sidebar");
  const backdropEl = document.getElementById("sidebar-backdrop");
  function closeMobileSidebar() {
    sidebarEl.classList.remove("mobile-open");
    backdropEl.classList.remove("visible");
  }
  document.getElementById("mobile-menu-btn").addEventListener("click", () => {
    sidebarEl.classList.toggle("mobile-open");
    backdropEl.classList.toggle("visible");
  });
  backdropEl.addEventListener("click", closeMobileSidebar);

  document.getElementById("comments-digest-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    commentsDigestOpen = !commentsDigestOpen;
    if (commentsDigestOpen) markCommentsSeen();
    renderCommentsDigest();
  });
  document.getElementById("comments-digest-panel").addEventListener("click", (e) => {
    e.stopPropagation();
  });
  renderCommentsDigest();
}

function ensureShellMounted() {
  if (document.querySelector(".cargo-window")) return;
  root.innerHTML = `
    <div class="cargo-window">
      <div class="cargo-titlebar">
        <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="메뉴 열기">
          <svg viewBox="0 0 20 16" width="18" height="14"><path d="M0 1h20M0 8h20M0 15h20" stroke="currentColor" stroke-width="1.6"/></svg>
        </button>
        <span class="tl-dot red"></span><span class="tl-dot yellow"></span><span class="tl-dot green"></span>
        <span class="cargo-title">챕터엔 회고록</span>
      </div>
      <div class="cargo-body">
        <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
        <aside class="cargo-sidebar" id="cargo-sidebar"></aside>
        <main class="cargo-main" id="view"></main>
      </div>
    </div>
    <button class="comments-digest-btn" id="comments-digest-btn" type="button" aria-label="댓글 모아보기"></button>
    <div class="comments-digest-panel" id="comments-digest-panel" hidden></div>
  `;
  wireShellOnce();
}

// 사이드바는 눌러도 되는 버튼들만 있어서(입력 중인 텍스트가 없음) 매번
// 다시 그려도 안전해요. 그래서 최신 주차/월/세션 정보를 그때그때 반영해요.
function updateSidebarNav(route) {
  const sidebarEl = document.getElementById("cargo-sidebar");
  const backdropEl = document.getElementById("sidebar-backdrop");
  sidebarEl.innerHTML = `
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
      <button class="sb-item ${route.kind === "week" && route.n === w.n ? "active" : ""}" data-hash="#/week/${w.n}">
        ${sidebarIcon()}<span class="sb-label">${esc(w.label)}</span>
      </button>`
    ).join("")}
    ${MONTHS.length > 0 ? `
    <div class="sb-section-title">월간</div>
    ${MONTHS.map(
      (m) => `
      <button class="sb-item ${route.kind === "month" && route.n === m.n ? "active" : ""}" data-hash="#/month/${m.n}">
        ${sidebarIcon()}<span class="sb-label">${esc(m.label)}</span>
      </button>`
    ).join("")}` : ""}
  `;

  function closeMobileSidebar() {
    sidebarEl.classList.remove("mobile-open");
    backdropEl.classList.remove("visible");
  }
  sidebarEl.querySelectorAll(".sb-item[data-hash]").forEach((el) => {
    el.addEventListener("click", () => {
      closeMobileSidebar();
      go(el.dataset.hash);
    });
  });
  document.getElementById("logout-btn").addEventListener("click", () => {
    session = null;
    clearSession();
    render();
  });
}

function render() {
  if (!session) {
    mountedEntryKey = null;
    return renderGate();
  }
  const route = parseHash();
  ensureShellMounted();
  updateSidebarNav(route);

  if (route.view === "entry") {
    const key = `${route.kind}:${route.n}:${route.person}`;
    if (key === mountedEntryKey) return; // 같은 회고를 계속 보고 있는 중 — 본문은 건드리지 않아요.
    // 주차/월 목록이나 팀원 목록이 아직 한 번도 안 왔으면(막 접속한 직후 등),
    // 진짜로 없는 페이지인지 아직 판단할 수 없어요. 여기서 mountedEntryKey를
    // 확정해버리면 나중에 데이터가 도착해도 다시 그려주지 않으니, 이 경우엔
    // "불러오는 중" 상태로만 두고 다음 render()를 기다려요.
    const periodLoaded = route.kind === "month" ? monthsLoaded : weeksLoaded;
    if (!periodLoaded || !membersLoaded) {
      const view = document.getElementById("view");
      if (view) view.innerHTML = `<div class="empty-state">불러오는 중...</div>`;
      return;
    }
    mountedEntryKey = key;
    renderEntry(route.kind, route.n, route.person);
    return;
  }

  if (mountedEntryKey) {
    mountedEntryKey = null;
    if (entryUnsub) {
      entryUnsub();
      entryUnsub = null;
      draft = null;
    }
    if (commentsUnsub) {
      commentsUnsub();
      commentsUnsub = null;
      comments = [];
      editingCommentId = null;
    }
    if (nowPlayingHandles.length) teardownNowPlaying();
  }

  if (route.view === "weeks") renderWeeks();
  else if (route.view === "people") renderPeople(route.kind, route.n);
  else if (route.view === "notice") renderNotice(route.noticeId);
}

// ---------------------------------------------------------------------------
// View: weeks grid
// ---------------------------------------------------------------------------
function periodFolderTiles(kind, periods) {
  return periods.map((p) => {
    const total = members.length;
    const filled = members.filter((m) => isEntryFilled(allEntries.get(entryKey(kind, p.n, m.name)))).length;
    return `
      <button class="folder-tile" data-hash="#/${kind}/${p.n}">
        ${folderIcon()}
        <span class="ft-label">${filled > 0 ? '<span class="status-dot"></span>' : ""}${esc(p.label)}</span>
        <span class="ft-meta">${formatRange(p.start, p.end)} · ${filled}/${total || 0}</span>
      </button>
    `;
  }).join("");
}

function renderWeeks() {
  const view = document.getElementById("view");
  const globalNotices = announcements.filter((a) => !a.month);
  if (WEEKS.length === 0 && MONTHS.length === 0 && globalNotices.length === 0) {
    view.innerHTML = `<div class="empty-state">아직 등록된 주차/월간이 없어요. 운영진에게 문의해주세요.</div>`;
    return;
  }

  const noticeTiles = globalNotices.map((a) => `
    <button class="file-tile" data-hash="#/notice/${encodeURIComponent(a.id)}">
      ${documentIcon()}
      <span class="ft-label">${esc(a.title || "제목 없음")}</span>
    </button>
  `).join("");

  view.innerHTML = `
    ${globalNotices.length > 0 ? `<div class="file-grid">${noticeTiles}</div><hr class="section-divider" />` : ""}
    ${WEEKS.length > 0 ? `<div class="folder-grid">${periodFolderTiles("week", WEEKS)}</div>` : ""}
    ${MONTHS.length > 0 ? `${WEEKS.length > 0 ? '<hr class="section-divider" />' : ""}<div class="folder-grid">${periodFolderTiles("month", MONTHS)}</div>` : ""}
  `;
  view.querySelectorAll(".folder-tile, .file-tile").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.hash));
  });
}

// ---------------------------------------------------------------------------
// View: people grid (for a given week or month)
// ---------------------------------------------------------------------------
function renderPeople(kind, n) {
  const view = document.getElementById("view");
  const w = periodsFor(kind).find((x) => x.n === n);
  if (!w) return renderNotFound(view);

  if (members.length === 0) {
    view.innerHTML = `<div class="empty-state">아직 등록된 팀원이 없어요. 운영진에게 문의해주세요.</div>`;
    return;
  }

  const tiles = members.map((m) => {
    const e = allEntries.get(entryKey(kind, n, m.name));
    const filled = isEntryFilled(e);
    const isMe = m.name === session.name;
    return `
      <button class="folder-tile ${isMe ? "is-me" : ""}" data-hash="#/${kind}/${n}/person/${encodeURIComponent(m.name)}">
        ${folderIcon(m.color)}
        <span class="ft-label">${filled ? '<span class="status-dot"></span>' : ""}${esc(m.name)}</span>
        ${isMe ? '<span class="ft-me-tag">내 폴더</span>' : `<span class="ft-meta">${filled ? "작성 완료" : "미작성"}</span>`}
      </button>
    `;
  }).join("");

  const monthNotices = kind === "month" ? announcements.filter((a) => a.month === n) : [];
  const noticeTiles = monthNotices.map((a) => `
    <button class="file-tile" data-hash="#/notice/${encodeURIComponent(a.id)}">
      ${documentIcon()}
      <span class="ft-label">${esc(a.title || "제목 없음")}</span>
    </button>
  `).join("");

  view.innerHTML = `
    ${monthNotices.length > 0 ? `<div class="file-grid">${noticeTiles}</div><hr class="section-divider" />` : ""}
    <div class="folder-grid">${tiles}</div>
  `;
  view.querySelectorAll(".folder-tile, .file-tile").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.hash));
  });
}

function renderNotFound(view) {
  view.innerHTML = `<div class="empty-state">존재하지 않는 페이지예요.</div>`;
}

// ---------------------------------------------------------------------------
// View: single entry (read or edit) — gallery-style detail page
// ---------------------------------------------------------------------------
function renderEntry(kind, n, person) {
  const view = document.getElementById("view");
  const w = periodsFor(kind).find((x) => x.n === n);
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
  const subscribeFn = kind === "month" ? store.subscribeMonthEntry : store.subscribeEntry;
  entryUnsub = subscribeFn(n, person, (entry) => {
    draft = {
      keep: entry?.keep || "",
      problem: entry?.problem || "",
      try: entry?.try || "",
      shareLink: entry?.shareLink ?? entry?.share ?? "",
      shareText: entry?.shareText || "",
      shareType: entry?.shareType === "text" ? "text" : "link",
      music: entry?.music || "",
      musicTitle: entry?.musicTitle || "",
      photos: entry?.photos ? entry.photos.map((p) => ({ ...p })) : [],
      updatedAt: entry?.updatedAt || null,
    };
    dirty = false;
    renderEntryBody(kind, n, person, isOwner);
  });

  if (commentsUnsub) commentsUnsub();
  commentsUnsub = store.subscribeComments(entryKey(kind, n, person), (list) => {
    comments = list;
    renderComments(kind, n, person, isOwner);
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
  { key: "try", title: "Try", desc: "다음 주 시도해볼 일" },
];
const SHARE_FIELD = { key: "share", title: "Share", desc: "공유하고 싶은 것" };
const MUSIC_FIELD = { key: "music", title: "Music", desc: "듣고 싶은 노래 (유튜브/사운드클라우드 링크)" };

function isHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// 링크 하나를 "평소엔 하이퍼링크로 보이다가, 링크가 아닌 근처를 누르면
// 바로 그 자리에서 입력창으로 바뀌는" 인라인 필드로 그려 넣습니다.
// editable === false면(다른 사람 글 볼 때) 항상 표시 모드만 사용합니다.
function stripUrlProtocol(v) {
  return (v || "").replace(/^\s*https?:\/\//i, "");
}

function renderLinkField(container, { getValue, setValue, editable, emptyText }) {
  container.innerHTML = `
    <div class="link-field ${editable ? "link-field--editable" : ""}">
      <a class="link-field-link" target="_blank" rel="noopener noreferrer" hidden></a>
      <span class="link-field-text" hidden></span>
      <span class="link-field-empty" hidden>${esc(emptyText || "작성하지 않았어요.")}</span>
      ${
        editable
          ? `<span class="link-field-input-wrap" hidden>
        <span class="link-field-prefix">https://</span><input type="text" class="link-field-input" placeholder="example.com/..." />
      </span>`
          : ""
      }
    </div>
  `;
  const root = container.querySelector(".link-field");
  const linkEl = root.querySelector(".link-field-link");
  const textEl = root.querySelector(".link-field-text");
  const emptyEl = root.querySelector(".link-field-empty");
  const wrapEl = editable ? root.querySelector(".link-field-input-wrap") : null;
  const inputEl = editable ? root.querySelector(".link-field-input") : null;

  function showDisplay() {
    const value = (getValue() || "").trim();
    linkEl.hidden = true;
    textEl.hidden = true;
    emptyEl.hidden = true;
    if (value && isHttpUrl(value)) {
      linkEl.href = value;
      linkEl.textContent = value;
      linkEl.hidden = false;
    } else if (value) {
      textEl.textContent = value;
      textEl.hidden = false;
    } else {
      emptyEl.hidden = false;
    }
  }

  if (editable) {
    function startEdit() {
      wrapEl.hidden = false;
      inputEl.value = stripUrlProtocol(getValue());
      linkEl.hidden = true;
      textEl.hidden = true;
      emptyEl.hidden = true;
      inputEl.focus();
      inputEl.select();
    }
    root.addEventListener("click", (e) => {
      if (!wrapEl.hidden) return;
      if (e.target.closest(".link-field-link")) return;
      startEdit();
    });
    inputEl.addEventListener("input", (e) => {
      const raw = stripUrlProtocol(e.target.value);
      if (raw !== e.target.value) e.target.value = raw;
      setValue(raw ? `https://${raw}` : "");
      markDirty();
    });
    inputEl.addEventListener("blur", () => {
      wrapEl.hidden = true;
      showDisplay();
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") inputEl.blur();
    });
  }

  showDisplay();
  return { refresh: showDisplay };
}

// Share 칸을 "링크" 모드(renderLinkField 그대로)와 "글" 모드(자동으로
// 늘어나는 textarea, Keep/Problem/Try와 같은 방식) 중에 골라 쓸 수 있게 해줍니다.
function mountShareField(container, editable) {
  if (!editable) {
    const hasLink = !!(draft.shareLink && draft.shareLink.trim());
    const hasText = !!(draft.shareText && draft.shareText.trim());

    // 링크랑 글을 둘 다 적어놨으면, 보는 사람이 토글로 둘 다 볼 수 있게 해요.
    // 하나만 적었으면 굳이 토글 없이 그것만 바로 보여줘요.
    if (hasLink && hasText) {
      let viewMode = draft.shareType === "text" ? "text" : "link";
      container.innerHTML = `
        <div class="share-mode-toggle">
          <button type="button" class="share-mode-btn" data-share-mode="link">링크</button>
          <button type="button" class="share-mode-btn" data-share-mode="text">글</button>
        </div>
        <div class="share-mode-body"></div>
      `;
      const bodyEl = container.querySelector(".share-mode-body");
      function renderViewBody() {
        container.querySelectorAll(".share-mode-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.shareMode === viewMode);
        });
        if (viewMode === "text") {
          bodyEl.innerHTML = `<div class="readonly-content">${esc(draft.shareText)}</div>`;
        } else {
          bodyEl.innerHTML = "";
          renderLinkField(bodyEl, { getValue: () => draft.shareLink, setValue: () => {}, editable: false });
        }
      }
      container.querySelectorAll(".share-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          viewMode = btn.dataset.shareMode;
          renderViewBody();
        });
      });
      renderViewBody();
      return;
    }
    if (hasText) {
      container.innerHTML = `<div class="readonly-content">${esc(draft.shareText)}</div>`;
      return;
    }
    container.innerHTML = "";
    renderLinkField(container, {
      getValue: () => draft.shareLink,
      setValue: (v) => { draft.shareLink = v; },
      editable: false,
    });
    return;
  }

  container.innerHTML = `
    <div class="share-mode-toggle">
      <button type="button" class="share-mode-btn" data-share-mode="link">링크</button>
      <button type="button" class="share-mode-btn" data-share-mode="text">글</button>
    </div>
    <div class="share-mode-body"></div>
  `;
  const bodyEl = container.querySelector(".share-mode-body");

  // 링크 모드와 글 모드는 서로 다른 내용을 담는 별개의 칸이에요(draft.shareLink
  // / draft.shareText). 토글을 바꿔도 다른 모드에 입력했던 텍스트가 섞여
  // 보이지 않아요 — shareType은 "지금 어느 쪽을 보여줄지"만 결정합니다.
  function mountBody() {
    container.querySelectorAll(".share-mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.shareMode === (draft.shareType || "link"));
    });
    bodyEl.innerHTML = "";
    if (draft.shareType === "text") {
      const textarea = document.createElement("textarea");
      textarea.id = "share-text-input";
      textarea.className = "share-text-input";
      textarea.placeholder = "자유롭게 적어보세요";
      textarea.value = draft.shareText || "";
      bodyEl.appendChild(textarea);
      applyFieldCleanState(textarea, draft.shareText);
      autoGrowTextarea(textarea);
      textarea.addEventListener("input", (e) => {
        draft.shareText = e.target.value;
        e.target.classList.remove("is-clean");
        markDirty();
        autoGrowTextarea(e.target);
      });
    } else {
      renderLinkField(bodyEl, {
        getValue: () => draft.shareLink,
        setValue: (v) => { draft.shareLink = v; },
        editable: true,
        emptyText: "클릭해서 링크를 추가해보세요",
      });
    }
  }

  container.querySelectorAll(".share-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.shareMode;
      if (mode === (draft.shareType || "link")) return;
      draft.shareType = mode;
      markDirty();
      mountBody();
    });
  });

  mountBody();
}

// 클릭하면 그 자리에서 바로 고쳐 쓸 수 있는 짧은 텍스트 하나를 그려 넣습니다.
// (Now Playing 곡 제목처럼, 자동으로 못 가져온 값을 사람이 대신 채워 넣을 때 씁니다.)
function renderInlineText(container, { getValue, setValue, editable, placeholder }) {
  container.innerHTML = `
    <span class="now-playing-title-display"></span>
    ${editable ? `<input type="text" class="now-playing-title-input" hidden />` : ""}
  `;
  const displayEl = container.querySelector(".now-playing-title-display");
  const inputEl = editable ? container.querySelector(".now-playing-title-input") : null;

  function render() {
    const value = (getValue() || "").trim();
    displayEl.textContent = value || placeholder || "";
    displayEl.classList.toggle("is-placeholder", !value);
  }

  if (editable) {
    container.classList.add("now-playing-title-mount--editable");
    container.addEventListener("click", () => {
      if (!inputEl.hidden) return;
      inputEl.hidden = false;
      displayEl.hidden = true;
      inputEl.value = getValue() || "";
      inputEl.focus();
      inputEl.select();
    });
    inputEl.addEventListener("input", (e) => {
      setValue(e.target.value);
      markDirty();
    });
    inputEl.addEventListener("blur", () => {
      inputEl.hidden = true;
      displayEl.hidden = false;
      render();
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") inputEl.blur();
    });
  }

  render();
  return { render };
}

function extractYouTubeId(url) {
  if (!url) return null;
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host === "youtu.be" || host.endsWith(".youtu.be")) {
    return u.pathname.slice(1).split("/")[0] || null;
  }
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/]+)/);
    if (m) return m[2];
  }
  return null;
}

// Music 칸에 넣은 링크가 유튜브인지 사운드클라우드인지 구분해서
// { type: "youtube", id } 또는 { type: "soundcloud", url } 형태로 돌려줍니다.
function detectMusicSource(rawUrl) {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  const youtubeId = extractYouTubeId(url);
  if (youtubeId) return { type: "youtube", id: youtubeId };
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com") || host === "snd.sc" || host.endsWith(".snd.sc")) {
    return { type: "soundcloud", url: u.toString() };
  }
  return null;
}

function formatPlayerTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

let ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return ytApiPromise;
}

let scApiPromise = null;
function loadSoundCloudApi() {
  if (window.SC && window.SC.Widget) return Promise.resolve(window.SC);
  if (scApiPromise) return scApiPromise;
  scApiPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.onload = () => resolve(window.SC);
    document.head.appendChild(script);
  });
  return scApiPromise;
}

const NOW_PLAYING_LOAD_TIMEOUT_MS = 8000;

// source(= detectMusicSource 결과)가 가리키는 자리에 "NOW PLAYING" 플레이어를
// 그려 넣고, 나중에 정리(destroy)할 수 있는 핸들을 nowPlayingHandles에 등록합니다.
// titleCtx: { getTitle, setTitle, editable } — 곡 제목을 사람이 직접 덮어쓸 수 있게 해줍니다.
async function mountNowPlaying(container, source, titleCtx) {
  const { getTitle, setTitle, editable } = titleCtx || {};
  container.innerHTML = `
    <div class="now-playing-label">Now Playing</div>
    <hr class="now-playing-rule" />
    <div class="now-playing-row">
      <button type="button" class="now-playing-toggle" data-state="paused" aria-label="재생">
        <span class="icon-play">▶</span>
        <span class="icon-pause">⏸</span>
      </button>
      <div class="now-playing-title" id="now-playing-title-mount"></div>
      <div class="now-playing-time">0:00 / 0:00</div>
    </div>
    <div class="now-playing-error" hidden>노래를 불러올 수 없어요.</div>
    <hr class="now-playing-rule" />
    <div class="now-playing-frame"></div>
  `;
  const rowEl = container.querySelector(".now-playing-row");
  const errorEl = container.querySelector(".now-playing-error");
  const toggleBtn = container.querySelector(".now-playing-toggle");
  const timeEl = container.querySelector(".now-playing-time");
  const frameEl = container.querySelector(".now-playing-frame");

  let fetchedTitle = "";
  const titleField = renderInlineText(container.querySelector("#now-playing-title-mount"), {
    getValue: () => (getTitle ? getTitle() : "") || fetchedTitle,
    setValue: (v) => setTitle && setTitle(v),
    editable: !!editable,
    placeholder: editable ? "제목을 입력해주세요" : "제목 미입력",
  });
  function setFetchedTitle(title) {
    fetchedTitle = title || "";
    titleField.render();
  }

  let destroyed = false;
  let timer = null;
  let loaded = false;

  function showError() {
    if (destroyed) return;
    rowEl.hidden = true;
    errorEl.hidden = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  setTimeout(() => {
    if (!loaded) showError();
  }, NOW_PLAYING_LOAD_TIMEOUT_MS);

  if (source.type === "youtube") {
    const YT = await loadYouTubeApi();
    if (destroyed) return;

    const player = new YT.Player(frameEl, {
      height: "1",
      width: "1",
      videoId: source.id,
      playerVars: { controls: 0, disablekb: 1, playsinline: 1 },
      events: {
        onReady: (e) => {
          loaded = true;
          const data = e.target.getVideoData ? e.target.getVideoData() : null;
          setFetchedTitle(data && data.title);
          timeEl.textContent = `0:00 / ${formatPlayerTime(e.target.getDuration())}`;
        },
        onError: () => showError(),
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            toggleBtn.dataset.state = "playing";
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
              timeEl.textContent = `${formatPlayerTime(player.getCurrentTime())} / ${formatPlayerTime(player.getDuration())}`;
            }, 500);
          } else {
            toggleBtn.dataset.state = "paused";
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
            if (e.data === YT.PlayerState.ENDED) {
              timeEl.textContent = `0:00 / ${formatPlayerTime(player.getDuration())}`;
            }
          }
        },
      },
    });

    toggleBtn.addEventListener("click", () => {
      const state = player.getPlayerState();
      if (state === YT.PlayerState.PLAYING) player.pauseVideo();
      else player.playVideo();
    });

    nowPlayingHandles.push({
      destroy() {
        destroyed = true;
        if (timer) clearInterval(timer);
        try {
          player.destroy();
        } catch {
          // player가 아직 준비되기 전에 파괴되는 경우는 무시해도 괜찮아요.
        }
      },
    });
    return;
  }

  // 사운드클라우드
  // iframe 자체는 정상 크기로 두고(내부 위젯 스크립트가 파형을 그릴 캔버스 크기를
  // 확보할 수 있도록), 바깥 .now-playing-frame이 1px로 잘라서 화면엔 안 보이게 합니다.
  const iframe = document.createElement("iframe");
  iframe.width = "300";
  iframe.height = "166";
  iframe.allow = "autoplay";
  iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(source.url)}&auto_play=false&show_artwork=false&visual=false`;
  frameEl.appendChild(iframe);

  const SC = await loadSoundCloudApi();
  if (destroyed) return;
  const widget = SC.Widget(iframe);

  widget.bind(SC.Widget.Events.READY, () => {
    loaded = true;
    widget.getCurrentSound((sound) => {
      setFetchedTitle(sound && sound.title);
    });
    widget.getDuration((ms) => {
      timeEl.textContent = `0:00 / ${formatPlayerTime(ms / 1000)}`;
    });
  });
  if (SC.Widget.Events.ERROR) {
    widget.bind(SC.Widget.Events.ERROR, () => showError());
  }
  widget.bind(SC.Widget.Events.PLAY, () => {
    toggleBtn.dataset.state = "playing";
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      widget.getPosition((posMs) => {
        widget.getDuration((durMs) => {
          timeEl.textContent = `${formatPlayerTime(posMs / 1000)} / ${formatPlayerTime(durMs / 1000)}`;
        });
      });
    }, 500);
  });
  widget.bind(SC.Widget.Events.PAUSE, () => {
    toggleBtn.dataset.state = "paused";
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });
  widget.bind(SC.Widget.Events.FINISH, () => {
    toggleBtn.dataset.state = "paused";
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  toggleBtn.addEventListener("click", () => {
    if (toggleBtn.dataset.state === "playing") widget.pause();
    else widget.play();
  });

  nowPlayingHandles.push({
    destroy() {
      destroyed = true;
      if (timer) clearInterval(timer);
      frameEl.innerHTML = "";
    },
  });
}

function teardownNowPlaying() {
  nowPlayingHandles.forEach((h) => h.destroy());
  nowPlayingHandles = [];
}

// 내용이 있고(저장된 값과 일치해서) "정리된" 상태일 때만 테두리를 없애요.
// 비어 있거나 아직 저장 안 한 상태에는 어디를 눌러야 할지 보이도록 테두리를 유지합니다.
function applyFieldCleanState(textarea, value) {
  textarea.classList.toggle("is-clean", !!(value && value.trim()));
}

// 내용 길이에 맞춰 textarea 자체 높이를 늘려서, 박스 내부가 아니라
// 페이지 전체가 스크롤되도록 합니다.
function autoGrowTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function renderEntryBody(kind, n, person, isOwner) {
  const dateLine = document.getElementById("date-line");
  const contentEl = document.getElementById("entry-content");
  const photoGrid = document.getElementById("photo-grid");

  dateLine.textContent = draft.updatedAt ? `작성 시간 ${formatDateTime(draft.updatedAt)}` : "아직 저장 전이에요";

  teardownNowPlaying();

  if (!isOwner) {
    const musicSource = detectMusicSource(draft.music);
    contentEl.innerHTML =
      KPT_FIELDS.map(
        (f) => `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${f.title}</strong><span>${f.desc}</span></div>
        <div class="readonly-content">${draft[f.key] ? esc(draft[f.key]) : "작성하지 않았어요."}</div>
      </div>`
      ).join("") +
      `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${SHARE_FIELD.title}</strong><span>${SHARE_FIELD.desc}</span></div>
        <div id="share-field-mount"></div>
      </div>` +
      `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${MUSIC_FIELD.title}</strong><span>${MUSIC_FIELD.desc}</span></div>
        ${
          draft.music
            ? musicSource
              ? `<div class="now-playing" id="now-playing-readonly"></div>`
              : `<div class="readonly-content">유튜브 또는 사운드클라우드 링크가 아니에요: ${esc(draft.music)}</div>`
            : `<div class="readonly-content">작성하지 않았어요.</div>`
        }
      </div>`;
    mountShareField(document.getElementById("share-field-mount"), false);
    if (musicSource) {
      mountNowPlaying(document.getElementById("now-playing-readonly"), musicSource, {
        getTitle: () => draft.musicTitle,
        editable: false,
      });
    }
  } else {
    contentEl.innerHTML =
      KPT_FIELDS.map(
        (f) => `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${f.title}</strong><span>${f.desc}</span></div>
        <textarea id="kpt-${f.key}"></textarea>
      </div>`
      ).join("") +
      `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${SHARE_FIELD.title}</strong><span>${SHARE_FIELD.desc}</span></div>
        <div id="share-field-mount"></div>
      </div>` +
      `
      <div class="kpt-field">
        <div class="kpt-label"><strong>${MUSIC_FIELD.title}</strong><span>${MUSIC_FIELD.desc}</span></div>
        <input type="url" id="kpt-music" placeholder="유튜브 또는 사운드클라우드 링크" />
        <div class="now-playing-hint" id="music-hint" hidden>유튜브 또는 사운드클라우드 링크 형식이 아니에요. 링크를 다시 확인해주세요.</div>
        <div class="now-playing" id="now-playing-edit" hidden></div>
      </div>`;
    KPT_FIELDS.forEach((f) => {
      const textarea = document.getElementById(`kpt-${f.key}`);
      textarea.value = draft[f.key];
      applyFieldCleanState(textarea, draft[f.key]);
      autoGrowTextarea(textarea);
      textarea.addEventListener("input", (e) => {
        draft[f.key] = e.target.value;
        e.target.classList.remove("is-clean");
        markDirty();
        autoGrowTextarea(e.target);
      });
    });

    mountShareField(document.getElementById("share-field-mount"), true);

    const musicInput = document.getElementById("kpt-music");
    const musicHint = document.getElementById("music-hint");
    const musicPreview = document.getElementById("now-playing-edit");
    let previewMusicKey = null;
    function syncMusicPreview() {
      const value = (draft.music || "").trim();
      const source = detectMusicSource(value);
      musicHint.hidden = !(value && !source);
      const key = source ? `${source.type}:${source.id || source.url}` : null;
      if (key === previewMusicKey) return;
      previewMusicKey = key;
      teardownNowPlaying();
      if (source) {
        musicPreview.hidden = false;
        mountNowPlaying(musicPreview, source, {
          getTitle: () => draft.musicTitle,
          setTitle: (v) => { draft.musicTitle = v; },
          editable: true,
        });
      } else {
        musicPreview.hidden = true;
        musicPreview.innerHTML = "";
      }
    }
    musicInput.value = draft.music;
    applyFieldCleanState(musicInput, draft.music);
    musicInput.addEventListener("input", (e) => {
      draft.music = e.target.value;
      e.target.classList.remove("is-clean");
      markDirty();
      syncMusicPreview();
    });
    syncMusicPreview();
  }

  fillPhotoGrid(photoGrid, isOwner);

  if (isOwner) {
    document.getElementById("save-btn").addEventListener("click", () => doSave(kind, n, person));
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
          const dataUrl = await openCropModal(file);
          if (!dataUrl) continue;
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

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function cropToCompressedDataUrl(img, sx, sy, sw, sh) {
  const scale = Math.min(1, PHOTO_MAX_WIDTH / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
}

// ---------------------------------------------------------------------------
// Photo crop modal (자유 / 1:1)
// ---------------------------------------------------------------------------
const CROP_HANDLE_MIN_SIZE = 40;

function openCropModal(file) {
  return new Promise(async (resolve) => {
    let img;
    try {
      img = await loadImageFromFile(file);
    } catch (err) {
      console.error(err);
      resolve(null);
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "crop-overlay";
    overlay.innerHTML = `
      <div class="crop-card">
        <div class="crop-card-head">
          <div>
            <div class="crop-card-title">사진 자르기</div>
            <div class="crop-card-filename">${esc(file.name || "")}</div>
          </div>
          <button type="button" class="crop-close" aria-label="닫기">×</button>
        </div>
        <div class="crop-ratio-row">
          <button type="button" class="crop-ratio-btn is-active" data-ratio="free">자유</button>
          <button type="button" class="crop-ratio-btn" data-ratio="1:1">1:1</button>
        </div>
        <div class="crop-stage">
          <div class="crop-image-wrap">
            <img class="crop-image" alt="" />
            <div class="crop-box">
              <div class="crop-handle" data-handle="nw"></div>
              <div class="crop-handle" data-handle="ne"></div>
              <div class="crop-handle" data-handle="sw"></div>
              <div class="crop-handle" data-handle="se"></div>
            </div>
          </div>
        </div>
        <div class="crop-card-foot">
          <button type="button" class="text-btn" data-crop-cancel>취소</button>
          <button type="button" class="primary-btn" data-crop-apply>적용</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const wrap = overlay.querySelector(".crop-image-wrap");
    const imgEl = overlay.querySelector(".crop-image");
    const box = overlay.querySelector(".crop-box");
    const stage = overlay.querySelector(".crop-stage");

    let ratioLocked = false;
    let dispW = 0;
    let dispH = 0;
    let rect = { left: 0, top: 0, width: 0, height: 0 };

    function layoutImage() {
      const maxW = Math.min(stage.clientWidth - 4, 640);
      const maxH = Math.min(window.innerHeight * 0.55, 520);
      const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
      dispW = Math.round(img.naturalWidth * scale);
      dispH = Math.round(img.naturalHeight * scale);
      wrap.style.width = `${dispW}px`;
      wrap.style.height = `${dispH}px`;
      imgEl.src = img.src;
      imgEl.style.width = `${dispW}px`;
      imgEl.style.height = `${dispH}px`;

      const initSize = Math.round(Math.min(dispW, dispH) * 0.9);
      rect = {
        left: Math.round((dispW - initSize) / 2),
        top: Math.round((dispH - initSize) / 2),
        width: initSize,
        height: initSize,
      };
      applyRect();
    }

    function applyRect() {
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }

    function clampRect() {
      rect.width = Math.min(rect.width, dispW);
      rect.height = Math.min(rect.height, dispH);
      rect.left = Math.min(Math.max(0, rect.left), dispW - rect.width);
      rect.top = Math.min(Math.max(0, rect.top), dispH - rect.height);
    }

    layoutImage();

    overlay.querySelectorAll(".crop-ratio-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        overlay.querySelectorAll(".crop-ratio-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        ratioLocked = btn.dataset.ratio === "1:1";
        if (ratioLocked) {
          const size = Math.min(rect.width, rect.height);
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          rect = { left: cx - size / 2, top: cy - size / 2, width: size, height: size };
          clampRect();
          applyRect();
        }
      });
    });

    box.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".crop-handle")) return;
      e.preventDefault();
      box.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startRect = { ...rect };
      function onMove(ev) {
        rect.left = startRect.left + (ev.clientX - startX);
        rect.top = startRect.top + (ev.clientY - startY);
        clampRect();
        applyRect();
      }
      function onUp(ev) {
        box.releasePointerCapture(ev.pointerId);
        box.removeEventListener("pointermove", onMove);
        box.removeEventListener("pointerup", onUp);
      }
      box.addEventListener("pointermove", onMove);
      box.addEventListener("pointerup", onUp);
    });

    overlay.querySelectorAll(".crop-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        const which = handle.dataset.handle;
        const startX = e.clientX;
        const startY = e.clientY;
        const startRect = { ...rect };
        const anchorX = which.includes("w") ? startRect.left + startRect.width : startRect.left;
        const anchorY = which.includes("n") ? startRect.top + startRect.height : startRect.top;
        function onMove(ev) {
          let dx = ev.clientX - startX;
          let dy = ev.clientY - startY;
          let newLeft = which.includes("w") ? startRect.left + dx : startRect.left;
          let newTop = which.includes("n") ? startRect.top + dy : startRect.top;
          let newRight = which.includes("e") ? startRect.left + startRect.width + dx : startRect.left + startRect.width;
          let newBottom = which.includes("s") ? startRect.top + startRect.height + dy : startRect.top + startRect.height;
          let w = newRight - (which.includes("w") ? newLeft : startRect.left);
          let h = newBottom - (which.includes("n") ? newTop : startRect.top);
          let left = which.includes("w") ? newRight - w : startRect.left;
          let top = which.includes("n") ? newBottom - h : startRect.top;

          w = Math.max(CROP_HANDLE_MIN_SIZE, w);
          h = Math.max(CROP_HANDLE_MIN_SIZE, h);

          if (ratioLocked) {
            const size = Math.max(w, h);
            w = size;
            h = size;
            left = which.includes("w") ? anchorX - size : anchorX;
            top = which.includes("n") ? anchorY - size : anchorY;
          } else {
            left = which.includes("w") ? anchorX - w : anchorX;
            top = which.includes("n") ? anchorY - h : anchorY;
          }

          if (left < 0) { w += left; left = 0; }
          if (top < 0) { h += top; top = 0; }
          if (left + w > dispW) w = dispW - left;
          if (top + h > dispH) h = dispH - top;
          if (ratioLocked) {
            const size = Math.min(w, h);
            w = size;
            h = size;
            left = which.includes("w") ? anchorX - size : anchorX;
            top = which.includes("n") ? anchorY - size : anchorY;
          }

          rect = { left, top, width: w, height: h };
          applyRect();
        }
        function onUp(ev) {
          handle.releasePointerCapture(ev.pointerId);
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
        }
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
      });
    });

    function finish(dataUrl) {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(dataUrl);
    }
    function onKey(e) {
      if (e.key === "Escape") finish(null);
    }
    document.addEventListener("keydown", onKey);

    let overlayPointerDownOnSelf = false;
    overlay.addEventListener("pointerdown", (e) => {
      overlayPointerDownOnSelf = e.target === overlay;
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay && overlayPointerDownOnSelf) finish(null);
      overlayPointerDownOnSelf = false;
    });
    overlay.querySelector(".crop-close").addEventListener("click", () => finish(null));
    overlay.querySelector("[data-crop-cancel]").addEventListener("click", () => finish(null));
    overlay.querySelector("[data-crop-apply]").addEventListener("click", () => {
      const natScale = img.naturalWidth / dispW;
      const sx = rect.left * natScale;
      const sy = rect.top * natScale;
      const sw = rect.width * natScale;
      const sh = rect.height * natScale;
      finish(cropToCompressedDataUrl(img, sx, sy, sw, sh));
    });
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

async function doSave(kind, n, person) {
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "저장 중...";
  try {
    const saveFn = kind === "month" ? store.saveMonthEntry : store.saveEntry;
    await saveFn(n, person, {
      keep: draft.keep,
      problem: draft.problem,
      try: draft.try,
      shareLink: draft.shareLink,
      shareText: draft.shareText,
      shareType: draft.shareType,
      music: draft.music,
      musicTitle: draft.musicTitle,
      photos: draft.photos,
    });
    dirty = false;
    updateSaveStatus();
    KPT_FIELDS.forEach((f) => {
      const textarea = document.getElementById(`kpt-${f.key}`);
      if (textarea) applyFieldCleanState(textarea, draft[f.key]);
    });
    const musicInput = document.getElementById("kpt-music");
    if (musicInput) applyFieldCleanState(musicInput, draft.music);
    const shareTextInput = document.getElementById("share-text-input");
    if (shareTextInput) applyFieldCleanState(shareTextInput, draft.shareText);
  } catch (err) {
    console.error(err);
    alert("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
  } finally {
    btn.disabled = false;
    btn.textContent = "저장하기";
  }
}

// ---------------------------------------------------------------------------
// Comments (댓글 + 대댓글, 무제한 depth)
// ---------------------------------------------------------------------------
const COMMENT_MAX_INDENT_DEPTH = 6;

function renderComments(kind, n, person, isOwner) {
  const section = document.getElementById("comments-section");
  if (!section) return;

  const childrenOf = (id) => comments.filter((c) => c.parentId === id);

  function commentHtml(c, depth) {
    const isMine = c.author === session.name;
    const indent = Math.min(depth, COMMENT_MAX_INDENT_DEPTH) * 16;
    if (editingCommentId === c.id) {
      return `
        <div class="comment-item" data-id="${c.id}" data-depth="${depth}" style="margin-left:${indent}px">
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
      <div class="comment-item" data-id="${c.id}" data-depth="${depth}" style="margin-left:${indent}px">
        <div class="comment-head">
          <span class="comment-author">${esc(c.author)}</span>
          <span class="comment-time">${formatDateTime(c.createdAt)}</span>
          ${isMine ? `
            <button class="comment-reply-btn" data-edit-comment="${c.id}">수정</button>
            <button class="comment-reply-btn comment-reply-btn-danger" data-delete-comment="${c.id}">삭제</button>
          ` : ""}
        </div>
        <div class="comment-body">${esc(c.content)}</div>
        <button class="comment-reply-btn" data-reply-to="${c.id}">답글</button>
        <div class="comment-reply-form" id="reply-form-${c.id}" hidden>
          <textarea placeholder="답글을 입력하세요"></textarea>
          <div class="comment-form-actions">
            <button class="text-btn" data-cancel-reply="${c.id}">취소</button>
            <button class="text-btn text-btn-accent" data-submit-reply="${c.id}">답글 남기기</button>
          </div>
        </div>
      </div>
    `;
  }

  function threadHtml(c, depth) {
    const kids = childrenOf(c.id);
    return commentHtml(c, depth) + kids.map((k) => threadHtml(k, depth + 1)).join("");
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const listHtml = topLevel.map((c) => threadHtml(c, 0)).join("");

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
      await store.addComment(entryKey(kind, n, person), { author: session.name, content, parentId: null });
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
      await store.addComment(entryKey(kind, n, person), { author: session.name, content, parentId });
      textarea.value = "";
      textarea.classList.remove("is-dirty");
      form.hidden = true;
    });
  });

  section.querySelectorAll("[data-edit-comment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCommentId = btn.dataset.editComment;
      renderComments(kind, n, person, isOwner);
    });
  });
  section.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingCommentId = null;
      renderComments(kind, n, person, isOwner);
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
function groupNoticeBlocks(blocks) {
  const groups = [];
  let imgGroup = null;
  (blocks || []).forEach((b) => {
    if (b.type === "image") {
      if (!imgGroup) {
        imgGroup = [];
        groups.push({ type: "images", items: imgGroup });
      }
      imgGroup.push(b);
    } else {
      imgGroup = null;
      groups.push({ type: "text", content: b.content });
    }
  });
  return groups;
}

function renderNotice(id) {
  const view = document.getElementById("view");
  const notice = announcements.find((a) => a.id === id);
  if (!notice) return renderNotFound(view);

  const groups = groupNoticeBlocks(notice.blocks);
  const blocksHtml = groups
    .map((g) => {
      if (g.type === "images") {
        const cards = g.items
          .map(
            (b, i) => `
          <div class="photo-card">
            <div class="photo-thumb"><img src="${b.src}" alt="${esc(b.caption || "공지 사진")}" /></div>
            ${b.caption ? `<div class="photo-caption">${esc(b.caption)}</div>` : ""}
          </div>`
          )
          .join("");
        return `<div class="photo-grid">${cards}</div>`;
      }
      return `<div class="notice-block notice-block-text">${esc(g.content || "")}</div>`;
    })
    .join("");

  view.innerHTML = `
    <div class="notice-title">${esc(notice.title || "제목 없음")}</div>
    <div class="notice-date">${formatDateTime(notice.createdAt)} 작성</div>
    <div class="notice-body">${blocksHtml || '<p class="ft-meta">내용이 없어요.</p>'}</div>
  `;

  const flatImages = groups.filter((g) => g.type === "images").flatMap((g) => g.items);
  view.querySelectorAll(".notice-body .photo-thumb img").forEach((img, i) => {
    img.addEventListener("click", () => openLightbox(flatImages[i].src, flatImages[i].caption));
  });
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
