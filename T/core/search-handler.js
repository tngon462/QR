// core/search-handler.js
class SearchHandler {
    constructor() {
        this.searchNameBtn = document.getElementById('searchNameBtn');
        this.nameInput = document.getElementById('nameInput');
        this.searchResults = document.getElementById('searchResults');
        this.barcodeInput = document.getElementById('barcodeInput');
        
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
            return;
        }
        
        if (partialMatches.length > 1) {
            this.showSearchResults(partialMatches, 'barcode-partial', barcode);
            return;
        }

        // New item - clear form
        this.clearFormForNewItem();
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
                const { saved, allowContinue } = this.autoSaveIfDirty();
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
            document.getElementById('qtyInput').focus();
            document.getElementById('qtyInput').select();
        } else {
            this.barcodeInput.focus();
            this.barcodeInput.select();
        }
    }

    clearFormForNewItem() {
        if (window.formHandler) {
            window.formHandler.resetForm();
        }
        this.barcodeInput.value = this.barcodeInput.value.trim(); // Keep the scanned barcode
    }

    clearSearchResults() {
        this.searchResults.innerHTML = '';
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.searchHandler = new SearchHandler();
});