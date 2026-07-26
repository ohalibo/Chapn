import { getStore } from "./store.js";
import {
  getWeeks,
  MAX_PHOTOS,
  MAX_PHOTO_BASE64_TOTAL,
  PHOTO_MAX_WIDTH,
  PHOTO_JPEG_QUALITY,
} from "./config.js";

const root = document.getElementById("app");
const WEEKS = getWeeks();
const SESSION_KEY = "chapn_session";

let store = null;
let members = [];
let allEntries = new Map();
let session = loadSession();
let entryUnsub = null;
let draft = null; // { date, content, photos: [dataUrl,...] } for the entry currently open
let dirty = false;

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
  return { view: "weeks" };
}

function go(hash) {
  location.hash = hash;
}

function entryId(week, person) {
  return `w${week}_${person}`;
}

function render() {
  if (!session) return renderGate();
  const route = parseHash();
  if (route.view !== "entry" && entryUnsub) {
    entryUnsub();
    entryUnsub = null;
    draft = null;
  }
  root.innerHTML = shellTemplate();
  document.getElementById("logout-btn").addEventListener("click", () => {
    session = null;
    clearSession();
    render();
  });

  if (route.view === "weeks") renderWeeks();
  else if (route.view === "people") renderPeople(route.week);
  else renderEntry(route.week, route.person);
}

function shellTemplate() {
  return `
    <div class="app-shell">
      <header class="site-header">
        <h1 class="site-title">챕터<span>n</span> 회고록</h1>
        <div class="session-pill">
          <span><strong>${esc(session.name)}</strong>님 열람 중</span>
          <button class="link-btn" id="logout-btn">나가기</button>
        </div>
      </header>
      <div id="view"></div>
      <p class="footer-note">${store.mode === "demo" ? "데모 모드 · 이 브라우저에만 저장됩니다" : "챕터n 전용 회고 아카이브"}</p>
    </div>
  `;
}

function breadcrumb(items) {
  // items: [{label, hash?}] last item has no hash (current)
  const html = items
    .map((it, i) => {
      const isLast = i === items.length - 1;
      const sep = i > 0 ? '<span class="sep">/</span>' : "";
      if (isLast) return `${sep}<span class="current">${esc(it.label)}</span>`;
      return `${sep}<button data-hash="${it.hash}">${esc(it.label)}</button>`;
    })
    .join("");
  return `<nav class="breadcrumb">${html}</nav>`;
}

function bindBreadcrumb(container) {
  container.querySelectorAll(".breadcrumb button").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.hash));
  });
}

// ---------------------------------------------------------------------------
// View: weeks grid
// ---------------------------------------------------------------------------
function renderWeeks() {
  const view = document.getElementById("view");
  const cards = WEEKS.map((w) => {
    const total = members.length;
    const filled = members.filter((m) => {
      const e = allEntries.get(entryId(w.n, m.name));
      return e && e.content && e.content.trim();
    }).length;
    return `
      <button class="folder-card" data-hash="#/week/${w.n}">
        <span class="tab"></span>
        <span class="fc-index">WEEK ${String(w.n).padStart(2, "0")}</span>
        <span class="fc-title">${esc(w.label)}</span>
        <span class="fc-meta">
          <span class="dot ${filled > 0 ? "filled" : ""}"></span>
          ${w.range} · ${filled}/${total || 0}명 작성
        </span>
      </button>
    `;
  }).join("");

  view.innerHTML = `
    ${breadcrumb([{ label: "홈" }])}
    <h2 class="section-heading">주차 선택</h2>
    <p class="section-sub">주차를 클릭하면 팀원 폴더가 나와요.</p>
    <div class="folder-grid">${cards}</div>
  `;
  view.querySelectorAll(".folder-card").forEach((el) => {
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
    view.innerHTML = `
      ${breadcrumb([{ label: "홈", hash: "#/" }, { label: w.label }])}
      <h2 class="section-heading">${esc(w.label)} <span style="color:var(--ink-faint); font-weight:400;">(${w.range})</span></h2>
      <div class="empty-state">아직 등록된 팀원이 없어요. 운영진에게 문의해주세요.</div>
    `;
    bindBreadcrumb(view);
    return;
  }

  const cards = members.map((m) => {
    const e = allEntries.get(entryId(week, m.name));
    const filled = !!(e && e.content && e.content.trim());
    const isMe = m.name === session.name;
    return `
      <button class="folder-card ${isMe ? "is-me" : ""}" data-hash="#/week/${week}/person/${encodeURIComponent(m.name)}">
        <span class="tab"></span>
        <span class="fc-index">${isMe ? '<span class="me-badge">내 폴더</span>' : "FOLDER"}</span>
        <span class="fc-title">${esc(m.name)}</span>
        <span class="fc-meta">
          <span class="dot ${filled ? "filled" : ""}"></span>
          ${filled ? "작성 완료" : "아직 작성 전"}
        </span>
      </button>
    `;
  }).join("");

  view.innerHTML = `
    ${breadcrumb([{ label: "홈", hash: "#/" }, { label: w.label }])}
    <h2 class="section-heading">${esc(w.label)} <span style="color:var(--ink-faint); font-weight:400;">(${w.range})</span></h2>
    <p class="section-sub">이름을 클릭해서 회고를 읽거나 작성하세요.</p>
    <div class="folder-grid">${cards}</div>
  `;
  bindBreadcrumb(view);
  view.querySelectorAll(".folder-card").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.hash));
  });
}

function renderNotFound(view) {
  view.innerHTML = `<div class="empty-state">존재하지 않는 페이지예요. <br/><button class="link-btn" data-hash="#/">홈으로</button></div>`;
  bindBreadcrumb(view);
}

// ---------------------------------------------------------------------------
// View: single entry (read or edit)
// ---------------------------------------------------------------------------
function renderEntry(week, person) {
  const view = document.getElementById("view");
  const w = WEEKS.find((x) => x.n === week);
  const member = members.find((m) => m.name === person);
  if (!w || !member) return renderNotFound(view);

  const isOwner = session.name === person;

  view.innerHTML = `
    ${breadcrumb([
      { label: "홈", hash: "#/" },
      { label: w.label, hash: `#/week/${week}` },
      { label: person },
    ])}
    <div class="index-card">
      <div class="index-card-head">
        <div>
          <div class="ic-person">${esc(person)}</div>
          <div class="ic-week">${esc(w.label)} · ${w.range}</div>
        </div>
        <span class="stamp-tag" id="saved-stamp">${formatUpdatedAt(null)}</span>
      </div>
      ${!isOwner ? '<div class="readonly-banner">다른 팀원의 회고예요 — 열람만 가능해요.</div>' : ""}
      <div class="ic-body" id="ic-body">불러오는 중...</div>
      ${isOwner ? `
      <div class="ic-footer">
        <div class="save-status" id="save-status"></div>
        <button class="primary-btn" id="save-btn" style="width:auto; padding:10px 22px;">저장하기</button>
      </div>` : ""}
    </div>
  `;
  bindBreadcrumb(view);

  if (entryUnsub) entryUnsub();
  entryUnsub = store.subscribeEntry(week, person, (entry) => {
    draft = {
      date: entry?.date || todayISO(),
      content: entry?.content || "",
      photos: entry?.photos ? [...entry.photos] : [],
    };
    dirty = false;
    document.getElementById("saved-stamp").textContent = formatUpdatedAt(entry?.updatedAt);
    renderEntryBody(week, person, isOwner);
  });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatUpdatedAt(ts) {
  if (!ts) return "아직 저장 전";
  const ms = typeof ts === "number" ? ts : ts.toMillis ? ts.toMillis() : Date.parse(ts);
  if (!ms) return "아직 저장 전";
  const d = new Date(ms);
  return `저장됨 · ${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderEntryBody(week, person, isOwner) {
  const body = document.getElementById("ic-body");
  if (!isOwner) {
    body.innerHTML = `
      <div>
        <span class="field-label">날짜</span>
        <div>${draft.date ? esc(draft.date) : "미기록"}</div>
      </div>
      <div>
        <span class="field-label">내용</span>
        <div class="readonly-content">${draft.content ? esc(draft.content) : "아직 작성된 회고가 없어요."}</div>
      </div>
      ${draft.photos.length ? `
      <div>
        <span class="field-label">사진</span>
        <div class="photo-grid" id="photo-grid"></div>
      </div>` : ""}
    `;
    if (draft.photos.length) fillPhotoGrid(document.getElementById("photo-grid"), false);
    return;
  }

  body.innerHTML = `
    <div>
      <span class="field-label">날짜</span>
      <input type="date" class="date-input" id="date-input" value="${esc(draft.date)}" />
    </div>
    <div>
      <span class="field-label">내용</span>
      <textarea class="content-area" id="content-area" placeholder="Keep - 이번 주 잘한 일&#10;Problem - 이번 주 아쉬웠던 일&#10;Try - 다음 주 시도해볼 일">${esc(draft.content)}</textarea>
    </div>
    <div>
      <span class="field-label">사진 첨부</span>
      <div class="photo-grid" id="photo-grid"></div>
    </div>
  `;
  document.getElementById("date-input").addEventListener("input", (e) => {
    draft.date = e.target.value;
    markDirty();
  });
  document.getElementById("content-area").addEventListener("input", (e) => {
    draft.content = e.target.value;
    markDirty();
  });
  fillPhotoGrid(document.getElementById("photo-grid"), true);

  document.getElementById("save-btn").addEventListener("click", () => doSave(week, person));
  updateSaveStatus();
}

function fillPhotoGrid(gridEl, editable) {
  gridEl.innerHTML = "";
  draft.photos.forEach((src, idx) => {
    const thumb = document.createElement("div");
    thumb.className = "photo-thumb";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "첨부 사진";
    thumb.appendChild(img);
    if (editable) {
      const rm = document.createElement("button");
      rm.className = "photo-remove";
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        draft.photos.splice(idx, 1);
        markDirty();
        fillPhotoGrid(gridEl, editable);
      });
      thumb.appendChild(rm);
    }
    gridEl.appendChild(thumb);
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
          const currentTotal = draft.photos.reduce((s, p) => s + p.length, 0);
          if (currentTotal + dataUrl.length > MAX_PHOTO_BASE64_TOTAL) {
            alert("사진 용량이 너무 커요. 몇 장을 지우고 다시 시도해주세요.");
            break;
          }
          draft.photos.push(dataUrl);
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
      date: draft.date,
      content: draft.content,
      photos: draft.photos,
    });
    dirty = false;
    updateSaveStatus();
  } catch (err) {
    console.error(err);
    alert("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
  } finally {
    btn.disabled = false;
    btn.textContent = "저장하기";
  }
}

// ---------------------------------------------------------------------------
// Login gate
// ---------------------------------------------------------------------------
async function renderGate() {
  const isDemo = store && store.mode === "demo";
  root.innerHTML = `
    <div class="gate-wrap">
      <div class="gate-card">
        <h1 class="site-title">챕터<span>n</span> 회고록</h1>
        <p class="gate-sub">4자리 번호를 입력해서 들어가세요</p>
        <form id="pin-form">
          <input class="pin-input" id="pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••" />
          <div class="gate-error" id="pin-error"></div>
          <button class="primary-btn" type="submit">입장하기</button>
        </form>
        ${isDemo ? `<p class="demo-banner">데모 모드예요. 예시 번호로 들어가보세요 — 김영서: 1111 / 남현아: 2222</p>` : ""}
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
