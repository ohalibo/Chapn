import { getStore } from "../store.js";
import { hslToHex, DEFAULT_MEMBER_COLOR } from "../config.js";
import { mountBuilder } from "./builder.js";
import { showAlert, showConfirm } from "./ui.js";

// ⚠️ 배포 전에 아래 문구를 꼭 바꾸세요. 이 파일은 브라우저에 그대로 내려가므로
// "아무나 못 찾는 주소 + 이 암호" 조합일 뿐, 완전한 보안은 아니에요.
const ADMIN_PASSCODE = "chapn-admin-2026";

const root = document.getElementById("app");
const SESSION_KEY = "chapn_admin_session";
const TABS = [
  { key: "members", label: "팀원 관리" },
  { key: "weeks", label: "주차 관리" },
  { key: "progress", label: "주차별 작성 현황" },
  { key: "months", label: "월 관리" },
  { key: "monthProgress", label: "월간 작성 현황" },
  { key: "notices", label: "공지 빌더" },
];

let store = null;
let members = [];
let weeks = [];
let months = [];
let allEntries = new Map();
let activeTab = "members";

init();

// ---------------------------------------------------------------------------
// 팝업 패널(색상/날짜 피커) 공용 로직
// ---------------------------------------------------------------------------
// 표 안에 있는 스크롤 영역(.app-main) 내부에 패널을 그대로 두면, 부모의
// overflow:auto에 잘려서 아래쪽 행에서 열었을 때 패널이 스크롤 밖으로
// 잘리거나 스크롤이 먹히는 문제가 있었어요. 그래서 패널은 body 바로 아래에
// fixed 위치로 띄우고, 트리거 버튼의 화면 좌표를 기준으로 위치만 계산합니다.
const openPanels = [];

function positionPanel(trigger, panel) {
  const rect = trigger.getBoundingClientRect();
  panel.style.position = "fixed";
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.left = `${rect.left}px`;
  requestAnimationFrame(() => {
    const panelRect = panel.getBoundingClientRect();
    if (panelRect.right > window.innerWidth - 8) {
      panel.style.left = `${Math.max(8, window.innerWidth - panelRect.width - 8)}px`;
    }
    if (panelRect.bottom > window.innerHeight - 8) {
      panel.style.top = `${Math.max(8, rect.top - panelRect.height - 8)}px`;
    }
  });
}

function openPanel(trigger, panel) {
  panel.hidden = false;
  positionPanel(trigger, panel);
  if (!openPanels.some((p) => p.panel === panel)) openPanels.push({ trigger, panel });
}

function closePanel(panel) {
  panel.hidden = true;
  const idx = openPanels.findIndex((p) => p.panel === panel);
  if (idx >= 0) openPanels.splice(idx, 1);
}

// 탭이 다시 그려질 때마다 색상/날짜 피커를 새로 만들기 때문에, body에 붙여둔
// 이전 패널들을 먼저 치우지 않으면 계속 쌓여요.
function clearAllPanels() {
  openPanels.length = 0;
  document.querySelectorAll(".color-panel, .date-panel").forEach((p) => p.remove());
}

document.addEventListener("click", (e) => {
  [...openPanels].forEach(({ trigger, panel }) => {
    if (!trigger.contains(e.target) && !panel.contains(e.target)) closePanel(panel);
  });
});
document.addEventListener(
  "scroll",
  () => {
    [...openPanels].forEach(({ panel }) => closePanel(panel));
  },
  true
);
window.addEventListener("resize", () => {
  [...openPanels].forEach(({ panel }) => closePanel(panel));
});

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function init() {
  if (sessionStorage.getItem(SESSION_KEY) !== "ok") {
    renderGate();
    return;
  }
  boot();
}

function renderGate() {
  root.innerHTML = `
    <div class="gate-wrap">
      <div class="gate-window">
        <div class="cargo-titlebar">
          <span class="tl-dot red"></span><span class="tl-dot yellow"></span><span class="tl-dot green"></span>
        </div>
        <div class="gate-card">
          <p class="gate-kicker">Admin</p>
          <h1>Chapter n admin</h1>
          <p>운영진 암호를 입력하세요</p>
          <form id="pw-form" novalidate>
            <input type="password" id="pw-input" autocomplete="off" />
            <div class="form-error" id="pw-error"></div>
            <button type="submit" class="btn-login">입장하기</button>
          </form>
        </div>
      </div>
    </div>
  `;
  document.getElementById("pw-input").focus();
  document.getElementById("pw-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("pw-input").value;
    if (val === ADMIN_PASSCODE) {
      sessionStorage.setItem(SESSION_KEY, "ok");
      boot();
    } else {
      document.getElementById("pw-error").textContent = "암호가 올바르지 않아요.";
    }
  });
}

async function boot() {
  root.innerHTML = `<div class="app"><div class="app-main"><p class="empty-state">불러오는 중...</p></div></div>`;
  store = await getStore();
  render();
  store.subscribeMembers((list) => {
    members = list;
    refreshTabData();
  });
  store.subscribeWeeks((list) => {
    weeks = list;
    refreshTabData();
  });
  store.subscribeMonths((list) => {
    months = list;
    refreshTabData();
  });
  store.subscribeAllEntries((map) => {
    allEntries = map;
    refreshTabData();
  });
}

// 데이터 구독 콜백에서는 이 함수만 호출합니다. 탭 전체를 다시 그리는 render()와
// 달리, "공지 빌더" 탭은 절대 다시 마운트하지 않아요 — 그러면 작성 중인
// 임시 글이 날아가버리기 때문.
function refreshTabData() {
  const main = document.getElementById("main");
  if (!main) return;
  if (activeTab === "members") renderMembersTab(main);
  else if (activeTab === "weeks") renderPeriodTab("week", main);
  else if (activeTab === "progress") renderPeriodProgressTab("week", main);
  else if (activeTab === "months") renderPeriodTab("month", main);
  else if (activeTab === "monthProgress") renderPeriodProgressTab("month", main);
}

function render() {
  root.innerHTML = `
    <div class="app">
      <div class="admin-titlebar">
        <span class="tl-dot red"></span><span class="tl-dot yellow"></span><span class="tl-dot green"></span>
        <span class="win-title">Chapter n admin</span>
      </div>
      <div class="admin-body">
        <aside class="admin-sidebar">
          <nav class="admin-nav">
            ${TABS.map(
              (t) => `<button class="ab-tab ${activeTab === t.key ? "active" : ""}" data-tab="${t.key}">${t.label}</button>`
            ).join("")}
          </nav>
          <div class="ab-spacer"></div>
          <span class="ab-mode">${store.mode === "demo" ? "데모 모드" : "실서비스 모드"}</span>
        </aside>
        <main class="app-main ${activeTab === "notices" ? "no-scroll" : ""}" id="main"></main>
      </div>
    </div>
  `;
  root.querySelectorAll(".ab-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      render();
    });
  });

  const main = document.getElementById("main");
  if (activeTab === "members") renderMembersTab(main);
  else if (activeTab === "weeks") renderPeriodTab("week", main);
  else if (activeTab === "progress") renderPeriodProgressTab("week", main);
  else if (activeTab === "months") renderPeriodTab("month", main);
  else if (activeTab === "monthProgress") renderPeriodProgressTab("month", main);
  else mountBuilder(main, store);
}

// ---------------------------------------------------------------------------
// 색상 피커 (포트폴리오 빌더의 accent picker와 동일한 HSL 슬라이더 방식)
// ---------------------------------------------------------------------------
function createColorPicker(initialColor, onChange) {
  let { h, s, l } = initialColor || DEFAULT_MEMBER_COLOR;

  const row = document.createElement("div");
  row.className = "color-picker";

  const swatchBtn = document.createElement("button");
  swatchBtn.type = "button";
  swatchBtn.className = "color-swatch";

  const panel = document.createElement("div");
  panel.className = "color-panel";
  panel.hidden = true;

  const hexEl = document.createElement("div");
  hexEl.className = "color-hex";
  panel.appendChild(hexEl);

  function sliderRow(labelText, min, max, value) {
    const wrap = document.createElement("label");
    wrap.className = "color-row";
    const labelLine = document.createElement("span");
    labelLine.className = "cr-label";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = labelText;
    const valSpan = document.createElement("span");
    labelLine.append(nameSpan, valSpan);
    wrap.appendChild(labelLine);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    wrap.appendChild(input);
    panel.appendChild(wrap);
    return { input, valSpan };
  }

  const hue = sliderRow("Hue", 0, 360, h);
  const sat = sliderRow("Saturation", 0, 100, s);
  const light = sliderRow("Lightness", 0, 100, l);

  function refresh() {
    h = Number(hue.input.value);
    s = Number(sat.input.value);
    l = Number(light.input.value);
    const hex = hslToHex(h, s, l);
    swatchBtn.style.background = hex;
    hexEl.textContent = hex;
    hue.valSpan.textContent = `${h}°`;
    sat.valSpan.textContent = `${s}%`;
    light.valSpan.textContent = `${l}%`;
  }
  refresh();

  [hue, sat, light].forEach(({ input }) => {
    input.addEventListener("input", () => {
      refresh();
      onChange({ h, s, l });
    });
  });

  document.body.appendChild(panel);
  swatchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) openPanel(swatchBtn, panel);
    else closePanel(panel);
  });

  row.append(swatchBtn);
  return { el: row, getColor: () => ({ h, s, l }) };
}

// ---------------------------------------------------------------------------
// 날짜 피커 (브라우저 기본 달력 대신, 디자인 시스템에 맞춘 커스텀 컴포넌트)
// ---------------------------------------------------------------------------
function isoOf(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function createDatePicker(initialISO, onChange) {
  let selected = initialISO || null;
  let viewDate = selected ? parseISODate(selected) : new Date();

  const wrap = document.createElement("div");
  wrap.className = "date-picker";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "date-trigger";

  const panel = document.createElement("div");
  panel.className = "date-panel";
  panel.hidden = true;

  function updateTrigger() {
    if (selected) {
      const d = parseISODate(selected);
      trigger.textContent = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
      trigger.classList.remove("placeholder");
    } else {
      trigger.textContent = "날짜 선택";
      trigger.classList.add("placeholder");
    }
  }

  function renderCalendar() {
    panel.innerHTML = "";
    const head = document.createElement("div");
    head.className = "dp-head";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "‹";
    const label = document.createElement("span");
    label.className = "dp-month-label";
    label.textContent = `${viewDate.getFullYear()}.${viewDate.getMonth() + 1}`;
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "›";
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
      renderCalendar();
    });
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
      renderCalendar();
    });
    head.append(prevBtn, label, nextBtn);
    panel.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "dp-grid";
    ["일", "월", "화", "수", "목", "금", "토"].forEach((d) => {
      const el = document.createElement("span");
      el.className = "dp-dow";
      el.textContent = d;
      grid.appendChild(el);
    });
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const todayISO = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
    for (let i = 0; i < firstDow; i++) grid.appendChild(document.createElement("span"));
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "dp-cell";
      cell.textContent = String(day);
      const cellISO = isoOf(year, month, day);
      if (cellISO === todayISO) cell.classList.add("today");
      if (cellISO === selected) cell.classList.add("selected");
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        selected = cellISO;
        updateTrigger();
        renderCalendar();
        onChange(selected);
        closePanel(panel);
      });
      grid.appendChild(cell);
    }
    panel.appendChild(grid);

    const foot = document.createElement("div");
    foot.className = "dp-foot";
    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.textContent = "오늘";
    todayBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = new Date();
      selected = isoOf(n.getFullYear(), n.getMonth(), n.getDate());
      viewDate = n;
      updateTrigger();
      renderCalendar();
      onChange(selected);
      closePanel(panel);
    });
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "지우기";
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selected = null;
      updateTrigger();
      renderCalendar();
      onChange(null);
    });
    foot.append(todayBtn, clearBtn);
    panel.appendChild(foot);
  }

  updateTrigger();
  renderCalendar();

  document.body.appendChild(panel);
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) openPanel(trigger, panel);
    else closePanel(panel);
  });

  wrap.append(trigger);
  return { el: wrap, getValue: () => selected };
}

// ---------------------------------------------------------------------------
// 팀원 관리
// ---------------------------------------------------------------------------
function renderMembersTab(main) {
  clearAllPanels();
  main.innerHTML = `
    <div class="section-card">
      <div class="section-head-row">
        <div>
          <h2 class="section-title">팀원 & 입장 번호</h2>
          <p class="section-sub">이름·PIN·폴더 색상을 자유롭게 바꿀 수 있어요. 입력 후 다른 곳을 클릭하면 자동 저장돼요.</p>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>이름</th><th>PIN</th><th>색상</th><th></th></tr></thead>
        <tbody id="member-rows"></tbody>
      </table>
      ${members.length === 0 ? '<p class="empty-state">아직 등록된 팀원이 없어요. 아래에서 추가해보세요.</p>' : ""}
      <form class="inline-form" id="add-member-form" novalidate>
        <div class="field">
          <label class="field-label" for="add-name">이름</label>
          <input type="text" id="add-name" placeholder="예: 김영서" />
        </div>
        <div class="field">
          <label class="field-label" for="add-pin">PIN (4자리)</label>
          <input type="text" id="add-pin" maxlength="4" inputmode="numeric" placeholder="1234" />
        </div>
        <button type="button" class="text-btn text-btn-sm" id="random-pin-btn">랜덤 생성</button>
        <div class="field">
          <label class="field-label">색상</label>
          <div id="add-color-slot"></div>
        </div>
        <button type="submit" class="btn btn-accent">추가</button>
        <span class="form-error" id="add-member-error"></span>
      </form>
    </div>
  `;

  const rows = document.getElementById("member-rows");
  members.forEach((m) => {
    const tr = document.createElement("tr");

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = m.name;
    nameInput.addEventListener("blur", async () => {
      const val = nameInput.value.trim();
      if (!val) { nameInput.value = m.name; return; }
      if (val === m.name) return;
      await store.updateMember(m.id, { name: val });
    });
    const tdName = document.createElement("td");
    tdName.appendChild(nameInput);

    const pinInput = document.createElement("input");
    pinInput.type = "text";
    pinInput.maxLength = 4;
    pinInput.inputMode = "numeric";
    pinInput.value = m.pin;
    pinInput.style.width = "60px";
    pinInput.addEventListener("blur", async () => {
      const val = pinInput.value.trim();
      if (val === m.pin) return;
      if (!/^\d{4}$/.test(val)) {
        await showAlert("PIN은 숫자 4자리여야 해요.");
        pinInput.value = m.pin;
        return;
      }
      const result = await store.updateMember(m.id, { pin: val });
      if (!result.ok) {
        await showAlert(result.error);
        pinInput.value = m.pin;
      }
    });
    const tdPin = document.createElement("td");
    tdPin.appendChild(pinInput);

    const tdColor = document.createElement("td");
    const picker = createColorPicker(m.color, async (color) => {
      await store.updateMember(m.id, { color });
    });
    tdColor.appendChild(picker.el);

    const tdActions = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "text-btn text-btn-danger text-btn-sm";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      const ok = await showConfirm(`${m.name}님을 삭제할까요? 작성된 회고 데이터는 남아있지만 더 이상 로그인할 수 없어요.`, { danger: true });
      if (ok) {
        await store.deleteMember(m.id);
      }
    });
    tdActions.appendChild(delBtn);

    tr.append(tdName, tdPin, tdColor, tdActions);
    rows.appendChild(tr);
  });

  document.getElementById("random-pin-btn").addEventListener("click", () => {
    document.getElementById("add-pin").value = String(Math.floor(1000 + Math.random() * 9000));
  });

  const addColorPicker = createColorPicker(
    { h: (members.length * 47) % 360, s: 60, l: 60 },
    () => {}
  );
  document.getElementById("add-color-slot").appendChild(addColorPicker.el);

  document.getElementById("add-member-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("add-name").value.trim();
    const pin = document.getElementById("add-pin").value.trim();
    const errorEl = document.getElementById("add-member-error");
    errorEl.textContent = "";
    if (!name) { errorEl.textContent = "이름을 입력해주세요."; return; }
    if (!/^\d{4}$/.test(pin)) { errorEl.textContent = "PIN은 숫자 4자리여야 해요."; return; }
    const result = await store.addMember(name, pin, addColorPicker.getColor());
    if (!result.ok) { errorEl.textContent = result.error; return; }
    e.target.reset();
  });
}

// ---------------------------------------------------------------------------
// 주차 관리 / 월 관리 (동일한 규칙, kind로만 구분)
// ---------------------------------------------------------------------------
function periodConfig(kind) {
  if (kind === "month") {
    return { unitLabel: "월", periods: months, idPrefix: "m", saveMethod: "saveMonth", deleteMethod: "deleteMonth" };
  }
  return { unitLabel: "주차", periods: weeks, idPrefix: "w", saveMethod: "saveWeek", deleteMethod: "deleteWeek" };
}

function nextPeriodNumber(periods) {
  return periods.reduce((max, p) => Math.max(max, p.n), 0) + 1;
}

function renderPeriodProgressTab(kind, main) {
  const cfg = periodConfig(kind);
  main.innerHTML = `
    <div class="section-card">
      <h2 class="section-title">${cfg.unitLabel}별 작성 현황</h2>
      <p class="section-sub">${cfg.unitLabel} 기간 안에 회고를 작성하면 표시돼요. 안 했으면 공란이에요.</p>
      <div class="progress-scroll">${renderPeriodProgressTable(kind)}</div>
    </div>
  `;
}

function renderPeriodProgressTable(kind) {
  const cfg = periodConfig(kind);
  const periods = cfg.periods;
  if (members.length === 0 || periods.length === 0) {
    return `<p class="empty-state">팀원과 ${cfg.unitLabel}를 먼저 등록해주세요.</p>`;
  }
  const header = `<tr><th>이름</th>${periods.map((p) => `<th>${esc(p.label)}</th>`).join("")}</tr>`;
  const rows = members
    .map((m) => {
      const cells = periods
        .map((p) => {
          const e = allEntries.get(`${cfg.idPrefix}${p.n}_${m.name}`);
          const done = !!(e && ((e.keep && e.keep.trim()) || (e.problem && e.problem.trim()) || (e.try && e.try.trim())));
          return `<td>${done ? '<span class="progress-dot"></span>' : ""}</td>`;
        })
        .join("");
      return `<tr><td>${esc(m.name)}</td>${cells}</tr>`;
    })
    .join("");
  return `<table>${header}${rows}</table>`;
}

function renderPeriodTab(kind, main) {
  clearAllPanels();
  const cfg = periodConfig(kind);
  const periods = cfg.periods;
  const nextN = nextPeriodNumber(periods);
  main.innerHTML = `
    <div class="section-card">
      <div class="section-head-row">
        <div>
          <h2 class="section-title">${cfg.unitLabel}별 날짜</h2>
          <p class="section-sub">각 ${cfg.unitLabel}의 이름과 시작/종료일을 자유롭게 바꿀 수 있어요. 입력 후 다른 곳을 클릭하면 자동 저장돼요.</p>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>${cfg.unitLabel}</th><th>이름</th><th>시작일</th><th>종료일</th><th></th></tr></thead>
        <tbody id="period-rows"></tbody>
      </table>
      ${periods.length === 0 ? `<p class="empty-state">아직 등록된 ${cfg.unitLabel}가 없어요. 아래에서 추가해보세요.</p>` : ""}
      <form class="inline-form" id="add-period-form" novalidate>
        <div class="field">
          <label class="field-label" for="add-period-n">${cfg.unitLabel} 번호</label>
          <input type="text" id="add-period-n" inputmode="numeric" style="width:70px" placeholder="${nextN}" />
        </div>
        <div class="field">
          <label class="field-label" for="add-period-label">이름</label>
          <input type="text" id="add-period-label" placeholder="${nextN}${cfg.unitLabel}" style="width:110px" />
        </div>
        <div class="field">
          <label class="field-label">시작일</label>
          <div id="add-period-start-slot"></div>
        </div>
        <div class="field">
          <label class="field-label">종료일</label>
          <div id="add-period-end-slot"></div>
        </div>
        <button type="submit" class="btn btn-accent">추가</button>
        <span class="form-error" id="add-period-error"></span>
      </form>
    </div>
  `;

  const rows = document.getElementById("period-rows");
  periods.forEach((p) => {
    const tr = document.createElement("tr");
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = p.label;
    labelInput.addEventListener("blur", async () => {
      const val = labelInput.value.trim();
      if (!val) { labelInput.value = p.label; return; }
      if (val === p.label) return;
      await store[cfg.saveMethod]({ id: p.id, n: p.n, label: val, start: p.start, end: p.end });
    });

    const startPicker = createDatePicker(p.start, async (val) => {
      if (!val || val === p.start) return;
      await store[cfg.saveMethod]({ id: p.id, n: p.n, label: labelInput.value.trim() || p.label, start: val, end: p.end });
    });
    const endPicker = createDatePicker(p.end, async (val) => {
      if (!val || val === p.end) return;
      await store[cfg.saveMethod]({ id: p.id, n: p.n, label: labelInput.value.trim() || p.label, start: p.start, end: val });
    });

    const tdN = document.createElement("td");
    tdN.textContent = p.n;
    const tdLabel = document.createElement("td");
    tdLabel.appendChild(labelInput);
    const tdStart = document.createElement("td");
    tdStart.appendChild(startPicker.el);
    const tdEnd = document.createElement("td");
    tdEnd.appendChild(endPicker.el);
    const tdActions = document.createElement("td");

    const delBtn = document.createElement("button");
    delBtn.className = "text-btn text-btn-danger text-btn-sm";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", async () => {
      const ok = await showConfirm(`${p.label}를 삭제할까요? 이미 작성된 회고 내용은 그대로 남아요.`, { danger: true });
      if (ok) {
        await store[cfg.deleteMethod](p.id);
      }
    });
    tdActions.appendChild(delBtn);

    tr.append(tdN, tdLabel, tdStart, tdEnd, tdActions);
    rows.appendChild(tr);
  });

  const addStartPicker = createDatePicker(null, () => {});
  const addEndPicker = createDatePicker(null, () => {});
  document.getElementById("add-period-start-slot").appendChild(addStartPicker.el);
  document.getElementById("add-period-end-slot").appendChild(addEndPicker.el);

  document.getElementById("add-period-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("add-period-error");
    errorEl.textContent = "";
    const nRaw = document.getElementById("add-period-n").value.trim();
    const n = nRaw ? Number(nRaw) : nextN;
    const label = document.getElementById("add-period-label").value.trim() || `${n}${cfg.unitLabel}`;
    const start = addStartPicker.getValue();
    const end = addEndPicker.getValue();
    if (!Number.isFinite(n) || n <= 0) { errorEl.textContent = `${cfg.unitLabel} 번호를 확인해주세요.`; return; }
    if (!start || !end) { errorEl.textContent = "시작일/종료일을 선택해주세요."; return; }
    if (periods.some((p) => p.n === n)) { errorEl.textContent = `이미 있는 ${cfg.unitLabel} 번호예요.`; return; }
    await store[cfg.saveMethod]({ id: String(n), n, label, start, end });
    e.target.reset();
  });
}
