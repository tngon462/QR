// =====================================================
// CAMERA + HID BARCODE SCANNER - FIXED VERSION (NO LOST DIGIT)
// =====================================================

class CameraScanner {
    constructor() {
        this.cameraPreview = document.getElementById('cameraPreview');
        this.cameraBtn = document.getElementById('cameraBtn');
        this.stopCameraBtn = document.getElementById('stopCameraBtn');
        this.barcodeInput = document.getElementById('barcodeInput');

        // FIX 1: Không mất ký tự đầu
        this.scanBuffer = "";
        this.scanning = false;
        this.lastTime = 0;
        this.SCAN_GAP = 120;      // từ 40 → 120ms
        this.SCAN_TIMEOUT = 60;   // cho phép kết thúc ổn định

        this.timer = null;

        this.cameraStream = null;
        this.barcodeDetector = null;

        this.initBarcodeDetector();
        this.bindEvents();
    }

    // -----------------------------------------------------
    initBarcodeDetector() {
        if ("BarcodeDetector" in window) {
            try {
                this.barcodeDetector = new BarcodeDetector({
                    formats: ["ean_13","ean_8","code_128","code_39","upc_a","upc_e","qr_code"]
                });
            } catch {
                this.barcodeDetector = null;
            }
        }
    }

    // -----------------------------------------------------
    bindEvents() {
        if (this.cameraBtn) this.cameraBtn.addEventListener("click", () => this.toggleCamera());
        if (this.stopCameraBtn) this.stopCameraBtn.addEventListener("click", () => this.stopCamera());

        document.addEventListener("keydown", (e) => this.onHIDKey(e));
    }

    // -----------------------------------------------------
    async toggleCamera() {
        if (this.cameraStream) return this.stopCamera();

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }});
            this.cameraPreview.srcObject = this.cameraStream;
            this.cameraPreview.style.display = "block";
            this.stopCameraBtn.style.display = "inline-block";
            this.scanCameraLoop();
        } catch {
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
                this.finishBarcode(code);
                this.stopCamera();
                return;
            }
        } catch {}

        requestAnimationFrame(() => this.scanCameraLoop());
    }

    // -----------------------------------------------------
    // FIXED HID BARCODE HANDLER
    // -----------------------------------------------------
    onHIDKey(e) {
        const now = performance.now();
        const delta = now - this.lastTime;
        this.lastTime = now;

        // 1) Ký tự Enter → kết thúc quét
        if (e.key === "Enter") {
            e.preventDefault();
            if (this.scanBuffer.length >= 4) this.finishBarcode(this.scanBuffer);
            this.resetScan();
            return;
        }

        // 2) Chỉ nhận ký tự 1 char: số hoặc ký tự từ đầu đọc
        if (e.key.length === 1) {
            if (!this.scanning || delta > this.SCAN_GAP) {
                this.scanning = true;
                this.scanBuffer = e.key;   // ⭐ GIỮ LUÔN KÝ TỰ ĐẦU — KHÔNG BAO GIỜ MẤT
            } else {
                this.scanBuffer += e.key;
            }

            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                if (this.scanBuffer.length >= 4) this.finishBarcode(this.scanBuffer);
                this.resetScan();
            }, this.SCAN_TIMEOUT);
        }
    }

    resetScan() {
        this.scanning = false;
        this.scanBuffer = "";
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    // -----------------------------------------------------
    finishBarcode(code) {
        if (!code) return;

        // Luôn focus barcode input
        this.barcodeInput.focus();
        this.barcodeInput.value = code;

        // Nếu đang inline edit → xử lý đặc biệt
        if (this.isInlineEdit()) {
            const el = document.activeElement;
            if (this.isInlineBarcodeCell(el)) {
                el.value = code;
                el.dispatchEvent(new Event("input"));
                el.dispatchEvent(new Event("change"));
            }
            return;
        }

        // Auto-save nếu form đang có dữ liệu
        const formEmpty = this.isFormEmpty();
        if (!formEmpty) {
            const result = this.tryAutoSave();
            if (!result.allowContinue) return;
        }

        // Tìm mã
        this.searchBarcode(code);
    }

    // -----------------------------------------------------
    isFormEmpty() {
        const fields = ["barcodeInput","nameInput","imageInput","categoryInput","qtyInput","stockInput","priceInput","noteInput"];
        for (let id of fields) {
            const el = document.getElementById(id);
            if (el && el.value.trim() !== "") return false;
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
        if (saved && window.githubSync) window.githubSync.pushCSV({ silent: true });

        return { allowContinue: saved };
    }

    searchBarcode(code) {
        if (!window.searchHandler) return;

        try { searchHandler.handleBarcodeSearch(code); }
        catch {}

        if (!this.barcodeInput.value.trim()) this.barcodeInput.value = code;
    }

    isInlineEdit() { return !!window.inlineEditModeOn; }
    isInlineBarcodeCell(el) { return el?.dataset?.field === "barcode"; }
}

// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    window.cameraScanner = new CameraScanner();
});
