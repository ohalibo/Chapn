// 브라우저 기본 alert()/confirm()는 톤앤매너를 맞출 수 없어서,
// 같은 디자인 시스템을 쓰는 커스텀 모달로 대체합니다.

function buildOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = "modal-box";
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return { overlay, box };
}

export function showAlert(message, { confirmLabel = "확인" } = {}) {
  return new Promise((resolve) => {
    const { overlay, box } = buildOverlay();
    const p = document.createElement("p");
    p.className = "modal-message";
    p.textContent = message;
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-accent btn-sm";
    okBtn.textContent = confirmLabel;
    function close() {
      overlay.remove();
      resolve();
    }
    okBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    actions.appendChild(okBtn);
    box.append(p, actions);
    okBtn.focus();
  });
}

export function showConfirm(message, { confirmLabel = "확인", cancelLabel = "취소", danger = false } = {}) {
  return new Promise((resolve) => {
    const { overlay, box } = buildOverlay();
    const p = document.createElement("p");
    p.className = "modal-message";
    p.textContent = message;
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "text-btn";
    cancelBtn.textContent = cancelLabel;
    const okBtn = document.createElement("button");
    okBtn.className = "btn btn-sm";
    if (danger) okBtn.classList.add("btn-danger-solid");
    else okBtn.classList.add("btn-accent");
    okBtn.textContent = confirmLabel;
    function close(result) {
      overlay.remove();
      resolve(result);
    }
    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    actions.append(cancelBtn, okBtn);
    box.append(p, actions);
    okBtn.focus();
  });
}
