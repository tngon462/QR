// =====================================================
//  CAMERA + HID BARCODE SCANNER - V3.1 FIX CAMERA DETECT
//  - Fix: camera mở nhưng không quét được (BarcodeDetector null / video chưa ready)
//  - Giữ nguyên toàn bộ logic HID + form + inline edit
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
    this.HID_MIN_LENGTH = 6;
    this.HID_SCAN_GAP = 120;
    this.HID_TIMEOUT = 80;

    // --- Camera ---
    this.cameraStream = null;
    this.barcodeDetector = null;

    // Throttle camera detect để ổn định
    this._lastDetectAt = 0;
    this.CAM_DETECT_INTERVAL = 150; // ms

    this.initBarcodeDetector();
    this.bindEvents();
  }

  // -----------------------------------------------------
  //  1) KHỞI TẠO BARCODE DETECTOR
  // -----------------------------------------------------
  initBarcodeDetector() {
    if (!("BarcodeDetector" in window)) {
      console.warn("[CameraScanner] BarcodeDetector NOT supported on this browser.");
      this.barcodeDetector = null;
      return;
    }

    try {
      // Một số trình duyệt có getSupportedFormats()
      // Nếu có → log cho dễ debug
      if (typeof BarcodeDetector.getSupportedFormats === "function") {
        BarcodeDetector.getSupportedFormats()
          .then((fmts) => console.log("[CameraScanner] Supported formats:", fmts))
          .catch(() => {});
      }

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
      console.warn("[CameraScanner] BarcodeDetector init error:", e);
      this.barcodeDetector = null;
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
  }

  // -----------------------------------------------------
  //  3) CAMERA QUÉT → xử lý giống HID
  // -----------------------------------------------------
  async toggleCamera() {
    if (this.cameraStream) return this.stopCamera();

    // ✅ Nếu không có BarcodeDetector → báo rõ để khỏi “mở camera nhưng không quét”
    if (!this.barcodeDetector) {
      alert(
        "Trình duyệt này KHÔNG hỗ trợ tự nhận diện mã vạch (BarcodeDetector).\n\n" +
        "Cách xử lý:\n" +
        "• Dùng Chrome/Edge mới nhất trên máy tính/Android.\n" +
        "• Nếu đang dùng iPhone/iPad (Safari) → sẽ không quét được bằng cách này.\n"
      );
      return;
    }

    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      this.cameraPreview.srcObject = this.cameraStream;
      this.cameraPreview.style.display = "block";
      this.stopCameraBtn.style.display = "inline-block";

      // ✅ Đợi video sẵn sàng thật sự trước khi detect
      await this.waitVideoReady(this.cameraPreview);

      this._lastDetectAt = 0;
      this.scanCameraLoop();
    } catch (e) {
      console.error("[CameraScanner] getUserMedia error:", e);
      alert("Không mở được camera");
      this.stopCamera();
    }
  }

  async waitVideoReady(videoEl) {
    if (!videoEl) return;

    // Một số máy cần play() để video bắt đầu chạy
    try {
      // Đợi metadata
      if (videoEl.readyState < 1) {
        await new Promise((resolve) => {
          videoEl.onloadedmetadata = () => resolve();
        });
      }
      // Play (bỏ qua lỗi autoplay policy vì đã có user gesture từ click)
      await videoEl.play().catch(() => {});
    } catch (_) {}

    // Đợi có frame thật (readyState >= 2)
    const t0 = performance.now();
    while (videoEl.readyState < 2) {
      if (performance.now() - t0 > 1200) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach((t) => t.stop());
    }
    this.cameraStream = null;

    if (this.cameraPreview) {
      this.cameraPreview.srcObject = null;
      this.cameraPreview.style.display = "none";
    }
    if (this.stopCameraBtn) {
      this.stopCameraBtn.style.display = "none";
    }
  }

  async scanCameraLoop() {
    if (!this.cameraStream || !this.barcodeDetector) return;
    if (!this.cameraPreview) return;

    // Video chưa có frame → đợi
    if (this.cameraPreview.readyState < 2) {
      requestAnimationFrame(() => this.scanCameraLoop());
      return;
    }

    // Throttle detect để ổn định
    const now = performance.now();
    if (now - this._lastDetectAt < this.CAM_DETECT_INTERVAL) {
      requestAnimationFrame(() => this.scanCameraLoop());
      return;
    }
    this._lastDetectAt = now;

    try {
      const found = await this.barcodeDetector.detect(this.cameraPreview);
      if (found && found.length > 0) {
        const code = String(found[0].rawValue || "").trim();
        if (code) {
          this.handleCompleteBarcode(code);
          this.stopCamera();
          return;
        }
      }
    } catch (e) {
      // Nếu detect lỗi liên tục, vẫn cho loop tiếp
      console.warn("[CameraScanner] detect error:", e);
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

    if (e.key === "Enter") {
      e.preventDefault();
      if (this.scanBuffer.trim().length >= this.HID_MIN_LENGTH) {
        this.handleCompleteBarcode(this.scanBuffer.trim());
      }
      this.resetHID();
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();

      if (!this.scanning || delta > this.HID_SCAN_GAP) {
        this.scanning = true;
        this.scanBuffer = e.key;
      } else {
        this.scanBuffer += e.key;
      }

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
  // -----------------------------------------------------
  handleCompleteBarcode(code) {
    if (!code) return;

    // Nếu đang ở chế độ INLINE EDIT:
    if (this.isInlineEdit()) {
      const active = document.activeElement;
      if (this.isInlineBarcodeCell(active)) {
        active.value = code;
        active.dispatchEvent(new Event("input", { bubbles: true }));
        active.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    const formEmpty = this.isFormEmpty();
    if (!formEmpty) {
      const result = this.tryAutoSave();
      if (!result.allowContinue) {
        return;
      }
    }

    if (this.barcodeInput) {
      this.barcodeInput.focus();
      this.barcodeInput.value = code;
    }

    this.searchBarcode(code);
  }

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

  tryAutoSave() {
    if (!window.formHandler) return { allowContinue: true };
    if (!window.formHandler.formDirty) return { allowContinue: true };

    const data = formHandler.getFormData();
    const missing = formHandler.validateFormData(data);

    if (missing.length > 0) {
      const ask = formHandler.showScanMissingFieldsDialog(missing);
      if (ask.keepEditing) {
        return { allowContinue: false };
      }
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

    if (this.barcodeInput && !this.barcodeInput.value.trim()) {
      this.barcodeInput.value = code;
    }
  }

  isInlineEdit() {
    return !!window.inlineEditModeOn;
  }

  isInlineBarcodeCell(el) {
    if (!el) return false;
    return el.dataset && el.dataset.field === "barcode";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.cameraScanner = new CameraScanner();
});
