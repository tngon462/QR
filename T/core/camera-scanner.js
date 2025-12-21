// =====================================================
//  CAMERA + HID BARCODE SCANNER - T-NGON VERSION
//  TÍCH HỢP TOÀN BỘ LOGIC QUÉT / TÌM / AUTO-SAVE
// =====================================================

class CameraScanner {
    constructor() {
        this.cameraPreview = document.getElementById('cameraPreview');
        this.cameraBtn = document.getElementById('cameraBtn');
        this.stopCameraBtn = document.getElementById('stopCameraBtn');
        this.barcodeInput = document.getElementById('barcodeInput');
        this.scanBuffer = "";
        this.lastKeyTime = 0;
        this.SCAN_TIMEOUT = 40;

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
                        "ean_13", "ean_8", "code_128",
                        "code_39", "upc_a", "upc_e", "qr_code"
                    ]
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
        if (this.cameraBtn) this.cameraBtn.addEventListener("click", () => this.toggleCamera());
        if (this.stopCameraBtn) this.stopCameraBtn.addEventListener("click", () => this.stopCamera());

        // HID listening
        document.addEventListener("keydown", (e) => this.onHIDKey(e));
    }

    // -----------------------------------------------------
    //  3) CAMERA QUÉT → xử lý như HID
    // -----------------------------------------------------
    async toggleCamera() {
        if (this.cameraStream) return this.stopCamera();
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }});
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
            this.cameraStream.getTracks().forEach(t => t.stop());
        }
        this.cameraStream = null;
        this.cameraPreview.style.display = "none";
        this.stopCameraBtn.style.display = "none";
    }

    async scanCameraLoop() {
        if (!this.cameraStream || !this.barcodeDetector) return;

        try {
            const found = await this.barcodeDetector.detect(this.cameraPreview);
            if (found.length > 0) {
                const code = found[0].rawValue.trim();
                this.processBarcode(code);
                this.stopCamera();
                return;
            }
        } catch {}

        requestAnimationFrame(() => this.scanCameraLoop());
    }

    // -----------------------------------------------------
    //  4) XỬ LÝ PHÍM TỪ ĐẦU ĐỌC HID
    // -----------------------------------------------------
    onHIDKey(e) {

        const now = Date.now();
        if (now - this.lastKeyTime > this.SCAN_TIMEOUT) {
            this.scanBuffer = "";
        }
        this.lastKeyTime = now;

        // -------------------------------
        // INLINE EDIT MODE
        // -------------------------------
        if (this.isInlineEdit()) {
            const active = document.activeElement;

            // Chỉ cho barcode rơi vào ô có data-field="barcode"
            if (this.isInlineBarcodeCell(active)) {
                if (e.key === "Enter") {
                    const code = this.scanBuffer.trim();
                    this.scanBuffer = "";
                    if (code.length >= 4) {
                        active.value = code;
                        active.dispatchEvent(new Event("input"));
                        active.dispatchEvent(new Event("change"));
                    }
                    e.preventDefault();
                } else if (e.key.length === 1) {
                    this.scanBuffer += e.key;
                }
            } else {
                // Đang ở field khác → bỏ qua barcode
                if (e.key.length === 1) {
                    this.scanBuffer += e.key;
                }
                if (e.key === "Enter") this.scanBuffer = "";
                e.preventDefault();
            }
            return;
        }

        // -------------------------------
        // CHẾ ĐỘ BÌNH THƯỜNG
        // -------------------------------
        if (e.key === "Enter") {
            const code = this.scanBuffer.trim();
            this.scanBuffer = "";
            if (code.length >= 4) {
                e.preventDefault();
                this.processBarcode(code);
            }
            return;
        }

        // Thu thập ký tự barcode
        if (e.key.length === 1) {
            this.scanBuffer += e.key;
        }
    }

    // -----------------------------------------------------
    //  5) HÀM QUAN TRỌNG NHẤT: XỬ LÝ MỘT MÃ VỪA QUÉT
    // -----------------------------------------------------
    processBarcode(code) {
        if (!code) return;

        const formEmpty = this.isFormEmpty();

        // Nếu form không trống → auto-save (HOẶC hỏi thiếu trường)
        if (!formEmpty) {
            const result = this.tryAutoSave();
            if (!result.allowContinue) return;
        }

        // Hiện mã lên ô barcodeInput (luôn luôn)
        this.barcodeInput.focus();
        this.barcodeInput.value = code;

        // Form trống hoặc reset → tìm sản phẩm theo mã
        this.searchBarcode(code);
    }

    // -----------------------------------------------------
    //  6) KIỂM TRA FORM TRỐNG
    // -----------------------------------------------------
    isFormEmpty() {
        const ids = [
            "barcodeInput", "nameInput", "imageInput",
            "categoryInput", "qtyInput", "stockInput",
            "priceInput", "noteInput"
        ];
        for (let id of ids) {
            const el = document.getElementById(id);
            if (el && el.value.trim() !== "") return false;
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

    // -----------------------------------------------------
    //  8) TÌM KIẾM MÃ TRONG LIST
    // -----------------------------------------------------
    searchBarcode(code) {
        if (!window.searchHandler) return;

        try {
            searchHandler.handleBarcodeSearch(code);
        } catch (e) {
            console.error("search error", e);
        }

        // Giữ mã nếu searchHandler xoá mất
        if (!this.barcodeInput.value.trim()) {
            this.barcodeInput.value = code;
        }
    }

    // -----------------------------------------------------
    //  9) INLINE EDIT - NHẬN DIỆN Ô MÃ VẠCH
    // -----------------------------------------------------
    isInlineEdit() {
        return !!window.inlineEditModeOn;
    }

    isInlineBarcodeCell(el) {
        if (!el) return false;
        if (el.dataset && el.dataset.field === "barcode") return true;
        return false;
    }
}

// ---------------------------------------------------------
// KHỞI TẠO
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    window.cameraScanner = new CameraScanner();
});
