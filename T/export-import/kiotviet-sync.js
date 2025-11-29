// export-import/kiotviet-sync.js

class KiotVietSync {
  constructor() {
    this.KIOT_SYNC_ENDPOINT = "http://192.168.1.24:6002/kiotviet-import-form";

    this.btnSyncKiotviet = document.getElementById("btnSyncKiotviet");
    this.btnSyncKiotvietAll = document.getElementById("btnSyncKiotvietAll");
    this.syncKiotvietStatus = document.getElementById("syncKiotvietStatus");

    this.bindEvents();
  }

  bindEvents() {
    if (this.btnSyncKiotviet) {
      this.btnSyncKiotviet.addEventListener("click", () =>
        this.syncToKiotViet()
      );
    }
    if (this.btnSyncKiotvietAll) {
      this.btnSyncKiotvietAll.addEventListener("click", () =>
        this.syncAllToKiotViet()
      );
    }
  }

  updateStatus(msg) {
    console.log("[KiotVietSync]", msg);
    if (this.syncKiotvietStatus) {
      this.syncKiotvietStatus.textContent = msg;
    }
  }

  parseDateSafe(str) {
    if (!str) return null;
    if (typeof str !== "string") return null;
    const trimmed = str.trim();
    if (!trimmed) return null;
    if (!isNaN(Number(trimmed))) return null;
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  getItemsNeedKiotSync() {
    if (!window.dataManager || !Array.isArray(window.dataManager.items))
      return [];
    const items = window.dataManager.items;
    const result = [];

    for (const item of items) {
      const updated = item["Thời gian cập nhật"] || item["updated_at"] || "";
      const kiotSynced =
        item["Thời gian cập nhật KiotViet"] || item["kiot_synced_at"] || "";

      const dUpdated = this.parseDateSafe(updated);
      const dSynced = this.parseDateSafe(kiotSynced);

      const barcode = (item.barcode || "").trim();
      const name = (item.name || "").trim();
      if (!barcode && !name) continue;

      if (dUpdated && !dSynced) {
        result.push(item);
        continue;
      }

      if (dUpdated && dSynced && dUpdated > dSynced) {
        result.push(item);
      }
    }

    return result;
  }

  getAllItemsForKiotSync() {
    if (!window.dataManager || !Array.isArray(window.dataManager.items))
      return [];
    return window.dataManager.items.filter((item) => {
      const barcode = (item.barcode || "").trim();
      const name = (item.name || "").trim();
      return barcode || name;
    });
  }

  markKiotSynced(itemsSent) {
    if (!Array.isArray(itemsSent) || itemsSent.length === 0) return;

    const now =
      (window.dataManager &&
        typeof window.dataManager.nowString === "function" &&
        window.dataManager.nowString()) ||
      new Date().toISOString();

    itemsSent.forEach((item) => {
      item["Thời gian cập nhật KiotViet"] = now;
      item["kiot_synced_at"] = now;
    });

    if (
      window.dataManager &&
      typeof window.dataManager.saveToLocalStorage === "function"
    ) {
      window.dataManager.saveToLocalStorage();
    }

    this.updateStatus(
      `Đã đánh dấu ${itemsSent.length} SP đã gửi KiotViet lúc ${now}.`
    );
  }

  buildKiotvietXlsxBlob(items) {
    if (!Array.isArray(items)) items = [];

    const headers = [
      "Loại hàng",
      "Loại thực đơn",
      "Nhóm hàng(3 Cấp)",
      "Mã hàng",
      "Tên hàng hóa",
      "Giá vốn",
      "Giá bán",
      "Tồn kho",
      "Hình ảnh (url1,url2...)",
    ];

    const rows = [headers];

    items.forEach((item) => {
      const barcode = (item.barcode || "").trim();
      const name = (item.name || "").trim();
      const price = Number(item.price || 0);
      const tonKho = Number(item.stock || item.qty || 0);
      const category = (item.category || "").trim();
      const img = (item.image || "").trim();

      const row = [];
      row.push("Hàng hóa thường"); // Loại hàng
      row.push(""); // Loại thực đơn
      row.push(category); // Nhóm hàng(3 Cấp)
      row.push(barcode); // Mã hàng
      row.push(name || barcode); // Tên hàng hóa
      row.push(""); // Giá vốn
      row.push(price); // Giá bán
      row.push(tonKho); // Tồn kho
      row.push(img); // Hình ảnh

      rows.push(row);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "KiotViet");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    return blob;
  }

  async sendKiotXlsxToPython(items) {
    const blob = this.buildKiotvietXlsxBlob(items);

    // =========================
    // 1) ĐANG CHẠY TRÊN GITHUB (https) → DÙNG POPUP + BASE64
    // =========================
    if (window.location.protocol === "https:") {
      try {
        // Blob → base64
        const arrayBuffer = await blob.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(arrayBuffer);
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        const popup = window.open("", "_blank");
        if (!popup) {
          alert(
            "Trình duyệt đang chặn popup.\nSếp cho phép popup cho trang Kiểm kho rồi bấm lại nhé."
          );
          return false;
        }

        // Tạo 1 trang HTML tạm, tự submit form POST sang Python server
        popup.document.write(`
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>KiotViet Sync</title>
  </head>
  <body>
    <p>Đang gửi file KiotViet sang Python server...</p>
    <form id="f" method="POST" enctype="multipart/form-data" action="${this.KIOT_SYNC_ENDPOINT}">
      <input type="hidden" name="source" value="kiemkho" />
      <input type="hidden" name="xlsx_base64" value="${base64}" />
    </form>
    <script>
      document.getElementById('f').submit();
      setTimeout(function () { window.close(); }, 4000);
    <\/script>
  </body>
</html>`);
        popup.document.close();

        this.updateStatus(
          "Đã mở tab gửi file KiotViet qua Python server (base64)."
        );
        // Ở mode này mình không đọc JSON trả về được, nên coi như 'đã gửi lệnh'.
        return true;
      } catch (err) {
        console.error(err);
        this.updateStatus("Lỗi chuẩn bị file base64 để gửi KiotViet.");
        alert("Lỗi chuẩn bị file base64 để gửi KiotViet.");
        return false;
      }
    }

    // =========================
    // 2) CHẠY HTTP / FILE: CÙNG MÁY VỚI PYTHON → DÙNG FETCH NHƯ CŨ
    // =========================
    const fileName = "kiotviet_update_tngon.xlsx";
    const file = new File([blob], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const formData = new FormData();
    // GỬI CẢ HAI FIELD → KHÔNG BAO GIỜ LỖI FILEDATA NỮA
    formData.append("filedata", file);
    formData.append("file", file);
    formData.append("source", "kiemkho");

    this.updateStatus("Đang gửi file lên Python (KiotViet)...");

    try {
      const resp = await fetch(this.KIOT_SYNC_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        this.updateStatus(
          `Lỗi gửi KiotViet: HTTP ${resp.status} - ${text}`
        );
        alert(`Gửi KiotViet thất bại: HTTP ${resp.status}`);
        return false;
      }

      let resultText = "";
      try {
        const json = await resp.json();
        resultText =
          json && json.message ? json.message : JSON.stringify(json);
      } catch (e) {
        resultText = await resp.text();
      }

      this.updateStatus(
        `Đã gửi file lên Python (KiotViet) OK: ${resultText}`
      );
      alert(
        "Đã gửi file lên KiotViet (qua Python) thành công.\nVào trình duyệt KiotViet để kiểm tra lại."
      );
      return true;
    } catch (err) {
      console.error(err);
      this.updateStatus(
        "Lỗi kết nối Python server (KiotViet). Kiểm tra lại máy chủ."
      );
      alert("Không kết nối được Python server (KiotViet).");
      return false;
    }
  }

  async syncToKiotViet() {
    const itemsToSync = this.getItemsNeedKiotSync();
    if (itemsToSync.length === 0) {
      alert("Không có sản phẩm mới hoặc mới sửa cần gửi KiotViet.");
      this.updateStatus("Không có sản phẩm cần sync KiotViet.");
      return;
    }

    const ok = confirm(
      `Sẽ gửi ${itemsToSync.length} sản phẩm MỚI / MỚI SỬA lên KiotViet.\nTiếp tục?`
    );
    if (!ok) return;

    const success = await this.sendKiotXlsxToPython(itemsToSync);
    if (success) {
      this.markKiotSynced(itemsToSync);
    } else {
      this.updateStatus("Gửi KiotViet thất bại, KHÔNG đánh dấu đã sync.");
    }
  }

  async syncAllToKiotViet() {
    const itemsToSync = this.getAllItemsForKiotSync();
    if (itemsToSync.length === 0) {
      alert("Không có sản phẩm nào đủ điều kiện để gửi KiotViet.");
      this.updateStatus("Không có sản phẩm đủ điều kiện.");
      return;
    }

    const ok = confirm(
      `Sẽ gửi TOÀN BỘ ${itemsToSync.length} sản phẩm (đủ điều kiện) lên KiotViet.\nTiếp tục?`
    );
    if (!ok) return;

    const success = await this.sendKiotXlsxToPython(itemsToSync);
    if (success) {
      this.markKiotSynced(itemsToSync);
    } else {
      this.updateStatus("Gửi KiotViet thất bại, KHÔNG đánh dấu đã sync.");
    }
  }
}

(function () {
  try {
    window.kiotVietSync = new KiotVietSync();
    console.log("[KiotVietSync] Đã khởi tạo.");
  } catch (e) {
    console.error("[KiotVietSync] Lỗi khi khởi tạo:", e);
  }
})();
