// core/table-renderer.js
class TableRenderer {
    constructor() {
        this.itemsBody = document.getElementById('itemsBody');
        this.tableSortState = {
            key: null,
            dir: 1
        };
        this.initializeSortHandlers();
    }

    initializeSortHandlers() {
        const table = document.querySelector('table');
        if (!table) return;
        
        const ths = table.querySelectorAll('thead th');
        const mapping = {
            1: ['barcode', 'string'],
            2: ['name', 'string'],
            4: ['category', 'string'],
            5: ['tags', 'string'],
            6: ['price', 'number'],
            7: ['qty', 'number'],
            8: ['stock', 'number'],
            9: ['note', 'string'],
            10: ['updated_at', 'string']
        };

        ths.forEach((th, idx) => {
            if (!mapping[idx]) return;

            th.style.cursor = 'pointer';
            if (!th.title) {
                th.title = 'Bấm để sắp xếp / bấm lại để đảo chiều';
            }

            th.addEventListener('click', () => {
                const [key, type] = mapping[idx];
                this.sortItemsByKey(key, type);
            });
        });
    }

    sortItemsByKey(key, type = 'string') {
        if (this.tableSortState.key === key) {
            this.tableSortState.dir *= -1;
        } else {
            this.tableSortState.key = key;
            this.tableSortState.dir = 1;
        }

        const dir = this.tableSortState.dir;

        dataManager.items.sort((a, b) => {
            let va = (a && a[key] != null) ? a[key] : '';
            let vb = (b && b[key] != null) ? b[key] : '';

            if (type === 'number') {
                const na = parseFloat(String(va).replace(/[,¥円\s]/g, '')) || 0;
                const nb = parseFloat(String(vb).replace(/[,¥円\s]/g, '')) || 0;
                return (na - nb) * dir;
            }

            va = String(va).toLowerCase();
            vb = String(vb).toLowerCase();

            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });

        this.render();
    }

    render() {
        this.itemsBody.innerHTML = '';
        
        dataManager.items.forEach((item, idx) => {
            const tr = this.createTableRow(item, idx);
            this.itemsBody.appendChild(tr);
        });
    }

    createTableRow(item, idx) {
        const tr = document.createElement('tr');
        tr.dataset.barcode = item.barcode || '';

        const imgSrc = this.makeImageSrc(item.image || '');
        let imgCell = '';
        if (imgSrc) {
            imgCell = `<img src="${imgSrc}" class="img-table-thumb" alt="Ảnh" />`;
        } else if (item.image) {
            imgCell = item.image;
        }

        const barcodeTxt = this.truncate(item.barcode || '', 15);
        const nameTxt = this.truncate(item.name || '', 15);
        const catTxt = this.truncate(item.category || '', 20);
        const tagsTxt = this.truncate(item.tags || '', 20);

        const priceFull = (item.price !== '' && item.price != null) ? String(item.price) : '';
        const priceTxt = this.truncate(priceFull, 4);

        const qtyFull = (item.qty !== '' && item.qty != null) ? String(item.qty) : '';
        const qtyTxt = this.truncate(qtyFull, 3);

        const stockFull = (item.stock !== '' && item.stock != null) ? String(item.stock) : '';
        const stockTxt = this.truncate(stockFull, 4);

        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td title="${item.barcode || ''}">${barcodeTxt}</td>
            <td title="${item.name || ''}">${nameTxt}</td>
            <td>${imgCell}</td>
            <td title="${item.category || ''}">${catTxt}</td>
            <td title="${item.tags || ''}">${tagsTxt}</td>
            <td title="${priceFull}">${priceTxt}</td>
            <td title="${qtyFull}">${qtyTxt}</td>
            <td title="${stockFull}">${stockTxt}</td>
            <td>${item.note || ''}</td>
            <td>${item.updated_at || ''}</td>
            <td><button class="table-delete-btn" data-del-idx="${idx}">Xóa</button></td>
        `;

        // Click to load item to form
        tr.addEventListener('click', () => {
            if (window.formHandler) {
                window.formHandler.loadItemToForm(item);
            }
            document.getElementById('barcodeInput').focus();
            document.getElementById('barcodeInput').select();
        });

        // Delete button
        const delBtn = tr.querySelector('button.table-delete-btn');
        if (delBtn) {
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idxToDel = parseInt(delBtn.getAttribute('data-del-idx'), 10);
                await this.deleteItemAtIndex(idxToDel);
            });
        }

        return tr;
    }

    async deleteItemAtIndex(idx) {
        if (idx < 0 || idx >= dataManager.items.length) return;

        const item = dataManager.items[idx] || {};
        const ok = await this.showDeleteConfirm(item);
        if (!ok) return;

        // Delete from array
        dataManager.items.splice(idx, 1);
        dataManager.saveToLocalStorage();

        // Update UI
        this.render();
        
        if (window.categoryManager) {
            window.categoryManager.rebuildList();
        }

        // If form is showing the deleted item, reset form
        const currentBarcode = document.getElementById('barcodeInput').value.trim();
        if (currentBarcode && currentBarcode === (item.barcode || '')) {
            if (window.formHandler) {
                window.formHandler.resetForm();
            }
        }

        // Auto push to GitHub if token exists
        if (window.githubSync && window.githubSync.githubToken) {
            window.githubSync.pushCSV({ silent: true });
        }
    }

    async showDeleteConfirm(item) {
        const dlg = document.getElementById('deleteDialog');
        const img = document.getElementById('deletePreview');
        const name = document.getElementById('deleteName');
        const barcodeEl = document.getElementById('deleteBarcode');
        const url = document.getElementById('deleteUrl');
        const btnCancel = document.getElementById('deleteCancelBtn');
        const btnConfirm = document.getElementById('deleteConfirmBtn');

        return new Promise((resolve) => {
            // Set content
            const itemName = item.name || '(không tên)';
            const itemBarcode = item.barcode || '';
            const imgSrc = this.makeImageSrc(item.image || '');
            
            name.textContent = `"${itemName}"`;
            barcodeEl.textContent = itemBarcode ? `Mã: ${itemBarcode}` : '';
            url.textContent = item.image || '';
            
            if (imgSrc) {
                img.src = imgSrc;
                img.style.visibility = 'visible';
            } else {
                img.removeAttribute('src');
                img.style.visibility = 'hidden';
            }

            // Cleanup old listeners
            const cleanup = () => {
                btnCancel.onclick = null;
                btnConfirm.onclick = null;
            };

            btnCancel.onclick = () => { cleanup(); dlg.close('cancel'); resolve(false); };
            btnConfirm.onclick = () => { cleanup(); dlg.close('confirm'); resolve(true); };

            dlg.showModal();
        });
    }

    makeImageSrc(imageValue) {
        if (!imageValue) return null;
        const v = imageValue.trim();
        if (!v) return null;
        if (v.startsWith('http') || v.startsWith('data:')) {
            return v;
        }
        if (this.isProbablyBase64(v)) {
            return 'data:image/jpeg;base64,' + v;
        }
        return null;
    }

    isProbablyBase64(str) {
        return /^[A-Za-z0-9+/=]+$/.test(str) && str.length > 100;
    }

    truncate(str, maxLen) {
        if (str === null || str === undefined) return '';
        str = String(str);
        if (str.length <= maxLen) return str;
        if (maxLen <= 1) return str.slice(0, maxLen);
        return str.slice(0, maxLen - 1) + '…';
    }
}

// Khởi tạo khi DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.tableRenderer = new TableRenderer();
});