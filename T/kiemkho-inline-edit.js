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

        this.openDropdown = null;
        this._outsideClickBound = false;

        // Gán sự kiện cho nút ✏️ Sửa trực tiếp bảng
        this.btn.addEventListener('click', () => this.toggle());
    }

    toggle() {
        this.enabled = !this.enabled;

        if (this.enabled) {
            this.btn.textContent = '✅ Đang sửa trực tiếp (bấm lại để tắt)';
            this.btn.classList.add('inline-edit-on');

            // Cờ toàn cục để table-renderer / camera-scanner nhận biết
            window.inlineEditModeOn = true;
            if (document && document.body) {
                document.body.classList.add('inline-edit-on');
            }

            this.enterInlineMode();
        } else {
            this.btn.textContent = '✏️ Sửa trực tiếp bảng';
            this.btn.classList.remove('inline-edit-on');

            window.inlineEditModeOn = false;
            if (document && document.body) {
                document.body.classList.remove('inline-edit-on');
            }

            this.exitInlineMode();
        }
    }

    // Đóng dropdown đang mở (nếu có)
    closeOpenDropdown() {
        if (this.openDropdown && this.openDropdown.parentElement) {
            this.openDropdown.parentElement.removeChild(this.openDropdown);
        }
        this.openDropdown = null;
    }

    enterInlineMode() {
        // Khởi tạo listener click ngoài vùng để đóng dropdown
        if (!this._outsideClickBound) {
            document.addEventListener('click', (e) => {
                if (!this.enabled) return;
                if (!this.openDropdown) return;

                const t = e.target;
                if (
                    t.closest && (
                        t.closest('.inline-category-wrapper') ||
                        t.closest('.inline-tags-wrapper') ||
                        t.closest('.inline-category-dropdown') ||
                        t.closest('.inline-tags-dropdown')
                    )
                ) {
                    return;
                }

                this.closeOpenDropdown();
            });
            this._outsideClickBound = true;
        }

        // Dùng cấu trúc bảng hiện tại:
        // 0: #, 1: barcode, 2: name, 3: img, 4: category, 5: tags,
        // 6: price, 7: qty, 8: stock, 9: note, 10: updated_at, 11: Xóa
        const rows = this.tbody.querySelectorAll('tr');
        const self = this;

        rows.forEach(tr => {
            // Lưu barcode gốc để tìm item trong dataManager.items
            const originalBarcode = tr.dataset.barcode || '';
            tr.dataset.originalBarcode = originalBarcode;

            const tds = tr.children;
            if (tds.length < 11) return;

            // Helper: ô input text bình thường
            const makeInput = (td, fieldName) => {
                if (!td) return null;

                const full = td.getAttribute('title') || td.textContent || '';
                td.innerHTML = '';

                const input = document.createElement('input');
                input.type = 'text';
                input.value = full;
                input.className = 'inline-edit-input';
                input.dataset.field = fieldName;

                td.appendChild(input);

                const stopBubble = (e) => {
                    e.stopPropagation();
                };
                input.addEventListener('mousedown', stopBubble);
                input.addEventListener('click', stopBubble);
                input.addEventListener('touchstart', stopBubble);

                input.addEventListener('blur', () => self.updateItemFromRow(tr));
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        input.blur();
                    }
                });

                return input;
            };

            // Ô danh mục: dropdown 1 lựa chọn
            const makeCategoryCell = (td) => {
                if (!td) return;

                const full = td.getAttribute('title') || td.textContent || '';
                td.innerHTML = '';

                const wrapper = document.createElement('div');
                wrapper.className = 'inline-category-wrapper';

                const display = document.createElement('div');
                display.className = 'inline-category-display';
                display.textContent = full || '+ Chọn danh mục';
                display.title = full || '';

                const hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.value = full;
                hidden.dataset.field = 'category';

                wrapper.appendChild(display);
                wrapper.appendChild(hidden);
                td.appendChild(wrapper);

                const stopBubble = (e) => {
                    e.stopPropagation();
                };
                wrapper.addEventListener('mousedown', stopBubble);
                wrapper.addEventListener('click', (e) => {
                    stopBubble(e);
                    showDropdown();
                });

                const showDropdown = () => {
                    self.closeOpenDropdown();

                    const dropdown = document.createElement('div');
                    dropdown.className = 'inline-category-dropdown';
                    dropdown.style.position = 'absolute';
                    dropdown.style.zIndex = '9999';
                    dropdown.style.background = '#fff';
                    dropdown.style.border = '1px solid #ccc';
                    dropdown.style.maxHeight = '200px';
                    dropdown.style.overflowY = 'auto';
                    dropdown.style.minWidth = '160px';

                    let cats = [];
                    if (window.categoryManager && Array.isArray(categoryManager.categoryOptions)) {
                        cats = categoryManager.categoryOptions.slice();
                    } else if (window.dataManager && Array.isArray(dataManager.items)) {
                        const set = new Set();
                        dataManager.items.forEach((it) => {
                            if (it.category) set.add(it.category);
                        });
                        cats = Array.from(set);
                    }
                    cats.sort((a, b) => a.localeCompare(b, 'vi'));

                    cats.forEach((cat) => {
                        const opt = document.createElement('div');
                        opt.className = 'inline-category-option';
                        opt.textContent = cat;
                        opt.title = cat;
                        opt.style.padding = '4px 8px';
                        opt.style.cursor = 'pointer';

                        opt.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            hidden.value = cat;
                            display.textContent = cat;
                            display.title = cat;
                            td.setAttribute('title', cat);

                            // Liên kết sang tags: thêm tag mặc định nếu có
                            if (window.categoryManager && typeof categoryManager.catToDefaultTag === 'function') {
                                const defTag = categoryManager.catToDefaultTag(cat);
                                if (defTag) {
                                    const tagsTd = tds[5];
                                    if (tagsTd) {
                                        const tagsHidden = tagsTd.querySelector('input[data-field="tags"]');
                                        if (tagsHidden) {
                                            const current = tagsHidden.value
    ? tagsHidden.value.split(/[;,]/).map(t => t.trim()).filter(Boolean)
    : [];

const value = current.join('; ');
                                            const value = current.join(', ');
                                            tagsHidden.value = value;
                                            tagsTd.setAttribute('title', value);
                                            const disp = tagsTd.querySelector('.inline-tags-display');
                                            if (disp) {
                                                disp.textContent = value || '+ Chọn / thêm tag';
                                                disp.title = value;
                                                if (!value) {
                                                    disp.classList.add('tags-placeholder');
                                                } else {
                                                    disp.classList.remove('tags-placeholder');
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            self.closeOpenDropdown();
                            self.updateItemFromRow(tr);
                        });

                        dropdown.appendChild(opt);
                    });

                    if (!cats.length) {
                        const msg = document.createElement('div');
                        msg.textContent = 'Chưa có danh mục, nhập tay ở trên.';
                        msg.style.padding = '4px 8px';
                        dropdown.appendChild(msg);
                    }

                    td.style.position = 'relative';
                    td.appendChild(dropdown);
                    self.openDropdown = dropdown;
                };
            };

            // Ô tags: dropdown nhiều lựa chọn
            const makeTagsCell = (td) => {
                if (!td) return;

                const full = td.getAttribute('title') || td.textContent || '';
                td.innerHTML = '';

                const wrapper = document.createElement('div');
                wrapper.className = 'inline-tags-wrapper';

                const display = document.createElement('div');
                display.className = 'inline-tags-display';
                display.textContent = full || '+ Chọn / thêm tag';
                display.title = full || '';
                if (!full) {
                    display.classList.add('tags-placeholder');
                }

                const hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.value = full;
                hidden.dataset.field = 'tags';

                wrapper.appendChild(display);
                wrapper.appendChild(hidden);
                td.appendChild(wrapper);

                const stopBubble = (e) => {
                    e.stopPropagation();
                };
                wrapper.addEventListener('mousedown', stopBubble);
                wrapper.addEventListener('click', (e) => {
                    stopBubble(e);
                    showTagsDropdown();
                });

                const showTagsDropdown = () => {
                    self.closeOpenDropdown();

                    const dropdown = document.createElement('div');
                    dropdown.className = 'inline-tags-dropdown';
                    dropdown.style.position = 'absolute';
                    dropdown.style.zIndex = '9999';
                    dropdown.style.background = '#fff';
                    dropdown.style.border = '1px solid #ccc';
                    dropdown.style.maxHeight = '220px';
                    dropdown.style.overflowY = 'auto';
                    dropdown.style.minWidth = '200px';
                    dropdown.style.padding = '4px';

                    let allTags = [];
                    if (window.tagsManager && Array.isArray(tagsManager.allTags)) {
                        allTags = tagsManager.allTags.slice();
                    } else if (window.dataManager && Array.isArray(dataManager.items)) {
                        const set = new Set();
                        dataManager.items.forEach((it) => {
                            if (it.tags) {
                                it.tags.split(/[;,]/).forEach((t) => {
                                    const trimmed = t.trim();
                                    if (trimmed) set.add(trimmed);
                                });
                            }
                        });
                        allTags = Array.from(set);
                    }
                    allTags.sort((a, b) => a.localeCompare(b, 'vi'));

                    const current = new Set(
                        hidden.value
                            ? hidden.value.split(',').map(t => t.trim()).filter(Boolean)
                            : []
                    );

                    allTags.forEach((tag) => {
                        const row = document.createElement('label');
                        row.style.display = 'block';
                        row.style.fontSize = '12px';
                        row.style.cursor = 'pointer';
                        row.style.padding = '2px 0';

                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.checked = current.has(tag);
                        cb.style.marginRight = '4px';

                        cb.addEventListener('mousedown', (e) => e.stopPropagation());
                        cb.addEventListener('click', (e) => e.stopPropagation());

                        row.appendChild(cb);
                        row.appendChild(document.createTextNode(tag));

                        row.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cb.checked = !cb.checked;
                        });

                        dropdown.appendChild(row);
                    });

                    const btnRow = document.createElement('div');
                    btnRow.style.marginTop = '4px';
                    btnRow.style.textAlign = 'right';

                    const okBtn = document.createElement('button');
                    okBtn.type = 'button';
                    okBtn.textContent = 'OK';
                    okBtn.style.fontSize = '12px';

                    okBtn.addEventListener('click', (e) => {
                        e.stopPropagation();

                        const newSelected = [];
                        dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                            if (cb.checked) {
                                const label = cb.parentElement;
                                const text = label.textContent.trim();
                                if (text) newSelected.push(text);
                            }
                        });

                        const value = newSelected.join(', ');
                        hidden.value = value;
                        display.textContent = value || '+ Chọn / thêm tag';
                        display.title = value;
                        if (!value) {
                            display.classList.add('tags-placeholder');
                        } else {
                            display.classList.remove('tags-placeholder');
                        }
                        td.setAttribute('title', value);
                        self.closeOpenDropdown();
                        self.updateItemFromRow(tr);
                    });

                    btnRow.appendChild(okBtn);
                    dropdown.appendChild(btnRow);

                    td.style.position = 'relative';
                    td.appendChild(dropdown);
                    self.openDropdown = dropdown;
                };
            };

            // Gán editor cho từng cột
            makeInput(tds[1], 'barcode');
            makeInput(tds[2], 'name');
            // tds[3] = ảnh, giữ nguyên
            makeCategoryCell(tds[4]);
            makeTagsCell(tds[5]);
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
