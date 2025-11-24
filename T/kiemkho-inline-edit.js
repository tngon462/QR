// inline-edit.js - Sửa trực tiếp bảng kiểm kho

class InlineTableEditor {
    constructor() {
        this.enabled = false;
        this.btn = document.getElementById('inlineEditToggleBtn');
        this.tbody = document.getElementById('itemsBody');

        if (!this.btn || !this.tbody) {
            console.warn('InlineTableEditor: không tìm thấy nút hoặc tbody');
            return;
        }

        // Gán sự kiện cho nút ✏️ Sửa trực tiếp bảng
        this.btn.addEventListener('click', () => this.toggle());
    }

    toggle() {
        this.enabled = !this.enabled;

        if (this.enabled) {
            this.btn.textContent = '✅ Đang sửa trực tiếp (bấm lại để tắt)';
            this.btn.classList.add('inline-edit-on');
            this.enterInlineMode();
        } else {
            this.btn.textContent = '✏️ Sửa trực tiếp bảng';
            this.btn.classList.remove('inline-edit-on');
            this.exitInlineMode();
        }
    }

    enterInlineMode() {
        // Dùng cấu trúc bảng hiện tại:
        // 0: #, 1: barcode, 2: name, 3: img, 4: category, 5: tags,
        // 6: price, 7: qty, 8: stock, 9: note, 10: updated_at, 11: Xóa
        const rows = this.tbody.querySelectorAll('tr');

        rows.forEach(tr => {
            // Lưu barcode gốc để tìm item trong dataManager.items
            const originalBarcode = tr.dataset.barcode || '';
            tr.dataset.originalBarcode = originalBarcode;

            const tds = tr.children;
            if (tds.length < 11) return;

            // Helper biến 1 ô thành <input>
            const makeInput = (td, fieldName) => {
                if (!td) return null;

                // Lấy full value từ title (do bảng đang hiển thị truncate)
                const full = td.getAttribute('title') || td.textContent || '';
                td.innerHTML = '';

                const input = document.createElement('input');
                input.type = 'text';
                input.value = full;
                input.className = 'inline-edit-input';
                input.dataset.field = fieldName;

                td.appendChild(input);

                // Khi blur hoặc Enter thì update object tương ứng
                input.addEventListener('blur', () => this.updateItemFromRow(tr));
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    }
                });

                return input;
            };

            makeInput(tds[1], 'barcode');
            makeInput(tds[2], 'name');
            // tds[3] = ảnh, giữ nguyên
            makeInput(tds[4], 'category');
            makeInput(tds[5], 'tags');
            makeInput(tds[6], 'price');
            makeInput(tds[7], 'qty');
            makeInput(tds[8], 'stock');
            makeInput(tds[9], 'note');
            // tds[10] = updated_at, để module tự set, không cho sửa tay
        });
    }

    updateItemFromRow(tr) {
        if (!window.dataManager || !Array.isArray(dataManager.items)) {
            console.warn('InlineTableEditor: dataManager chưa sẵn sàng');
            return;
        }

        const tds = tr.children;
        if (tds.length < 11) return;

        const getVal = (idx) => {
            const input = tds[idx].querySelector('input');
            return input ? input.value.trim() : '';
        };

        const newData = {
            barcode: getVal(1),
            name: getVal(2),
            category: getVal(4),
            tags: getVal(5),
            price: getVal(6),
            qty: getVal(7),
            stock: getVal(8),
            note: getVal(9),
        };

        // Parse số
        const toNumOrEmpty = (v) => {
            if (!v) return '';
            const n = Number(v.replace(/[,¥円\s]/g, ''));
            return Number.isFinite(n) ? n : '';
        };
        const toIntOrEmpty = (v) => {
            if (!v) return '';
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : '';
        };

        newData.price = toNumOrEmpty(newData.price);
        newData.qty   = toIntOrEmpty(newData.qty);
        newData.stock = toIntOrEmpty(newData.stock);

        // Tìm item trong dataManager.items
        const originalBarcode = tr.dataset.originalBarcode || tr.dataset.barcode || '';
        let item = null;

        if (originalBarcode) {
            item = dataManager.items.find(i => (i.barcode || '') === originalBarcode);
        }
        if (!item && newData.barcode) {
            // Nếu không tìm thấy bằng barcode gốc, thử bằng barcode mới
            item = dataManager.items.find(i => (i.barcode || '') === newData.barcode);
        }

        if (!item) {
            console.warn('InlineTableEditor: không tìm thấy item tương ứng để cập nhật', originalBarcode, newData.barcode);
            return;
        }

        // Cập nhật item
        item.barcode   = newData.barcode;
        item.name      = newData.name;
        item.category  = newData.category;
        item.tags      = newData.tags;
        item.price     = newData.price;
        item.qty       = newData.qty;
        item.stock     = newData.stock;
        item.note      = newData.note;
        item.updated_at = this.nowString();

        // Cập nhật lại data-* của dòng
        tr.dataset.barcode = item.barcode || '';
        tr.dataset.originalBarcode = item.barcode || '';

        // Update text hiển thị cho cột “Cập nhật lúc”
        const updatedTd = tds[10];
        if (updatedTd) {
            updatedTd.textContent = item.updated_at;
        }

        // Lưu & rebuild danh mục/tags
        if (typeof dataManager.saveToLocalStorage === 'function') {
            dataManager.saveToLocalStorage();
        }

        if (window.categoryManager) {
            categoryManager.rebuildLists();
        }

        console.log('Inline edit: đã cập nhật item', item);
    }

    exitInlineMode() {
        // Khi tắt sửa trực tiếp, render lại bảng bằng tableRenderer
        if (window.tableRenderer && typeof tableRenderer.render === 'function') {
            tableRenderer.render();
        } else {
            // fallback: chỉ xóa input trong từng ô
            const rows = this.tbody.querySelectorAll('tr');
            rows.forEach(tr => {
                const tds = tr.children;
                for (let i = 1; i <= 9; i++) {
                    const td = tds[i];
                    if (!td) continue;
                    const input = td.querySelector('input');
                    if (input) {
                        td.textContent = input.value;
                    }
                }
            });
        }
    }

    nowString() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
               `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
}

// Khởi động sau khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.inlineTableEditor = new InlineTableEditor();
    } catch (e) {
        console.error('Lỗi khởi tạo InlineTableEditor:', e);
    }
});