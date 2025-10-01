// blackout.js
// ===== Firebase config =====
const firebaseConfig = {
  apiKey: "AIzaSyB4u2G41xdGkgBC0KltleRpcg5Lwru2RIU",
  authDomain: "tngon-b37d6.firebaseapp.com",
  databaseURL: "https://tngon-b37d6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tngon-b37d6",
  storageBucket: "tngon-b37d6.firebasestorage.app",
  messagingSenderId: "580319242104",
  appId: "1:580319242104:web:6922e4327bdc8286c30a8d"
};

// ===== Init Firebase =====
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const overlay = document.getElementById("screen-overlay");
function setOverlay(show) {
  overlay.style.display = show ? "block" : "none";
  // Nếu có NoSleepControl thì sync tạm (optional)
  if (show && window.NoSleepControl?.pause) window.NoSleepControl.pause();
  if (!show && window.NoSleepControl?.start) window.NoSleepControl.start();
}

let globalState = "on";
let localState  = "on";

// Reset về màn hình BẮT ĐẦU (giữ nguyên tableId)
function resetToStart() {
  const posContainer = document.getElementById("pos-container");
  const posFrame     = document.getElementById("pos-frame");
  const startScreen  = document.getElementById("start-screen");
  const selectedTable= document.getElementById("selected-table");
  const startBtn     = document.getElementById("start-order");

  const tableId  = localStorage.getItem("tableId");
  const tableUrl = localStorage.getItem("tableUrl");

  // UI
  posContainer.classList.add("hidden");
  posFrame.src = "about:blank";
  startScreen.classList.remove("hidden");

  // Giữ nguyên bàn đang chọn
  if (tableId && tableUrl) {
    selectedTable.textContent = tableId;
    startBtn.setAttribute("data-url", tableUrl);
    localStorage.setItem("appState", "start");
  }
}

// ============ Firebase login + listeners ============
firebase.auth().signInAnonymously()
  .then(() => {
    const db = firebase.database();

    // ----- Global ON/OFF -----
    const refGlobal = db.ref("control/screen");
    refGlobal.on("value", (snap) => {
      globalState = (snap.val() || "on").toLowerCase();
      updateOverlay();
    });

    function updateOverlay() {
      if (globalState === "off" || localState === "off") setOverlay(true);
      else setOverlay(false);
    }

    // ----- Per-table listeners (bind theo tableId) -----
    let boundTableId = null;
    let refLocalScreen = null;
    let refSignal = null;

    function unbindPerTable() {
      try { refLocalScreen && refLocalScreen.off(); } catch(_) {}
      try { refSignal && refSignal.off(); } catch(_) {}
      refLocalScreen = null;
      refSignal = null;
      boundTableId = null;
      localState = "on";
      updateOverlay();
    }

    function bindPerTable(tableId) {
      const id = String(tableId || "").trim();
      if (!id) return;
      if (boundTableId === id) return; // đã bind rồi

      unbindPerTable();
      boundTableId = id;

      // Điều khiển riêng từng bàn
      refLocalScreen = db.ref(`control/tables/${id}/screen`);
      refLocalScreen.on("value", (snap) => {
        localState = (snap.val() || "on").toLowerCase();
        updateOverlay();
      });

      // Tín hiệu làm mới / hết hạn
      refSignal = db.ref(`signals/${id}`);
      refSignal.on("value", (snap) => {
        if (!snap.exists()) return;
        const val = snap.val();
        if (val && String(val.status).toLowerCase() === "expired") {
          resetToStart();
          // Xoá signal để tránh lặp
          refSignal.remove().catch(()=>{});
        }
      });
    }

    // Lúc khởi động, nếu đã có sẵn tableId trong localStorage -> bind ngay
    const firstTable = window.tableId || localStorage.getItem("tableId");
    if (firstTable) bindPerTable(firstTable);

    // Nghe sự kiện chọn bàn (do redirect-core/state bắn ra)
    window.addEventListener("table-selected", (e) => {
      const id = e?.detail?.tableId;
      if (id) bindPerTable(id);
    });
  })
  .catch(() => {
    // Nếu login lỗi, đừng chặn màn hình
    setOverlay(false);
  });