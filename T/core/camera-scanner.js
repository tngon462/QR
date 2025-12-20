// =====================================================
//  CAMERA + HID BARCODE SCANNER - V3 FULL TỐI ƯU
//  - Không mất số đầu
//  - Không làm bẩn ô danh mục/tags
//  - Hỗ trợ INLINE EDIT + AUTO-SAVE
// =====================================================

class CameraScanner {
  constructor() {
    // --- DOM chính ---
    this.cameraPreview = document.getElementById("cameraPreview");
    this.cameraBtn = document.getElementById("cameraBtn");
    this.stopCameraBtn = document.getElementById("stopCameraBtn");
    this.barcodeInput = document.getElementById("barcodeInput");

    // --- HID scanner buffer ---
    this.scanBuffer = "";
    this.scanning = false;
    this.lastTime = 0;
    this.timer = null;

    // Cấu hình HID
    this.HID_MIN_LENGTH = 6;    // Mã ngắn hơn coi như không phải barcode
    this.HID_SCAN_GAP = 120;    // ms: nếu > giá trị này → bắt đầu lần quét mới
    this.HID_TIMEOUT = 80;      // ms: im quá lâu → kết thúc

    // --- Camera ---
    this.cameraStream = null;
    this.barcodeDetector = null;

    this.initBarcodeDetector();
    this.bindEvents();
  }

  // -----------------------------------------------------
  //  1) KHỞI TẠO BARCODE DETECTOR
  // -----------------------------------------------------
  initBarcodeDetector() {
    if ("BarcodeDetector" in window) {
      try {
        this.barcodeDetector = new BarcodeDetector({
          formats: [
            "ean_13",
            "ean_8",
            "code_128",
            "code_39",
            "upc_a",
            "upc_e",
            "qr_code",
          ],
        });
      } catch (e) {
        console.warn("BarcodeDetector init error", e);
        this.barcodeDetector = null;
      }
    }
  }

  // -----------------------------------------------------
  //  2) GẮN SỰ KIỆN
  // -----------------------------------------------------
  bindEvents() {
    if (this.cameraBtn)
      this.cameraBtn.addEventListener("click", () => this.toggleCamera());
    if (this.stopCameraBtn)
      this.stopCameraBtn.addEventListener("click", () => this.stopCamera());

    // Lắng nghe HID scanner
    document.addEventListener("keydown", (e) => this.onHIDKey(e), true);
    // dùng capture (true) để chặn số không rơi vào input khác
  }

  // -----------------------------------------------------
  //  3) CAMERA QUÉT → xử lý giống HID
  // -----------------------------------------------------
  async toggleCamera() {
    if (this.cameraStream) return this.stopCamera();
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      this.cameraPreview.srcObject = this.cameraStream;
      this.cameraPreview.style.display = "block";
      this.stopCameraBtn.style.display = "inline-block";
      this.scanCameraLoop();
    } catch (e) {
      alert("Không mở được camera");
    }
  }

  stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
    }
    this.cameraStream = null;
    if (this.cameraPreview) {
      this.cameraPreview.style.display = "none";
    }
    if (this.stopCameraBtn) {
      this.stopCameraBtn.style.display = "none";
    }
  }

  async scanCameraLoop() {
    if (!this.cameraStream || !this.barcodeDetector) return;

    try {
      const found = await this.barcodeDetector.detect(this.cameraPreview);
      if (found.length > 0) {
        const code = found[0].rawValue.trim();
        this.handleCompleteBarcode(code);
        this.stopCamera();
        return;
      }
    } catch (e) {
      console.warn("Camera detect error", e);
    }

    requestAnimationFrame(() => this.scanCameraLoop());
  }

  // -----------------------------------------------------
  //  4) XỬ LÝ PHÍM TỪ ĐẦU ĐỌC HID
  // -----------------------------------------------------
  onHIDKey(e) {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    // ENTER = kết thúc 1 chuỗi quét
    if (e.key === "Enter") {
      // Chặn submit form / nhảy dòng lung tung
      e.preventDefault();
      if (this.scanBuffer.trim().length >= this.HID_MIN_LENGTH) {
        this.handleCompleteBarcode(this.scanBuffer.trim());
      }
      this.resetHID();
      return;
    }

    // Chỉ quan tâm đến ký tự số (scanner gửi như bàn phím số)
    if (/^[0-9]$/.test(e.key)) {
      // Chặn không cho số rơi vào input đang focus (danh mục/tags/ghi chú...)
      e.preventDefault();

      // Bắt đầu chuỗi mới nếu:
      //  - chưa scanning, hoặc
      //  - khoảng cách thời gian quá lớn
      if (!this.scanning || delta > this.HID_SCAN_GAP) {
        this.scanning = true;
        this.scanBuffer = e.key; // GIỮ LUÔN SỐ ĐẦU TIÊN
      } else {
        this.scanBuffer += e.key;
      }

      // Đặt lại timeout: quá HID_TIMEOUT ms không nhận thêm số → kết thúc
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.scanBuffer.trim().length >= this.HID_MIN_LENGTH) {
          this.handleCompleteBarcode(this.scanBuffer.trim());
        }
        this.resetHID();
      }, this.HID_TIMEOUT);
    }
  }

  resetHID() {
    this.scanning = false;
    this.scanBuffer = "";
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // -----------------------------------------------------
  //  5) HÀM CHUNG: XỬ LÝ 1 MÃ VẠCH ĐÃ ĐẦY ĐỦ
  //     (camera + HID đều đi vào đây)
  // -----------------------------------------------------
  handleCompleteBarcode(code) {
    if (!code) return;

    // Nếu đang ở chế độ INLINE EDIT:
    if (this.isInlineEdit()) {
      const active = document.activeElement;

      // Chỉ khi đang đứng ở ô mã vạch của bảng mới cho ghi
      if (this.isInlineBarcodeCell(active)) {
        active.value = code;
        active.dispatchEvent(new Event("input", { bubbles: true }));
        active.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // Dù sao cũng không làm gì thêm ở form trên
      return;
    }

    // CHẾ ĐỘ BÌNH THƯỜNG
    // 1) Nếu form đang có dữ liệu → auto-save trước khi nhảy sang mã mới
    const formEmpty = this.isFormEmpty();
    if (!formEmpty) {
      const result = this.tryAutoSave();
      if (!result.allowContinue) {
        // Người dùng chọn "tiếp tục sửa" → không xử lý mã này
        return;
      }
    }

    // 2) Luôn focus + set ô mã vạch
    if (this.barcodeInput) {
      this.barcodeInput.focus();
      this.barcodeInput.value = code;
    }

    // 3) Tìm mã trong list / hiển thị lên form
    this.searchBarcode(code);
  }

  // -----------------------------------------------------
  //  6) CHECK FORM TRỐNG
  // -----------------------------------------------------
  isFormEmpty() {
    const ids = [
      "barcodeInput",
      "nameInput",
      "imageInput",
      "categoryInput",
      "qtyInput",
      "stockInput",
      "priceInput",
      "noteInput",
    ];
    for (let id of ids) {
      const el = document.getElementById(id);
      if (el && String(el.value || "").trim() !== "") return false;
    }
    return true;
  }

  // -----------------------------------------------------
  //  7) AUTO-SAVE KHI FORM ĐANG CÓ DỮ LIỆU
  // -----------------------------------------------------
  tryAutoSave() {
    if (!window.formHandler) return { allowContinue: true };
    if (!window.formHandler.formDirty) return { allowContinue: true };

    const data = formHandler.getFormData();
    const missing = formHandler.validateFormData(data);

    if (missing.length > 0) {
      const ask = formHandler.showScanMissingFieldsDialog(missing);
      if (ask.keepEditing) {
        // Người dùng muốn sửa tiếp → không cho scan tiếp
        return { allowContinue: false };
      }
      // Người dùng chấp nhận bỏ form cũ
      formHandler.resetForm();
      return { allowContinue: true };
    }

    const saved = formHandler.saveForm();
    if (saved && window.githubSync) {
      // Lưu CSV lên GitHub trong nền cho êm
      window.githubSync.pushCSV({ silent: true });
    }

    return { allowContinue: saved };
  }

  // -----------------------------------------------------
  //  8) TÌM MÃ TRONG LIST
  // -----------------------------------------------------
  searchBarcode(code) {
    if (!window.searchHandler) return;

    try {
      searchHandler.handleBarcodeSearch(code);
    } catch (e) {
      console.error("search error", e);
    }

    // Nếu searchHandler có clear mất ô barcode thì set lại
    if (this.barcodeInput && !this.barcodeInput.value.trim()) {
      this.barcodeInput.value = code;
    }
  }

  // -----------------------------------------------------
  //  9) INLINE EDIT MODE
  // -----------------------------------------------------
  isInlineEdit() {
    return !!window.inlineEditModeOn;
  }

  isInlineBarcodeCell(el) {
    if (!el) return false;
    return el.dataset && el.dataset.field === "barcode";
  }
}

// ---------------------------------------------------------
// KHỞI TẠO
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  window.cameraScanner = new CameraScanner();
});
