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
}

let globalState = "on";
let localState = "on";

function resetToStart() {
  document.getElementById("pos-container").classList.add("hidden");
  document.getElementById("pos-frame").src = "about:blank";
  document.getElementById("start-screen").classList.remove("hidden");
}

firebase.auth().signInAnonymously()
  .then(() => {
    const db = firebase.database();

    // Toàn quán
    db.ref("control/screen").on("value", snap => {
      globalState = (snap.val() || "on").toLowerCase();
      updateOverlay();
    });

    function updateOverlay() {
      if (globalState === "off" || localState === "off") {
        setOverlay(true);
      } else {
        setOverlay(false);
      }
    }

    // Nghe riêng từng bàn
    function listenPerTable(tableId) {
      db.ref(`control/tables/${tableId}/screen`).on("value", snap => {
        localState = (snap.val() || "on").toLowerCase();
        updateOverlay();
      });

      db.ref(`signals/${tableId}`).on("value", snap => {
        if (!snap.exists()) return;
        const val = snap.val();
        if (val.status === "expired") {
          resetToStart();
        }
      });
    }

    // Theo dõi khi chọn bàn
    const observer = new MutationObserver(() => {
      const tableSpan = document.getElementById("selected-table");
      if (tableSpan && tableSpan.textContent) {
        const tableId = tableSpan.textContent.trim();
        if (tableId) {
          listenPerTable(tableId);
          observer.disconnect();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  })
  .catch(() => {
    // Nếu đăng nhập ẩn danh lỗi → overlay luôn off để không chặn người dùng
    setOverlay(false);
  }); 