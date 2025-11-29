// app.js - Main application file
class App {
    constructor() {
        this.countMode = false;
        this.editBarcodeMode = false;
        this.initializeApp();
    }

    initializeApp() {
        this.initializeModules();
        this.bindGlobalEvents();
        this.setupTabNavigation();
        this.setupEditBarcodeMode();
        
        // Tải dữ liệu ban đầu
        dataManager.loadFromLocalStorage();

        // Sau khi load dữ liệu: tự thêm tag mặc định + rebuild danh sách danh mục/tags
        if (window.categoryManager) {
            window.categoryManager.applyDefaultTagsForAllItems();
            window.categoryManager.rebuildLists();
        }
        
        // Render bảng
        if (window.tableRenderer) {
            window.tableRenderer.render();
        }
        
        // Focus vào ô mã vạch
        const barcodeInput = document.getElementById('barcodeInput');
        if (barcodeInput) {
            barcodeInput.focus();
        }
        
        console.log('Ứng dụng Kiểm Kho đã khởi động thành công!');
    }

    initializeModules() {
        // Các module đã được tự động khởi tạo qua event DOMContentLoaded
        // Đảm bảo tất cả module đã sẵn sàng
        this.ensureModulesReady();
    }

    ensureModulesReady() {
        const requiredModules = [
            'dataManager', 'formHandler', 'tableRenderer', 'cameraScanner',
            'photoHandler', 'searchHandler', 'categoryManager', 'csvHandler',
            'githubSync', 'shopifyExport', 'kiotVietExport', 'kiotVietSync', 'printLabelHandler'
        ];

        requiredModules.forEach(moduleName => {
            if (!window[moduleName]) {
                console.warn(`Module ${moduleName} chưa được khởi tạo`);
            }
        });
    }

    bindGlobalEvents() {
        // Global event listeners
        this.bindExportButtons();
        this.bindCountMode();
        this.bindDeleteItem();
    }

    bindExportButtons() {
        // Export buttons are now handled by their respective modules
        // This is just for fallback
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn && !exportBtn.hasListener) {
            exportBtn.addEventListener('click', () => {
                if (window.csvHandler) {
                    window.csvHandler.exportCSV();
                }
            });
            exportBtn.hasListener = true;
        }
    }

    bindCountMode() {
        const countModeBtn = document.getElementById('countModeBtn');
        if (countModeBtn) {
            countModeBtn.addEventListener('click', () => this.toggleCountMode());
        }
    }

    bindDeleteItem() {
        const deleteItemBtn = document.getElementById('deleteItemBtn');
        if (deleteItemBtn) {
            deleteItemBtn.addEventListener('click', () => this.deleteCurrentItem());
        }
    }

    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');
                
                // Update buttons
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update contents
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${tabName}-tab`) {
                        content.classList.add('active');
                    }
                });

                // Focus management
                if (tabName === 'main') {
                    const barcodeInput = document.getElementById('barcodeInput');
                    if (barcodeInput) {
                        barcodeInput.focus();
                    }
                }
            });
        });
    }

    setupEditBarcodeMode() {
        const editBarcodeModeBtn = document.getElementById('editBarcodeModeBtn');
        if (editBarcodeModeBtn) {
            editBarcodeModeBtn.addEventListener('click', () => this.toggleEditBarcodeMode());
        }
    }

    toggleCountMode() {
        const countModeBtn = document.getElementById('countModeBtn');
        if (!countModeBtn) return;

        this.countMode = !this.countMode;
        
        if (this.countMode) {
            countModeBtn.classList.add('count-on');
            countModeBtn.textContent = '📦 KIỂM ĐẾM (ĐANG BẬT)';
        } else {
            countModeBtn.classList.remove('count-on');
            countModeBtn.textContent = '📦 KIỂM ĐẾM';
        }
    }

    toggleEditBarcodeMode() {
        const editBarcodeModeBtn = document.getElementById('editBarcodeModeBtn');
        if (!editBarcodeModeBtn) return;

        this.editBarcodeMode = !this.editBarcodeMode;
        
        if (this.editBarcodeMode) {
            editBarcodeModeBtn.textContent = '✅ Đang sửa mã (tắt auto quét)';
            editBarcodeModeBtn.style.background = '#ffe8cc';
        } else {
            editBarcodeModeBtn.textContent = '✏️ Sửa mã';
            editBarcodeModeBtn.style.background = '';
        }
    }

    async deleteCurrentItem() {
        const barcodeInput = document.getElementById('barcodeInput');
        const barcode = barcodeInput ? barcodeInput.value.trim() : '';
        if (!barcode) {
            alert('Chưa có mã vạch để xóa.');
            return;
        }

        const item = dataManager.items.find(i => i.barcode === barcode);
        if (!item) {
            alert('Không tìm thấy sản phẩm có mã này trong danh sách.');
            return;
        }

        if (window.tableRenderer) {
            const idx = dataManager.items.findIndex(i => i.barcode === barcode);
            await window.tableRenderer.deleteItemAtIndex(idx);
        }
    }

    // Utility method để các module khác có thể truy cập
    getCountMode() {
        return this.countMode;
    }

    getEditBarcodeMode() {
        return this.editBarcodeMode;
    }

    // Method để refresh dữ liệu từ các nguồn
    async refreshData() {
        if (window.githubSync && window.githubSync.githubToken) {
            await window.githubSync.pullCSV();
        } else {
            // Chỉ reload từ localStorage
            dataManager.loadFromLocalStorage();
            if (window.tableRenderer) {
                window.tableRenderer.render();
            }
            if (window.categoryManager) {
                window.categoryManager.rebuildLists();
            }
        }
    }

    // Method để export tất cả định dạng
    exportAllFormats() {
        if (!dataManager.items.length) {
            alert('Chưa có dữ liệu để export');
            return;
        }

        if (window.csvHandler) window.csvHandler.exportCSV();
        // Các export khác có thể được thêm vào đây nếu cần
    }
}

// Khởi chạy ứng dụng khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Lỗi toàn cục:', e.error);
});

// Xử lý unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
    console.error('Promise rejection chưa được xử lý:', e.reason);
});
// ======================
//  BARCODE SCAN HANDLER
// ======================

// Cấu hình
const BARCODE_MIN_LENGTH = 4;
const BARCODE_KEY_TIMEOUT = 40;  // đầu đọc gõ rất nhanh-40ms là chuẩn

let barcodeBuffer = "";
let barcodeTimer = null;

// ID đúng theo HTML trong file kiểm kho
const BARCODE_INPUT_ID = "barcodeInput";
const SAVE_BUTTON_ID = "saveBtn";

// Reset buffer
function clearBarcode() {
    barcodeBuffer = "";
    if (barcodeTimer) clearTimeout(barcodeTimer);
    barcodeTimer = null;
}

// Khi Enter -> kết thúc 1 barcode
function finishBarcodeScan() {
    const code = barcodeBuffer;
    clearBarcode();

    if (code.length < BARCODE_MIN_LENGTH) return;

    // =========== CHẾ ĐỘ SỬA TRỰC TIẾP ===========
    if (window.inlineEditModeOn) {
        const el = document.activeElement;
        const đúngOBarcode = el && el.dataset && el.dataset.field === "barcode";

        if (!đúngOBarcode) {
            // Đang không đứng đúng ô mã vạch -> bỏ qua
            return;
        }

        // Đúng ô barcode trong bảng -> ghi barcode vào ô đó
        if (el.tagName === "INPUT") {
            el.value = code;
            el.dispatchEvent(new Event("blur")); // auto update
        }
        return;
    }

    // ============ CHẾ ĐỘ BÌNH THƯỜNG ============

    const barcodeInput = document.getElementById(BARCODE_INPUT_ID);
    if (barcodeInput) {
        barcodeInput.focus();
        barcodeInput.value = code;
    }

    const btn = document.getElementById(SAVE_BUTTON_ID);
    if (btn) btn.click();
}

window.addEventListener("keydown", function (e) {

    // =============== SỬA TRỰC TIẾP ===============
    if (window.inlineEditModeOn) {

        const active = document.activeElement;
        const tạiÔBarcode = active && active.dataset && active.dataset.field === "barcode";

        if (!tạiÔBarcode) {
            // Chặn scanner khi đứng sai ô
            if ((e.key >= "0" && e.key <= "9") || e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        // Nếu đang ở đúng ô barcode: cho scanner gõ trực tiếp
        return;
    }

    // =============== CHẾ ĐỘ BÌNH THƯỜNG ===============

    // Khi đang ở input khác → chặn để barcode không bị rơi vào đó
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        // Chỉ cho nhập trực tiếp nếu input là barcodeInput
        if (e.target.id !== BARCODE_INPUT_ID) {
            if (e.key >= "0" && e.key <= "9") {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }

    // Thu thập barcode
    if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        e.stopPropagation();

        barcodeBuffer += e.key;

        if (barcodeTimer) clearTimeout(barcodeTimer);
        barcodeTimer = setTimeout(clearBarcode, BARCODE_KEY_TIMEOUT);
        return;
    }

    // Đầu đọc thường kết thúc barcode bằng ENTER
    if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        finishBarcodeScan();
        return;
    }
});
