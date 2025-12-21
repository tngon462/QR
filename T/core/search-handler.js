// core/search-handler.js
class SearchHandler {
    constructor() {
        this.searchNameBtn = document.getElementById('searchNameBtn');
        this.nameInput = document.getElementById('nameInput');
        this.searchResults = document.getElementById('searchResults');
        this.barcodeInput = document.getElementById('barcodeInput');

        // debounce cho barcode
        this._bcTimer = null;
        this._bcLast = '';

        this.bindEvents();
    }

    bindEvents() {
        this.searchNameBtn.addEventListener('click', () => this.searchByName());
        this.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.searchByName();
            }
        });

        // ✅ AUTO SEARCH khi barcode thay đổi (dù scanner gõ trực tiếp hay code set value)
        if (this.barcodeInput) {
            // input: debounce nhẹ để chờ scanner gõ xong
            this.barcodeInput.addEventListener('input', () => {
                const v = (this.barcodeInput.value || '').trim();
                if (!v) {
                    this.clearSearchResults();
                    return;
                }

                if (this._bcTimer) clearTimeout(this._bcTimer);
                this._bcTimer = setTimeout(() => {
                    const code = (this.barcodeInput.value || '').trim();
                    if (!code) return;

                    // tránh gọi lặp vô hạn nếu code khác logic set lại value
                    if (code === this._bcLast) return;
                    this._bcLast = code;

                    this.handleBarcodeSearch(code);
                }, 80); // 80ms đủ để EAN-13 gõ xong
            });

            // Enter: search ngay lập tức
            this.barcodeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const code = (this.barcodeInput.value || '').trim();
                    if (!code) return;
                    this._bcLast = code;
                    this.handleBarcodeSearch(code);
                }
            });
        }
    }

    searchByName() {
        const keyword = (this.nameInput.value || '').trim();
        if (!keyword) {
            alert('Nhập tên sản phẩm cần tìm');
            this.nameInput.focus();
            return;
        }

        const results = dataManager.searchItems(keyword, 'name');
        this.showSearchResults(results, 'name', keyword);
    }

    handleBarcodeSearch(barcode) {
        const exactMatches = dataManager.items.filter(i => i.barcode === barcode);

        if (exactMatches.length === 1) {
            this.loadItemToForm(exactMatches[0]);
            this.focusAfterScan();
            this.clearSearchResults();
            return;
        }

        if (exactMatches.length > 1) {
            this.showSearchResults(exactMatches, 'barcode-exact', barcode);
            return;
        }

        const partialMatches = dataManager.items.filter(i =>
            i.barcode && i.barcode.includes(barcode)
        );

        if (partialMatches.length === 1) {
            this.loadItemToForm(partialMatches[0]);
            this.focusAfterScan();
            this.clearSearchResults();
            return;
        }

        if (partialMatches.length > 1) {
            this.showSearchResults(partialMatches, 'barcode-partial', barcode);
            return;
        }

        // New item - clear form
        this.clearFormForNewItem();
        this.clearSearchResults();
    }

    showSearchResults(results, type, keyword) {
        this.searchResults.innerHTML = '';

        if (!results || !results.length) {
            const div = document.createElement('div');
            div.className = 'search-results-empty';
            div.textContent = 'Không tìm thấy sản phẩm phù hợp.';
            this.searchResults.appendChild(div);
            return;
        }

        const title = document.createElement('div');
        title.className = 'search-results-title';

        if (type === 'name') {
            title.textContent = `Kết quả tìm theo tên "${keyword}":`;
        } else if (type === 'barcode-exact') {
            title.textContent = `Có nhiều mã trùng "${keyword}" – chọn 1 dòng:`;
        } else if (type === 'barcode-partial') {
            title.textContent = `Mã vạch gần đúng "${keyword}" – chọn 1 dòng:`;
        } else {
            title.textContent = 'Kết quả tìm kiếm:';
        }

        this.searchResults.appendChild(title);

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Mã vạch</th><th>Tên</th><th>Danh mục</th></tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        results.forEach((item) => {
            const tr = document.createElement('tr');
            tr.className = 'search-result-row';
            tr.innerHTML = `
                <td>${item.barcode || ''}</td>
                <td>${item.name || ''}</td>
                <td>${item.category || ''}</td>
            `;

            tr.addEventListener('click', () => {
                const { allowContinue } = this.autoSaveIfDirty();
                if (!allowContinue) return;

                this.loadItemToForm(item);
                this.barcodeInput.value = item.barcode || '';
                this.focusAfterScan();
                this.clearSearchResults();
            });

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        this.searchResults.appendChild(table);
    }

    autoSaveIfDirty() {
        const currentBarcode = this.barcodeInput.value.trim();
        if (!currentBarcode) return { saved: false, allowContinue: true };

        if (window.formHandler && window.formHandler.formDirty) {
            const saved = window.formHandler.saveForm();
            return { saved, allowContinue: saved || window.formHandler.lastSaveDecision !== 'missing_edit' };
        }

        return { saved: false, allowContinue: true };
    }

    loadItemToForm(item) {
        if (window.formHandler) {
            window.formHandler.loadItemToForm(item);
        }
    }

    focusAfterScan() {
        const countModeBtn = document.getElementById('countModeBtn');
        const isCountMode = countModeBtn && countModeBtn.classList.contains('count-on');

        if (isCountMode) {
            const q = document.getElementById('qtyInput');
            if (q) { q.focus(); q.select(); }
        } else {
            if (this.barcodeInput) {
                this.barcodeInput.focus();
                this.barcodeInput.select();
            }
        }
    }

    clearFormForNewItem() {
        if (window.formHandler) {
            window.formHandler.resetForm();
        }
        // Keep the scanned barcode
        this.barcodeInput.value = (this.barcodeInput.value || '').trim();
    }

    clearSearchResults() {
        this.searchResults.innerHTML = '';
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.searchHandler = new SearchHandler();
});
