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

    const fileName = "kiotviet_update_tngon.xlsx";
    const file = new File([blob], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Nếu đang chạy trên GitHub (https) → dùng popup + form giống in tem
    if (location.protocol === "https:") {
      this.updateStatus("Đang mở tab upload KiotViet (qua Python)...");

      // Mở tab TRƯỚC để tránh bị chặn popup
      const popup = window.open("", "_blank");
      if (!popup) {
        alert(
          "Trình duyệt đang CHẶN cửa sổ upload KiotViet.\n" +
            "Hãy cho phép pop-up cho trang này (giống như nút in tem) rồi bấm lại."
        );
        return false;
      }

      // Tạm ghi nội dung chờ trong tab
      popup.document.write(
        "<html><head><meta charset='utf-8'></head><body>" +
          "<p>Đang chuẩn bị file upload lên KiotViet, vui lòng chờ...</p>" +
          "</body></html>"
      );
      popup.document.close();

      // Đọc blob → base64
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            // reader.result dạng: "data:...;base64,AAAA..."
            const result = reader.result || "";
            const commaIndex = result.indexOf(",");
            if (commaIndex === -1) return resolve(result);
            const pureB64 = result.slice(commaIndex + 1);
            resolve(pureB64);
          } catch (e) {
            reject(e);
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      // Ghi lại nội dung thật: form gửi sang Python server rồi auto submit
      popup.document.open();
      popup.document.write(`
        <html>
        <head><meta charset="utf-8" /></head>
        <body>
          <form id="kvForm" method="POST" action="${this.KIOT_SYNC_ENDPOINT}" enctype="multipart/form-data">
            <input type="hidden" name="xlsx_base64" value="${b64}">
          </form>
          <p>Đang gửi file lên KiotViet qua server nội bộ...</p>
          <script>
            document.getElementById('kvForm').submit();
          </script>
        </body>
        </html>
      `);
      popup.document.close();

      this.updateStatus(
        "Đã mở tab upload KiotViet. Server Python sẽ nhận file, upload và tự đóng tab."
      );
      // Ở mode này mình không đọc JSON trả về được, nên coi như 'đã gửi lệnh'.
      return true;
    }

    // ==============================
    // Bản chạy nội bộ (http) → dùng fetch như cũ
    // ==============================
    const formData = new FormData();

    // GỬI CẢ HAI FIELD → tránh lỗi filedata
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
        this.updateStatus(`Lỗi gửi KiotViet: HTTP ${resp.status} - ${text}`);
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
