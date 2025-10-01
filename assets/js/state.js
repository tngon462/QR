// state.js

// 1) Phát hiện resume (sleep -> sáng lại) => reload với cờ session
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    sessionStorage.setItem("resumeReload", "1");
    location.reload();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const resumed = sessionStorage.getItem("resumeReload") === "1";
  sessionStorage.removeItem("resumeReload"); // dùng 1 lần

  const selectTable   = document.getElementById("select-table");
  const startScreen   = document.getElementById("start-screen");
  const posContainer  = document.getElementById("pos-container");
  const posFrame      = document.getElementById("pos-frame");
  const selectedTable = document.getElementById("selected-table");
  const startBtn      = document.getElementById("start-order");

  const tableId  = localStorage.getItem("tableId");
  const tableUrl = localStorage.getItem("tableUrl");
  const appState = localStorage.getItem("appState"); // "start" | "pos"

  if (resumed && tableId && tableUrl) {
    // ✅ Chỉ khôi phục khi resume (không khôi phục khi reload thủ công)
    window.tableId = String(tableId);

    // Cho blackout.js biết đã có bàn để nó bind Firebase listeners
    window.dispatchEvent(new CustomEvent("table-selected", {
      detail: { tableId: String(tableId) }
    }));

    if (appState === "start") {
      selectTable.classList.add("hidden");
      startScreen.classList.remove("hidden");
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";

      selectedTable.textContent = tableId;
      startBtn.setAttribute("data-url", tableUrl);
    } else if (appState === "pos") {
      selectTable.classList.add("hidden");
      startScreen.classList.add("hidden");
      posContainer.classList.remove("hidden");
      posFrame.src = tableUrl;
    } else {
      // fallback về chọn bàn
      selectTable.classList.remove("hidden");
      startScreen.classList.add("hidden");
      posContainer.classList.add("hidden");
      posFrame.src = "about:blank";
    }
  } else {
    // ❌ Reload/mở app thủ công → về màn CHỌN BÀN
    selectTable.classList.remove("hidden");
    startScreen.classList.add("hidden");
    posContainer.classList.add("hidden");
    posFrame.src = "about:blank";

    // Xoá trạng thái để không tự nhảy bàn lần sau
    localStorage.removeItem("tableId");
    localStorage.removeItem("tableUrl");
    localStorage.removeItem("appState");
    delete window.tableId;
  }
});