// =====================================================
//  CAMERA + HID BARCODE SCANNER - T-NGON (FIX PRO)
//  - Không mất ký tự đầu / không bị cắt khúc
//  - Không làm bẩn ô danh mục/tags khi scan
//  - Luôn trigger search sau khi scan xong (kể cả đang focus barcodeInput)
//  - Có chế độ ✏️ Sửa mã (đổi barcode cho cùng sản phẩm)
// =====================================================

class CameraScanner {
  constructor() {
    // --- DOM ---
    this.cameraPreview   = document.getElementById("cameraPreview");
    this.cameraBtn       = document.getElementById("cameraBtn");
    this.stopCameraBtn   = document.getElementById("stopCameraBtn");
    this.barcodeInput    = document.getElementById("barcodeInput");
    this.editModeBtn     = document.getElementById("editBarcodeModeBtn");

    // --- Camera ---
    this.cameraStream = null;
    this.barcodeDetector = null;

    // --- HID buffer ---
    this.scanBuffer = "";
    this.scanning = false;
    this.lastTime = 0;
    this.timer = null;

    // Nhận diện scanner (nhanh) vs gõ tay (chậm)
    this.CHAR_GAP_MS   = 45;   // nếu ký tự đến nhanh hơn mức này => rất giống scanner
    this.NEW_SCAN_GAP  = 160;  // nếu im lâu hơn => coi như bắt đầu lượt mới
    this.END_TIMEOUT   = 90;   // im 90ms => kết thúc scan (scanner đôi khi không gửi Enter)
    this.MIN_LEN       = 4;    // mã quá ngắn bỏ qua

    // --- Edit barcode mode ---
    this.editMode = false;
    this.editOldBarcode = "";

    this.initBarcodeDetector();
    this.bindEvents();
  }

  // -----------------------------
  // 1) BarcodeDetector (camera)
  // -----------------------------
  initBarcodeDetector() {
    if ("BarcodeDetector" in window) {
      try {
        this.barcodeDetector = new BarcodeDetector({
          formats: ["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"]
        });
      } catch (e) {
        console.warn("BarcodeDetector init error", e);
        this.barcodeDetector = null;
      }
    }
  }

  // -----------------------------
  // 2) Bind events
  // -----------------------------
  bindEvents() {
    if (this.cameraBtn) this.cameraBtn.addEventListener("click", () => this.toggleCamera());
    if (this.stopCameraBtn) this.stopCameraBtn.addEventListener("click", () => this.stopCamera());

    // HID: capture để tránh số/chữ rơi vào input khác trước khi mình bắt
    document.addEventListener("keydown", (e) => this.onHIDKey(e), true);

    // ✏️ Sửa mã
    if (this.editModeBtn) {
      this.editModeBtn.addEventListener("click", () => this.toggleEditMode());
    }
  }

  // -----------------------------
  // 3) Camera scan
  // -----------------------------
  async toggleCamera() {
    if (this.cameraStream) return this.stopCamera();

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      if (this.cameraPreview) {
        this.cameraPreview.srcObject = this.cameraStream;
        this.cameraPreview.style.display = "block";
      }
      if (this.stopCameraBtn) this.stopCameraBtn.style.display = "inline-block";
      this.scanCameraLoop();
    } catch (e) {
      alert("Không mở được camera");
    }
  }

  stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
    }
    this.cameraStream = null;

    if (this.cameraPreview) this.cameraPreview.style.display = "none";
    if (this.stopCameraBtn) this.stopCameraBtn.style.display = "none";
  }

  async scanCameraLoop() {
    if (!this.cameraStream || !this.barcodeDetector || !this.cameraPreview) return;

    try {
      const found = await this.barcodeDetector.detect(this.cameraPreview);
      if (found && found.length > 0) {
        const code = String(found[0].rawValue || "").trim();
        this.handleCompleteBarcode(code, { source: "camera" });
        this.stopCamera();
        return;
      }
    } catch (e) {
      // im lặng cho mượt
    }

    requestAnimationFrame(() => this.scanCameraLoop());
  }

  // -----------------------------
  // 4) HID key handling (scanner)
  // -----------------------------
  onHIDKey(e) {
    // bỏ qua tổ hợp phím
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const now = performance.now();
    const delta = now - (this.lastTime || 0);
    this.lastTime = now;

    const isEnter = (e.key === "Enter");
    const isPrintable = (e.key && e.key.length === 1);

    // Nếu không phải enter/printable thì bỏ qua
    if (!isEnter && !isPrintable) return;

    // Heuristic: scanner gửi rất nhanh (delta nhỏ)
    const looksLikeScannerChar = isPrintable && (delta <= this.CHAR_GAP_MS);

    // Nếu đang scan, hoặc ký tự đến quá nhanh => mình chặn để không rơi vào input khác
    const shouldBlock = this.scanning || looksLikeScannerChar || isEnter;

    if (shouldBlock) e.preventDefault();

    // ENTER kết thúc luôn
    if (isEnter) {
      const code = this.scanBuffer.trim();
      this.resetHID();
      if (code.length >= this.MIN_LEN) this.handleCompleteBarcode(code, { source: "hid-enter" });
      return;
    }

    // printable char
    // nếu im lâu -> bắt đầu scan mới
    if (!this.scanning || delta > this.NEW_SCAN_GAP) {
      this.scanning = true;
      this.scanBuffer = e.key; // giữ ký tự đầu
    } else {
      this.scanBuffer += e.key;
    }

    // timeout kết thúc (phòng trường hợp scanner không gửi Enter)
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const code = this.scanBuffer.trim();
      this.resetHID();
      if (code.length >= this.MIN_LEN) this.handleCompleteBarcode(code, { source: "hid-timeout" });
    }, this.END_TIMEOUT);
  }

  resetHID() {
    this.scanning = false;
    this.scanBuffer = "";
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // -----------------------------
  // 5) Edit mode (đổi barcode)
  // -----------------------------
  toggleEditMode() {
    this.editMode = !this.editMode;

    if (this.editMode) {
      this.editOldBarcode = (this.barcodeInput?.value || "").trim();
      if (!this.editOldBarcode) {
        alert("Chưa có mã cũ trong form. Hãy chọn/scan đúng sản phẩm trước rồi mới bấm ✏️ Sửa mã.");
        this.editMode = false;
        return;
      }
      this.setEditBtnUI(true);
      // gợi ý thao tác
      try { navigator.vibrate?.(60); } catch {}
      alert("CHẾ ĐỘ SỬA MÃ: Bây giờ sếp hãy QUÉT MÃ MỚI.\nApp sẽ đổi barcode cho đúng sản phẩm đang mở.");
    } else {
      this.editOldBarcode = "";
      this.setEditBtnUI(false);
    }
  }

  setEditBtnUI(on) {
    if (!this.editModeBtn) return;
    this.editModeBtn.classList.toggle("active", !!on);
    this.editModeBtn.textContent = on ? "✏️ Đang sửa mã..." : "✏️ Sửa mã";
  }

  replaceBarcode(oldCode, newCode) {
    oldCode = String(oldCode || "").trim();
    newCode = String(newCode || "").trim();
    if (!oldCode || !newCode) return false;
    if (oldCode === newCode) return true;

    if (!window.dataManager || !Array.isArray(dataManager.items)) {
      alert("Thiếu dataManager.");
      return false;
    }

    const oldIdx = dataManager.items.findIndex(i => (i.barcode || "").trim() === oldCode);
    if (oldIdx < 0) {
      alert("Không tìm thấy sản phẩm theo MÃ CŨ trong dữ liệu: " + oldCode);
      return false;
    }

    const existsNew = dataManager.items.findIndex(i => (i.barcode || "").trim() === newCode);
    if (existsNew >= 0) {
      alert("MÃ MỚI đã tồn tại trong dữ liệu: " + newCode + "\nKhông đổi để tránh đè lên sản phẩm khác.");
      return false;
    }

    const item = { ...dataManager.items[oldIdx] };
    item.barcode = newCode;
    item.updated_at = (window.dataManager?.nowString?.() || new Date().toISOString());

    // xóa mã cũ, thêm mã mới
    dataManager.deleteItem(oldCode);
    const updated = dataManager.upsertItem(item);

    // cập nhật UI
    if (window.tableRenderer) window.tableRenderer.render();
    if (window.categoryManager) window.categoryManager.rebuildLists?.();

    if (window.formHandler) window.formHandler.loadItemToForm(updated);
    if (this.barcodeInput) {
      this.barcodeInput.focus();
      this.barcodeInput.select();
    }
    return true;
  }

  // -----------------------------
  // 6) Main handler for completed barcode
  // -----------------------------
  handleCompleteBarcode(code, meta = {}) {
    code = String(code || "").trim();
    if (!code) return;

    // INLINE EDIT: chỉ ghi vào ô barcode trong bảng (nếu đang bật)
    if (this.isInlineEdit()) {
      const active = document.activeElement;
      if (this.isInlineBarcodeCell(active)) {
        active.value = code;
        active.dispatchEvent(new Event("input", { bubbles: true }));
        active.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    // ✏️ EDIT MODE: quét mã mới để đổi barcode
    if (this.editMode) {
      const ok = this.replaceBarcode(this.editOldBarcode, code);
      // thoát edit mode sau 1 lần scan
      this.editMode = false;
      this.editOldBarcode = "";
      this.setEditBtnUI(false);

      if (ok) {
        try { navigator.vibrate?.(80); } catch {}
      }
      return;
    }

    // CHẾ ĐỘ BÌNH THƯỜNG
    // 1) Nếu form đang có dữ liệu -> auto-save trước khi chuyển mã mới
    const formEmpty = this.isFormEmpty();
    if (!formEmpty) {
      const result = this.tryAutoSave();
      if (!result.allowContinue) return; // user chọn “sửa tiếp”
    }

    // 2) Luôn set barcodeInput
    if (this.barcodeInput) {
      this.barcodeInput.focus();
      this.barcodeInput.value = code;
    }

    // 3) Luôn search để load xuống form / show list
    this.searchBarcode(code);
  }

  isFormEmpty() {
    const ids = ["barcodeInput","nameInput","imageInput","categoryInput","qtyInput","stockInput","priceInput","noteInput"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && String(el.value || "").trim() !== "") return false;
    }
    return true;
  }

  tryAutoSave() {
    if (!window.formHandler) return { allowContinue: true };
    if (!window.formHandler.formDirty) return { allowContinue: true };

    const data = formHandler.getFormData();
    const missing = formHandler.validateFormData(data);

    if (missing.length > 0) {
      const ask = formHandler.showScanMissingFieldsDialog(missing);
      if (ask.keepEditing) return { allowContinue: false };
      formHandler.resetForm();
      return { allowContinue: true };
    }

    const saved = formHandler.saveForm();
    if (saved && window.githubSync) {
      window.githubSync.pushCSV({ silent: true });
    }
    return { allowContinue: saved };
  }

  searchBarcode(code) {
    if (!window.searchHandler) return;
    try {
      searchHandler.handleBarcodeSearch(code);
    } catch (e) {
      console.error("search error", e);
    }

    // nếu searchHandler có xóa mất barcodeInput thì set lại
    if (this.barcodeInput && !this.barcodeInput.value.trim()) {
      this.barcodeInput.value = code;
    }
  }

  isInlineEdit() {
    return !!window.inlineEditModeOn || document.body.classList.contains("inline-edit-on");
  }

  isInlineBarcodeCell(el) {
    return !!(el && el.dataset && el.dataset.field === "barcode");
  }
}

// init
document.addEventListener("DOMContentLoaded", () => {
  window.cameraScanner = new CameraScanner();
});
