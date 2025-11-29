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
        if (this.cameraBtn) {
            this.cameraBtn.addEventListener('click', () => this.toggleCamera());
        }
        if (this.stopCameraBtn) {
            this.stopCameraBtn.addEventListener('click', () => this.stopCamera());
        }
        
        // HID scanner detection (đầu đọc mã vạch dạng bàn phím)
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
        
        if (this.cameraPreview) {
            this.cameraPreview.srcObject = null;
            this.cameraPreview.style.display = 'none';
        }
        if (this.stopCameraBtn) {
            this.stopCameraBtn.style.display = 'none';
        }
    }

    async scanLoop() {
        if (!this.scanning || !this.barcodeDetector) return;
        
        try {
            const barcodes = await this.barcodeDetector.detect(this.cameraPreview);
            if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                if (code) {
                    // Kiểm tra form trống trước khi auto-save
                    const formWasEmpty = this.isFormEmpty();
                    let saved = false;

                    if (!formWasEmpty) {
                        const { saved: s, allowContinue } = this.autoSaveIfDirty();
                        if (!allowContinue) {
                            if (navigator.vibrate) navigator.vibrate(60);
                            return;
                        }
                        saved = s;
                        if (saved && window.githubSync) {
                            window.githubSync.pushCSV({ silent: true });
                        }
                    }

                    if (navigator.vibrate) navigator.vibrate(80);
                    
                    this.stopCamera();
                    this.handleScannedBarcode(code, { formWasEmpty });
                    return;
                }
            }
        } catch (e) {
            console.error('Barcode detection error:', e);
        }
        
        requestAnimationFrame(() => this.scanLoop());
    }

    handleKeyDown(e) {
        // Nếu đang bật nút "✏️ Sửa mã" thì tắt auto quét từ HID
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

        // ENTER: kết thúc 1 lần quét
        if (e.key === 'Enter') {
            const buffered = this.scanBuffer.trim();

            // Trường hợp quét bằng đầu đọc (có buffer đủ dài)
            if (buffered.length >= 4) {
                e.preventDefault();
                const code = buffered;
                this.scanBuffer = '';

                const formWasEmpty = this.isFormEmpty();
                let saved = false;

                if (!formWasEmpty) {
                    const { saved: s, allowContinue } = this.autoSaveIfDirty();
                    if (!allowContinue) return;
                    saved = s;
                    if (saved && window.githubSync) {
                        window.githubSync.pushCSV({ silent: true });
                    }
                }

                this.handleScannedBarcode(code, { formWasEmpty });
            }
            // Trường hợp bấm Enter ngay trong ô barcodeInput (người gõ tay)
            else if (document.activeElement === this.barcodeInput) {
                e.preventDefault();
                this.handleBarcodeEnter();
            } else {
                this.scanBuffer = '';
            }
            return;
        }

        // Bỏ qua các phím control
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        // Thu thập ký tự thường (đầu đọc gửi từng ký tự)
        if (e.key.length === 1) {
            // Không cho ký tự từ đầu đọc rơi vào các ô khác ngoài barcode / ô barcode trong bảng
            if (
                e.target !== this.barcodeInput &&
                !this.isInlineBarcodeCell(e.target)
            ) {
                e.preventDefault();
            }

            // Không cho gõ vào danh mục/tags
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

    // Form "trống" = tất cả các trường chính đều đang rỗng
    isFormEmpty() {
        const ids = [
            'barcodeInput',
            'nameInput',
            'imageInput',
            'categoryInput',
            'qtyInput',
            'stockInput',
            'priceInput',
            'noteInput'
        ];

        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el) continue;
            if ((el.value || '').trim() !== '') {
                return false;
            }
        }
        return true;
    }

    autoSaveIfDirty() {
        const currentBarcode = this.barcodeInput ? this.barcodeInput.value.trim() : '';
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
            if (window.formHandler.resetForm) {
                window.formHandler.resetForm();
            }
            return { saved: false, allowContinue: true };
        }

        // Đã đủ thông tin → tự động lưu như bấm nút "Lưu / Thêm mới"
        const saved = window.formHandler.saveForm();
        return { saved, allowContinue: saved };
    }

    handleScannedBarcode(code, options = {}) {
        const trimmed = String(code || '').trim();
        if (!trimmed) return;

        const formWasEmpty = options.formWasEmpty ?? this.isFormEmpty();

        // Nếu đang ở chế độ sửa trực tiếp (inline edit)
        if (this.isInlineEditMode()) {
            const active = document.activeElement;
            const isBarcodeCell = this.isInlineBarcodeCell(active);

            // Chỉ cho phép quét khi đang đứng ở ô mã vạch trong list
            // hoặc ô mã vạch phía trên. Nếu không thì bỏ qua mã vừa quét.
            if (!isBarcodeCell && active !== this.barcodeInput) {
                console.log('[SCAN] Inline mode: bỏ qua vì không đứng ở cột mã vạch');
                return;
            }

            if (isBarcodeCell) {
                if (active.isContentEditable) {
                    active.textContent = trimmed;
                } else {
                    active.value = trimmed;
                }
                active.dispatchEvent(new Event('input', { bubbles: true }));
                active.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }

            // Nếu inline mode nhưng đang focus ô mã vạch phía trên
            if (this.barcodeInput) {
                this.barcodeInput.value = trimmed;
                this.handleBarcodeEnter();
            }
            return;
        }

        // Chế độ bình thường:
        if (!this.barcodeInput) return;

        this.barcodeInput.focus();
        this.barcodeInput.value = trimmed;
        this.barcodeInput.select();

        // Dù form đang trống hay có dữ liệu, phần "tìm kiếm theo mã"
        // vẫn dùng chung handleBarcodeEnter (searchHandler.handleBarcodeSearch)
        // – phần auto-save đã xử lý bên ngoài trước khi vào đây.
        this.handleBarcodeEnter();
    }

    handleBarcodeEnter() {
        if (!this.barcodeInput) return;
        const barcode = this.barcodeInput.value.trim();
        if (!barcode) return;

        const searchHandler = window.searchHandler;
        if (searchHandler && typeof searchHandler.handleBarcodeSearch === 'function') {
            searchHandler.handleBarcodeSearch(barcode);
        }
    }

    isInlineEditMode() {
        const btn = document.getElementById('inlineEditToggleBtn');
        return !!(
            window.inlineEditModeOn ||
            (document.body && document.body.classList.contains('inline-edit-on')) ||
            (btn && btn.getAttribute('data-on') === 'true')
        );
    }

    getInlineBarcodeTarget() {
        const el = document.activeElement;
        return this.isInlineBarcodeCell(el) ? el : null;
    }

    // Bổ sung nhận diện ô barcode của inline-edit (data-field="barcode")
    isInlineBarcodeCell(el) {
        if (!el) return false;
        if (el.tagName === 'INPUT' || el.isContentEditable) {
            const ds = el.dataset || {};
            const name = (el.getAttribute('name') || '').toLowerCase();
            const dataCol = (el.getAttribute('data-col') || '').toLowerCase();
            return (
                ds.inlineRole === 'barcode' ||
                el.classList.contains('inline-barcode-input') ||
                name === 'barcode' ||
                dataCol === 'barcode' ||
                ds.field === 'barcode' // phù hợp với kiemkho-inline-edit.js
            );
        }
        return false;
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.cameraScanner = new CameraScanner();
});
