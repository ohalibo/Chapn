import { PHOTO_MAX_WIDTH, PHOTO_JPEG_QUALITY, MAX_PHOTO_BASE64_TOTAL } from "../config.js";
import { showAlert, showConfirm } from "./ui.js";

// 공지 빌더: 목록 | 편집기 | 실시간 미리보기 3단 구성.
// (포트폴리오 빌더의 "목록-편집-미리보기" 패턴을 참고했어요.)

export function mountBuilder(container, store) {
  let announcements = [];
  let months = [];
  let selectedId = null; // null = 아직 저장 안 한 새 글
  let draft = null; // { title, blocks: [...], month: number|null (null = 전체 공지) }
  let dirty = false;
  let initialized = false;

  renderShell();
  store.subscribeAnnouncements((list) => {
    announcements = list;
    if (!initialized) {
      initialized = true;
      selectPost(list[0]?.id ?? null);
    } else {
      renderList();
    }
  });
  store.subscribeMonths((list) => {
    months = list;
    // 편집 중인 글이 없을 때만 다시 그려서, 작성 중인 내용이 날아가지 않게 해요.
    if (document.getElementById("notice-month-select")) renderMonthOptions();
  });

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderMonthOptions() {
    const select = document.getElementById("notice-month-select");
    if (!select) return;
    if (months.length === 0) {
      select.innerHTML = '<option value="">등록된 월이 없어요</option>';
      return;
    }
    select.innerHTML =
      '<option value="">월 선택</option>' +
      months.map((m) => `<option value="${m.n}" ${draft.month === m.n ? "selected" : ""}>${esc(m.label)}</option>`).join("");
  }

  function formatDate(ts) {
    if (!ts) return "";
    const ms = typeof ts === "number" ? ts : ts.toMillis ? ts.toMillis() : Date.parse(ts);
    if (!ms) return "";
    const d = new Date(ms);
    return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function renderShell() {
    container.innerHTML = `
      <div class="builder">
        <aside class="pane pane-list">
          <div class="pane-head mono upper">
            <span>공지 목록</span>
            <div style="flex:1"></div>
            <button class="btn btn-accent btn-sm" id="new-post-btn">+ 새 공지</button>
          </div>
          <ul class="post-list" id="post-list"></ul>
        </aside>
        <section class="pane pane-editor pane-editor-full" id="pane-editor"></section>
      </div>
    `;
    document.getElementById("new-post-btn").addEventListener("click", () => selectPost(null));
  }

  function docIcon() {
    return `<svg viewBox="0 0 24 24" class="pl-icon" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 2h9l5 5v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" fill="#fbfbf9" stroke="#d8d6cd" stroke-width="1"/>
      <path d="M14 2v4a1 1 0 0 0 1 1h4L14 2Z" fill="#e7e5de"/>
      <rect x="7" y="12" width="8" height="1.6" rx="0.8" fill="#c1402a"/>
      <rect x="7" y="15.4" width="10" height="1.4" rx="0.7" fill="#d8d6cd"/>
      <rect x="7" y="18.4" width="6" height="1.4" rx="0.7" fill="#d8d6cd"/>
    </svg>`;
  }

  function renderList() {
    const listEl = document.getElementById("post-list");
    if (!listEl) return;
    if (announcements.length === 0) {
      listEl.innerHTML = '<p class="empty-state">아직 공지가 없어요.</p>';
      return;
    }
    listEl.innerHTML = announcements
      .map((a) => {
        const scopeLabel = a.month ? months.find((m) => m.n === a.month)?.label || `${a.month}월` : "전체";
        return `
      <li data-id="${a.id}" class="${selectedId === a.id ? "active" : ""}">
        ${docIcon()}
        <div class="pl-text">
          <div class="pl-title">${esc(a.title || "제목 없음")}</div>
          <div class="pl-meta">${formatDate(a.updatedAt)} · ${esc(scopeLabel)}</div>
        </div>
      </li>`;
      })
      .join("");
    listEl.querySelectorAll("li").forEach((li) => {
      li.addEventListener("click", () => selectPost(li.dataset.id));
    });
  }

  async function selectPost(id) {
    if (dirty) {
      const ok = await showConfirm("저장하지 않은 변경사항이 있어요. 이동할까요?");
      if (!ok) return;
    }
    selectedId = id;
    if (id === null) {
      draft = { title: "", blocks: [], month: null };
    } else {
      const a = announcements.find((x) => x.id === id);
      draft = { title: a?.title || "", blocks: (a?.blocks || []).map((b) => ({ ...b })), month: a?.month ?? null };
    }
    dirty = false;
    renderList();
    renderEditor();
  }

  function markDirty() {
    dirty = true;
    updateFooterStatus();
  }

  function renderEditor() {
    const pane = document.getElementById("pane-editor");
    const current = selectedId ? announcements.find((a) => a.id === selectedId) : null;
    pane.innerHTML = `
      <div class="pane-head">
        <span>편집</span>
        <div style="flex:1"></div>
        ${current ? `<span class="pl-meta">작성 ${formatDate(current.createdAt)}</span>` : ""}
      </div>
      <div class="editor-body">
        <div class="field">
          <label class="field-label">제목</label>
          <input type="text" id="post-title" placeholder="공지 제목" />
        </div>
        <div class="field">
          <label class="field-label">위치</label>
          <div class="scope-row">
            <label class="scope-option"><input type="radio" name="notice-scope" value="global" ${!draft.month ? "checked" : ""} /> 전체 공지</label>
            <label class="scope-option"><input type="radio" name="notice-scope" value="month" ${draft.month ? "checked" : ""} /> 월별 공지</label>
          </div>
          <select id="notice-month-select" ${draft.month ? "" : "disabled"}></select>
          <span class="form-error" id="notice-scope-error"></span>
        </div>
        <div class="field">
          <label class="field-label">내용 블록</label>
          <div class="block-list" id="block-list"></div>
          <div class="block-add-row" style="margin-top:10px;">
            <button class="text-btn" id="add-text-btn">+ 텍스트</button>
            <button class="text-btn" id="add-image-btn">+ 사진</button>
          </div>
        </div>
      </div>
      <div class="pane-head" style="border-top:1px solid var(--line); border-bottom:none; margin-top:auto; justify-content:space-between;">
        <span class="mono" id="footer-status" style="font-size:0.68rem; color:var(--ink-soft);"></span>
        <div style="display:flex; gap:8px;">
          ${selectedId ? '<button class="text-btn text-btn-danger" id="delete-post-btn">삭제</button>' : ""}
          <button class="btn btn-accent" id="save-post-btn">저장</button>
        </div>
      </div>
    `;
    pane.style.display = "flex";
    pane.style.flexDirection = "column";

    const titleInput = document.getElementById("post-title");
    titleInput.value = draft.title;
    titleInput.addEventListener("input", (e) => {
      draft.title = e.target.value;
      markDirty();
    });

    renderMonthOptions();
    pane.querySelectorAll('input[name="notice-scope"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        const monthSelect = document.getElementById("notice-month-select");
        document.getElementById("notice-scope-error").textContent = "";
        if (radio.value === "global" && radio.checked) {
          draft.month = null;
          monthSelect.disabled = true;
          monthSelect.value = "";
        } else if (radio.value === "month" && radio.checked) {
          monthSelect.disabled = false;
        }
        markDirty();
      });
    });
    document.getElementById("notice-month-select").addEventListener("change", (e) => {
      draft.month = e.target.value ? Number(e.target.value) : null;
      markDirty();
    });

    renderBlockList();

    document.getElementById("add-text-btn").addEventListener("click", () => {
      draft.blocks.push({ type: "text", content: "" });
      markDirty();
      renderBlockList();
    });
    document.getElementById("add-image-btn").addEventListener("click", () => {
      openImagePicker();
    });
    document.getElementById("save-post-btn").addEventListener("click", savePost);
    const delBtn = document.getElementById("delete-post-btn");
    if (delBtn) delBtn.addEventListener("click", deletePost);

    updateFooterStatus();
  }

  function updateFooterStatus() {
    const el = document.getElementById("footer-status");
    if (!el) return;
    el.textContent = dirty ? "저장 안 됨" : selectedId ? "저장됨" : "";
  }

  function renderBlockList() {
    const listEl = document.getElementById("block-list");
    if (!listEl) return;
    if (draft.blocks.length === 0) {
      listEl.innerHTML = '<p class="empty-state">텍스트나 사진 블록을 추가해보세요.</p>';
      return;
    }
    listEl.innerHTML = "";
    draft.blocks.forEach((block, idx) => {
      const item = document.createElement("div");
      item.className = "block-item";
      const head = document.createElement("div");
      head.className = "block-item-head";
      head.innerHTML = `<span class="tag">${block.type === "image" ? "사진" : "텍스트"}</span>`;
      const actions = document.createElement("div");
      actions.className = "block-item-actions";
      const upBtn = document.createElement("button");
      upBtn.className = "icon-btn";
      upBtn.textContent = "↑";
      upBtn.disabled = idx === 0;
      upBtn.addEventListener("click", () => moveBlock(idx, -1));
      const downBtn = document.createElement("button");
      downBtn.className = "icon-btn";
      downBtn.textContent = "↓";
      downBtn.disabled = idx === draft.blocks.length - 1;
      downBtn.addEventListener("click", () => moveBlock(idx, 1));
      const rmBtn = document.createElement("button");
      rmBtn.className = "icon-btn";
      rmBtn.textContent = "×";
      rmBtn.addEventListener("click", () => {
        draft.blocks.splice(idx, 1);
        markDirty();
        renderBlockList();
      });
      actions.append(upBtn, downBtn, rmBtn);
      head.appendChild(actions);
      item.appendChild(head);

      if (block.type === "text") {
        const textarea = document.createElement("textarea");
        textarea.value = block.content || "";
        textarea.placeholder = "공지 내용을 입력하세요";
        textarea.addEventListener("input", (e) => {
          block.content = e.target.value;
          markDirty();
        });
        item.appendChild(textarea);
      } else {
        const preview = document.createElement("div");
        preview.className = "block-image-preview";
        const img = document.createElement("img");
        img.src = block.src;
        preview.appendChild(img);
        item.appendChild(preview);
        const captionInput = document.createElement("input");
        captionInput.type = "text";
        captionInput.placeholder = "사진 설명 (선택)";
        captionInput.value = block.caption || "";
        captionInput.style.marginTop = "8px";
        captionInput.addEventListener("input", (e) => {
          block.caption = e.target.value;
          markDirty();
        });
        item.appendChild(captionInput);
      }
      listEl.appendChild(item);
    });
  }

  function moveBlock(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= draft.blocks.length) return;
    const [b] = draft.blocks.splice(idx, 1);
    draft.blocks.splice(target, 0, b);
    markDirty();
    renderBlockList();
  }

  function openImagePicker() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const currentTotal = draft.blocks
        .filter((b) => b.type === "image")
        .reduce((s, b) => s + (b.src?.length || 0), 0);
      try {
        const dataUrl = await compressImage(file);
        if (currentTotal + dataUrl.length > MAX_PHOTO_BASE64_TOTAL * 1.5) {
          await showAlert("사진 용량이 너무 커요. 기존 사진을 지우고 다시 시도해주세요.");
          return;
        }
        draft.blocks.push({ type: "image", src: dataUrl, caption: "" });
        markDirty();
        renderBlockList();
      } catch (err) {
        console.error(err);
        await showAlert("사진을 불러오지 못했어요.");
      }
    });
    fileInput.click();
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

  async function savePost() {
    const monthRadio = document.querySelector('input[name="notice-scope"][value="month"]');
    if (monthRadio && monthRadio.checked && !draft.month) {
      document.getElementById("notice-scope-error").textContent = "월을 선택해주세요.";
      return;
    }
    const btn = document.getElementById("save-post-btn");
    btn.disabled = true;
    btn.textContent = "저장 중...";
    try {
      const newId = await store.saveAnnouncement(selectedId, {
        title: draft.title,
        blocks: draft.blocks,
        month: draft.month,
      });
      selectedId = newId;
      dirty = false;
      renderEditor();
    } catch (err) {
      console.error(err);
      await showAlert("저장에 실패했어요.");
    } finally {
      btn.disabled = false;
      btn.textContent = "저장";
    }
  }

  async function deletePost() {
    if (!selectedId) return;
    const ok = await showConfirm("이 공지를 삭제할까요?", { danger: true });
    if (!ok) return;
    await store.deleteAnnouncement(selectedId);
    selectPost(null);
  }

}
