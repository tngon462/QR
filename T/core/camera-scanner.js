// core/camera-scanner.js
class CameraScanner {
    constructor() {
        this.cameraPreview = document.getElementById('cameraPreview');
        this.cameraBtn = document.getElementById('cameraBtn');
        this.stopCameraBtn = document.getElementById('stopCameraBtn');
        this.barcodeInput = document.getElementById('barcodeInput');
        
        this.cameraStream = null;
        this.scanning = false;
        this.barcodeDetector = null;
        this.scanBuffer = '';
        this.lastScanTime = 0;
        this.SCAN_TIMEOUT = 300;
        
        this.initializeBarcodeDetector();
        this.bindEvents();
    }

    initializeBarcodeDetector() {
        if ('BarcodeDetector' in window) {
            try {
                this.barcodeDetector = new BarcodeDetector({
                    formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code']
                });
            } catch (e) {
                console.warn('BarcodeDetector init error', e);
                this.barcodeDetector = null;
            }
        }
    }

    bindEvents() {
        this.cameraBtn.addEventListener('click', () => this.toggleCamera());
        this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
        
        // HID scanner detection
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    async toggleCamera() {
        if (this.scanning) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    async startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Trình duyệt không hỗ trợ camera.');
            return;
        }
        
        if (!this.barcodeDetector) {
            alert('Trình duyệt không hỗ trợ BarcodeDetector.');
            return;
        }

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            
            this.cameraPreview.srcObject = this.cameraStream;
            this.cameraPreview.style.display = 'block';
            this.stopCameraBtn.style.display = 'inline-block';
            this.scanning = true;
            
            this.scanLoop();
        } catch (e) {
            console.error('Camera error:', e);
            alert('Không mở được camera. Kiểm tra quyền truy cập.');
        }
    }

    stopCamera() {
        this.scanning = false;
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        
        this.cameraPreview.srcObject = null;
        this.cameraPreview.style.display = 'none';
        this.stopCameraBtn.style.display = 'none';
    }

    async scanLoop() {
        if (!this.scanning || !this.barcodeDetector) return;
        
        try {
            const barcodes = await this.barcodeDetector.detect(this.cameraPreview);
            if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                if (code) {
                    const { saved, allowContinue } = this.autoSaveIfDirty();
                    if (!allowContinue) {
                        if (navigator.vibrate) navigator.vibrate(60);
                        return;
                    }
                    if (saved && window.githubSync) {
                        window.githubSync.pushCSV({ silent: true });
                    }
                    if (navigator.vibrate) navigator.vibrate(80);
                    
                    this.stopCamera();
                    this.handleScannedBarcode(code);
                    return;
                }
            }
        } catch (e) {
            console.error('Barcode detection error:', e);
        }
        
        requestAnimationFrame(() => this.scanLoop());
    }

        handleKeyDown(e) {
        const editBarcodeMode = document.getElementById('editBarcodeModeBtn')?.classList.contains('active');
        if (editBarcodeMode) return;

        const now = Date.now();
        if (now - this.lastScanTime > this.SCAN_TIMEOUT) {
            this.scanBuffer = '';
        }
        this.lastScanTime = now;

        const inlineMode = this.isInlineEditMode();
        const activeEl = document.activeElement;

        // Nếu đang ở chế độ sửa trực tiếp và KHÔNG đứng ở ô mã vạch / ô mã vạch phía trên
        // thì bỏ qua toàn bộ chuỗi quét, coi như chưa quét gì.
        if (
            inlineMode &&
            e.key.length === 1 &&
            activeEl !== this.barcodeInput &&
            !this.isInlineBarcodeCell(activeEl)
        ) {
            this.scanBuffer = '';
            return;
        }

        // Handle Enter key (end of scan)
        if (e.key === 'Enter') {
            if (this.scanBuffer.trim().length >= 4) {
                e.preventDefault();
                const code = this.scanBuffer.trim();
                this.scanBuffer = '';

                const { saved, allowContinue } = this.autoSaveIfDirty();
                if (!allowContinue) return;
                if (saved && window.githubSync) {
                    window.githubSync.pushCSV({ silent: true });
                }

                this.handleScannedBarcode(code);
            } else if (document.activeElement === this.barcodeInput) {
                e.preventDefault();
                this.handleBarcodeEnter();
            } else {
                this.scanBuffer = '';
            }
            return;
        }

        // Ignore modifier keys
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Collect normal characters
        if (e.key.length === 1) {
            // Luôn chặn không cho ký tự từ đầu đọc rơi vào các ô khác
            if (
                e.target !== this.barcodeInput &&
                !this.isInlineBarcodeCell(e.target)
            ) {
                e.preventDefault();
            }

            // Prevent typing in category/tags fields (phòng khi có trường hợp đặc biệt)
            if (this.isCategoryOrTagsTarget(e.target)) {
                e.preventDefault();
            }

            this.scanBuffer += e.key;
        }
    }
    isCategoryOrTagsTarget(el) {
        if (!el) return false;
        const categoryInput = document.getElementById('categoryInput');
        const tagsDisplay = document.getElementById('tagsDisplay');
        const tagsDropdown = document.getElementById('tagsDropdown');
        
        return el === categoryInput || 
               el === tagsDisplay || 
               (tagsDisplay && tagsDisplay.contains(el)) ||
               (tagsDropdown && tagsDropdown.contains(el));
    }

    autoSaveIfDirty() {
        const currentBarcode = this.barcodeInput.value.trim();
        if (!currentBarcode || !window.formHandler) {
            return { saved: false, allowContinue: true };
        }

        // Nếu form không thay đổi thì cứ cho qua
        if (!window.formHandler.formDirty) {
            return { saved: false, allowContinue: true };
        }

        const formData = window.formHandler.getFormData();
        const missing = window.formHandler.validateFormData(formData);

        // Thiếu trường bắt buộc → hỏi "Sửa tiếp / Bỏ qua"
        if (missing.length > 0) {
            const decision = window.formHandler.showScanMissingFieldsDialog(missing);
            if (decision.keepEditing) {
                // Người dùng muốn sửa tiếp → KHÔNG cho xử lý mã mới
                return { saved: false, allowContinue: false };
            }
            // Bỏ qua sản phẩm hiện tại, không lưu
            // Có thể xóa form để chuẩn bị cho mã mới
            if (window.formHandler.resetForm) {
                window.formHandler.resetForm();
            }
            return { saved: false, allowContinue: true };
        }

        // Đã đủ thông tin → tự động lưu như bấm nút "Lưu / Thêm mới"
        const saved = window.formHandler.saveForm();
        return { saved, allowContinue: saved };
    }

    handleScannedBarcode(code) {
        const trimmed = String(code || '').trim();
        if (!trimmed) return;

        // Nếu đang ở chế độ sửa trực tiếp (inline edit)
        if (this.isInlineEditMode()) {
            const inlineTarget = this.getInlineBarcodeTarget();

            // Chỉ cho phép quét khi đang đứng ở ô mã vạch trong list
            // hoặc trường mã vạch phía trên. Nếu không thì bỏ qua mã vừa quét.
            if (!inlineTarget && document.activeElement !== this.barcodeInput) {
                return;
            }

            if (inlineTarget) {
                if (inlineTarget.isContentEditable) {
                    inlineTarget.textContent = trimmed;
                } else {
                    inlineTarget.value = trimmed;
                }
                inlineTarget.dispatchEvent(new Event('input', { bubbles: true }));
                inlineTarget.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }

            // Nếu inline mode nhưng đang focus ô mã vạch phía trên
            this.barcodeInput.value = trimmed;
            this.handleBarcodeEnter();
            return;
        }

        // Chế độ bình thường:
        // Luôn ghi mã quét được vào ô mã vạch, tránh làm hỏng các ô khác.
        this.barcodeInput.value = trimmed;
        this.handleBarcodeEnter();
    }

        // Default: write to barcode input
        this.barcodeInput.value = trimmed;
        this.handleBarcodeEnter();
    }

    handleBarcodeEnter() {
        const barcode = this.barcodeInput.value.trim();
        if (!barcode) return;

        const searchHandler = window.searchHandler;
        if (searchHandler) {
            searchHandler.handleBarcodeSearch(barcode);
        }
    }

    isInlineEditMode() {
        const btn = document.getElementById('inlineEditToggleBtn');
        return !!(window.inlineEditModeOn ||
                  document.body.classList.contains('inline-edit-on') ||
                  (btn && btn.getAttribute('data-on') === 'true'));
    }

    getInlineBarcodeTarget() {
        const el = document.activeElement;
        return this.isInlineBarcodeCell(el) ? el : null;
    }

    isInlineBarcodeCell(el) {
        if (!el) return false;
        if (el.tagName === 'INPUT' || el.isContentEditable) {
            const ds = el.dataset || {};
            const name = (el.getAttribute('name') || '').toLowerCase();
            const dataCol = (el.getAttribute('data-col') || '').toLowerCase();
            return (
                ds.inlineRole === 'barcode' ||
                el.classList.contains('inline-barcode-input') ||
                name === 'barcode' || dataCol === 'barcode'
            );
        }
        return false;
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.cameraScanner = new CameraScanner();
});
